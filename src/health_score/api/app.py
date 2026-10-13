"""API HTTP del motor de scoring. Solo traduce HTTP a la interfaz pública del paquete."""

import os
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, model_validator

from health_score import (
    ClientMetrics,
    ClientScoreResult,
    PortfolioResult,
    ScoreResult,
    ScoringConfig,
    load_config,
    score_client,
    score_portfolio,
)
from health_score.data import ClientRepository, LocalJsonClientRepository
from health_score.models import (
    MetricRange,
    RawClient,
    metric_ranges,
    validate_client_record,
    validation_message,
)
from health_score.scoring import score_client_input

CONFIG_ENV = "HEALTH_SCORE_CONFIG"
DEFAULT_CONFIG_PATH = "config/scoring.json"
CLIENTS_ENV = "HEALTH_SCORE_CLIENTS"
DEFAULT_CLIENTS_PATH = "data/clients.json"


class PortfolioRequest(BaseModel):
    """Cartera a evaluar. Aquí solo se valida la estructura; las métricas de cada
    cliente se validan por separado para que uno inválido no rechace toda la cartera."""

    model_config = ConfigDict(extra="forbid")

    clients: list[RawClient]

    @model_validator(mode="after")
    def _unique_ids(self) -> "PortfolioRequest":
        ids = [client.client_id for client in self.clients]
        duplicates = sorted({cid for cid in ids if ids.count(cid) > 1})
        if duplicates:
            raise ValueError(f"client_id duplicados: {', '.join(duplicates)}")
        return self


def get_config(request: Request) -> ScoringConfig:
    return request.app.state.config


def get_repository(request: Request) -> ClientRepository:
    return request.app.state.repository


ConfigDep = Annotated[ScoringConfig, Depends(get_config)]
RepositoryDep = Annotated[ClientRepository, Depends(get_repository)]


def create_app(config: ScoringConfig, repository: ClientRepository) -> FastAPI:
    app = FastAPI(
        title="Customer Health Score",
        description="Calcula el score de salud (0–100) y el nivel de cada cliente "
        "a partir de cuatro métricas, con pesos y umbrales configurables.",
        version="0.1.0",
    )
    app.state.config = config
    app.state.repository = repository

    @app.exception_handler(RequestValidationError)
    async def spanish_validation_errors(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Mantiene el formato estándar de FastAPI y solo traduce `msg` (spec 002, C2).
        detail = [
            {**error, "msg": validation_message(tuple(error["loc"]), error["type"], error["msg"])}
            for error in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": jsonable_encoder(detail)})

    @app.post(
        "/score",
        response_model=ScoreResult,
        tags=["scoring"],
        summary="Evaluar un cliente",
        description="Recibe las cuatro métricas de un cliente y devuelve el score entero "
        "0–100, el nivel (Top, Estable o En riesgo) y el sub-score de cada métrica.",
        responses={422: {"description": "Alguna métrica falta, está fuera de rango, "
                         "no es entera o viene un campo extra"}},
    )
    def post_score(metrics: ClientMetrics, config: ConfigDep) -> ScoreResult:
        return score_client(metrics, config)

    @app.post(
        "/portfolio/score",
        response_model=PortfolioResult,
        tags=["cartera"],
        summary="Evaluar una cartera enviada en la solicitud",
        description="Evalúa cada cliente por separado y devuelve un resultado por cliente, "
        "en el mismo orden de entrada, más un resumen por nivel. Un cliente con métricas "
        "inválidas trae sus `errors` y no impide evaluar al resto; solo una estructura "
        "inválida (sin `clients`, sin `client_id` o `metrics`, ids duplicados) da 422.",
        responses={422: {"description": "La estructura de la cartera es inválida"}},
    )
    def post_portfolio_score(request: PortfolioRequest, config: ConfigDep) -> PortfolioResult:
        clients = [validate_client_record(raw.model_dump()) for raw in request.clients]
        return score_portfolio(clients, config)

    @app.get(
        "/portfolio",
        response_model=PortfolioResult,
        tags=["cartera"],
        summary="Evaluar la cartera almacenada",
        description="Evalúa todos los clientes de la cartera almacenada con la "
        "configuración activa. Los registros inválidos se reportan con sus `errors`.",
    )
    def get_portfolio(config: ConfigDep, repository: RepositoryDep) -> PortfolioResult:
        return score_portfolio(repository.list_clients(), config)

    @app.get(
        "/clients/{client_id}/score",
        response_model=ClientScoreResult,
        tags=["cartera"],
        summary="Evaluar un cliente de la cartera almacenada",
        description="Busca el cliente por `client_id` en la cartera almacenada y "
        "devuelve su resultado o sus errores de validación.",
        responses={404: {"description": "El cliente no existe en la cartera almacenada"}},
    )
    def get_client_score(
        client_id: str, config: ConfigDep, repository: RepositoryDep
    ) -> ClientScoreResult:
        client = repository.get_client(client_id)
        if client is None:
            raise HTTPException(status_code=404, detail=f"Cliente '{client_id}' no encontrado")
        return score_client_input(client, config)

    @app.get(
        "/config",
        response_model=ScoringConfig,
        tags=["configuración"],
        summary="Ver la configuración activa",
        description="Pesos, umbrales y parámetros de normalización con los que se calculan "
        "los scores. Se cargan de `config/scoring.json` al iniciar el servicio.",
    )
    def get_active_config(config: ConfigDep) -> ScoringConfig:
        return config

    @app.get(
        "/metrics",
        response_model=list[MetricRange],
        tags=["configuración"],
        summary="Ver las métricas y sus rangos",
        description="Rangos válidos de cada métrica de entrada, definidos en un único lugar "
        "del motor. Las interfaces los usan para sus controles sin redefinirlos.",
    )
    def get_metrics() -> list[MetricRange]:
        return metric_ranges()

    return app


def app_from_env() -> FastAPI:
    # Una configuración inválida lanza ConfigError aquí, así el servicio no arranca.
    config = load_config(os.environ.get(CONFIG_ENV, DEFAULT_CONFIG_PATH))
    repository = LocalJsonClientRepository(os.environ.get(CLIENTS_ENV, DEFAULT_CLIENTS_PATH))
    return create_app(config, repository)


app = app_from_env()
