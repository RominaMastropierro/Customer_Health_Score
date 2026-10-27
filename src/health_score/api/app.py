"""API HTTP del motor de scoring. Solo traduce HTTP a la interfaz pública del paquete."""

import logging
import os
from pathlib import Path
from typing import Annotated

import anthropic
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, model_validator
from sqlalchemy.exc import DatabaseError, SQLAlchemyError

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
from health_score.credit import (
    BcraSource,
    ClaudeSummarizer,
    CreditStatus,
    CreditStatusRequest,
    HttpBcraSource,
    Summarizer,
    check_credit,
    load_prompt,
)
from health_score.credit.demo import load_demo
from health_score.data import (
    ClientConflictError,
    ClientRepository,
    ClientStore,
    SqlClientRepository,
    StorageError,
    init_schema,
    make_engine,
    run_initial_seed,
)
from health_score.models import (
    ClientData,
    ClientInput,
    ClientRecord,
    MetricRange,
    RawClient,
    StoredClientScoreResult,
    StoredPortfolioResult,
    metric_ranges,
    validate_client_record,
    validation_message,
)
from health_score.scoring import score_client_input

CONFIG_ENV = "HEALTH_SCORE_CONFIG"
DEFAULT_CONFIG_PATH = "config/scoring.json"
CLIENTS_ENV = "HEALTH_SCORE_CLIENTS"
DEFAULT_CLIENTS_PATH = "data/clients.json"
DB_ENV = "HEALTH_SCORE_DB"
DEFAULT_DB_PATH = "data/health_score.db"
BCRA_URL_ENV = "HEALTH_SCORE_BCRA_URL"
DEFAULT_BCRA_URL = "https://api.bcra.gob.ar/CentralDeDeudores/v1.0"
SUMMARY_PROMPT_ENV = "HEALTH_SCORE_SUMMARY_PROMPT"
DEFAULT_SUMMARY_PROMPT_PATH = "config/prompts/bcra-summary.md"
SUMMARY_MODEL_ENV = "HEALTH_SCORE_SUMMARY_MODEL"
DEFAULT_SUMMARY_MODEL = "claude-opus-5-5"
# Ruta del secreto con la API key (Docker: /run/secrets/anthropic_api_key); nunca la clave.
API_KEY_FILE_ENV = "ANTHROPIC_API_KEY_FILE"
API_KEY_ENV = "ANTHROPIC_API_KEY"
# Carpeta de fixtures ficticios; si está definida, el BCRA y el modelo se simulan (solo demos).
DEMO_FIXTURES_ENV = "HEALTH_SCORE_DEMO_FIXTURES"

UNAVAILABLE_MESSAGE = "La cartera no está disponible en este momento"
UNAVAILABLE_RESPONSE = {503: {"description": "No se puede acceder a la base de datos"}}
NOT_FOUND_RESPONSE = {404: {"description": "El cliente no existe"}}
CONFLICT_RESPONSE = {409: {"description": "El CUIL (o el identificador) ya pertenece a otro cliente"}}
INVALID_RESPONSE = {422: {"description": "Algún campo falta, es inválido o no está permitido"}}

logger = logging.getLogger(__name__)


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


def not_found(client_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Cliente '{client_id}' no encontrado")


def get_config(request: Request) -> ScoringConfig:
    return request.app.state.config


def get_repository(request: Request) -> ClientRepository:
    return request.app.state.repository


def get_store(request: Request) -> ClientStore:
    repository = request.app.state.repository
    # Las pruebas de las specs 001 y 002 usan fuentes de solo lectura (research R8).
    if not isinstance(repository, ClientStore):
        raise HTTPException(
            status_code=501, detail="La fuente de datos configurada no admite escritura"
        )
    return repository


ConfigDep = Annotated[ScoringConfig, Depends(get_config)]
RepositoryDep = Annotated[ClientRepository, Depends(get_repository)]
StoreDep = Annotated[ClientStore, Depends(get_store)]


def _stored_result(client: ClientInput, config: ScoringConfig) -> StoredClientScoreResult:
    # El CUIL no entra al scoring: se agrega al resultado ya calculado (spec 003, FR-034).
    return StoredClientScoreResult(
        **score_client_input(client, config).model_dump(), cuil=client.cuil
    )


def create_app(
    config: ScoringConfig,
    repository: ClientRepository,
    credit_source: BcraSource | None = None,
    summarizer: Summarizer | None = None,
) -> FastAPI:
    app = FastAPI(
        title="Customer Health Score",
        description="Calcula el score de salud (0–100) y el nivel de cada cliente "
        "a partir de cuatro métricas, con pesos y umbrales configurables.",
        version="0.1.0",
    )
    app.state.config = config
    app.state.repository = repository
    # Sin fuentes (p. ej. en las pruebas previas), la consulta al BCRA nunca sale a la red.
    app.state.credit_source = credit_source
    app.state.summarizer = summarizer

    @app.exception_handler(RequestValidationError)
    async def spanish_validation_errors(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Mantiene el formato estándar de FastAPI y solo traduce `msg` (spec 002, C2).
        detail = [
            {**error, "msg": validation_message(tuple(error["loc"]), error["type"], error["msg"])}
            for error in exc.errors()
        ]
        return JSONResponse(status_code=422, content={"detail": jsonable_encoder(detail)})

    @app.exception_handler(ClientConflictError)
    async def client_conflict(_: Request, exc: ClientConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": exc.message})

    @app.exception_handler(SQLAlchemyError)
    async def storage_unavailable(_: Request, exc: SQLAlchemyError) -> JSONResponse:
        # Los conflictos de unicidad ya los traduce el repositorio a 409; aquí llegan solo
        # fallas del almacenamiento, que nunca deben devolver datos parciales.
        logger.error("Error de almacenamiento", exc_info=exc)
        return JSONResponse(status_code=503, content={"detail": UNAVAILABLE_MESSAGE})

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
        response_model=StoredPortfolioResult,
        tags=["cartera"],
        summary="Evaluar la cartera almacenada",
        description="Evalúa todos los clientes de la cartera almacenada con la "
        "configuración activa. Cada resultado incluye el `cuil` del cliente. Los registros "
        "inválidos se reportan con sus `errors`.",
        responses=UNAVAILABLE_RESPONSE,
    )
    def get_portfolio(config: ConfigDep, repository: RepositoryDep) -> StoredPortfolioResult:
        clients = repository.list_clients()
        portfolio = score_portfolio(clients, config)
        return StoredPortfolioResult(
            results=[_stored_result(client, config) for client in clients],
            summary=portfolio.summary,
        )

    @app.get(
        "/clients/{client_id}/score",
        response_model=StoredClientScoreResult,
        tags=["cartera"],
        summary="Evaluar un cliente de la cartera almacenada",
        description="Busca el cliente por `client_id` en la cartera almacenada y "
        "devuelve su resultado o sus errores de validación, junto con su `cuil`.",
        responses={
            404: {"description": "El cliente no existe en la cartera almacenada"},
            **UNAVAILABLE_RESPONSE,
        },
    )
    def get_client_score(
        client_id: str, config: ConfigDep, repository: RepositoryDep
    ) -> StoredClientScoreResult:
        client = repository.get_client(client_id)
        if client is None:
            raise not_found(client_id)
        return _stored_result(client, config)

    @app.post(
        "/clients",
        status_code=201,
        response_model=ClientRecord,
        tags=["clientes"],
        summary="Crear un cliente",
        description="Guarda un cliente nuevo con su CUIL, nombre opcional y métricas. El "
        "`client_id` lo genera el servicio (UUID) y no se envía en el cuerpo. El CUIL se "
        "acepta con o sin guiones y se devuelve sin guiones.",
        responses={**CONFLICT_RESPONSE, **INVALID_RESPONSE, **UNAVAILABLE_RESPONSE},
    )
    def post_client(data: ClientData, response: Response, store: StoreDep) -> ClientRecord:
        record = store.create(data)
        response.headers["Location"] = f"/clients/{record.client_id}"
        return record

    @app.get(
        "/clients",
        response_model=list[ClientRecord],
        tags=["clientes"],
        summary="Listar los clientes",
        description="Todos los clientes guardados, en orden de alta, con su CUIL.",
        responses=UNAVAILABLE_RESPONSE,
    )
    def list_clients(store: StoreDep) -> list[ClientRecord]:
        return store.list_records()

    @app.get(
        "/clients/{client_id}",
        response_model=ClientRecord,
        tags=["clientes"],
        summary="Consultar un cliente",
        description="Devuelve el identificador, el CUIL, el nombre y las métricas del cliente.",
        responses={**NOT_FOUND_RESPONSE, **UNAVAILABLE_RESPONSE},
    )
    def get_client(client_id: str, store: StoreDep) -> ClientRecord:
        record = store.get_record(client_id)
        if record is None:
            raise not_found(client_id)
        return record

    @app.put(
        "/clients/{client_id}",
        response_model=ClientRecord,
        tags=["clientes"],
        summary="Actualizar un cliente",
        description="Reemplaza CUIL, nombre y métricas; el identificador no cambia y no se "
        "envía en el cuerpo. El CUIL nuevo se valida igual que en el alta.",
        responses={
            **NOT_FOUND_RESPONSE,
            **CONFLICT_RESPONSE,
            **INVALID_RESPONSE,
            **UNAVAILABLE_RESPONSE,
        },
    )
    def put_client(client_id: str, data: ClientData, store: StoreDep) -> ClientRecord:
        record = store.update(client_id, data)
        if record is None:
            raise not_found(client_id)
        return record

    @app.delete(
        "/clients/{client_id}",
        status_code=204,
        response_class=Response,
        tags=["clientes"],
        summary="Eliminar un cliente",
        description="Elimina el cliente de forma definitiva; su CUIL queda libre.",
        responses={**NOT_FOUND_RESPONSE, **UNAVAILABLE_RESPONSE},
    )
    def delete_client(client_id: str, store: StoreDep) -> Response:
        if not store.delete(client_id):
            raise not_found(client_id)
        return Response(status_code=204)

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

    @app.post(
        "/credit-status",
        response_model=CreditStatus,
        tags=["crédito"],
        summary="Consultar la situación crediticia en el BCRA",
        description="Valida el CUIT/CUIL, consulta la Central de Deudores del BCRA y "
        "devuelve un texto listo para mostrar. `status` indica el resultado: `with_debts` "
        "(el texto es un resumen redactado por un modelo de IA y `tone` es el nivel visual), "
        "`no_data` (el BCRA no registra deudas), `bcra_unavailable` (no se pudo consultar al "
        "BCRA) o `summary_unavailable` (el BCRA respondió pero no se pudo preparar el "
        "resumen). El CUIT va en el cuerpo para que no quede en los logs, y nada de la "
        "consulta se guarda ni se registra.",
        responses=INVALID_RESPONSE,
    )
    def post_credit_status(data: CreditStatusRequest, request: Request) -> CreditStatus:
        return check_credit(data.cuil, request.app.state.credit_source, request.app.state.summarizer)

    return app


def _api_key_from_env() -> str | None:
    path = os.environ.get(API_KEY_FILE_ENV)
    if path:
        try:
            return Path(path).read_text(encoding="utf-8").strip() or None
        except OSError:
            return None
    return os.environ.get(API_KEY_ENV, "").strip() or None


def _summarizer_from_env(prompt: str, model: str) -> Summarizer | None:
    """Resumidor con la API key del secreto o de la variable de entorno (research R7).

    No se usa el perfil de `ant auth login`: no hay forma fiable de detectarlo al arrancar.
    Tampoco alcanza con construir `anthropic.Anthropic()`: sin credenciales no falla al
    crearse sino en cada solicitud.
    """
    api_key = _api_key_from_env()
    if api_key is None:
        # Una sola advertencia al arrancar: el resto de la aplicación funciona igual (FR-029).
        logger.warning("Sin credenciales del modelo: la consulta al BCRA no podrá resumir")
        return None
    return ClaudeSummarizer(prompt, model, anthropic.Anthropic(api_key=api_key))


def app_from_env() -> FastAPI:
    """Factory del servicio: `uvicorn health_score.api.app:app_from_env --factory`.

    No se crea la app al importar el módulo para que importarlo (p. ej. en las pruebas) no
    abra la base ni ejecute la carga inicial.
    """
    # Una configuración inválida lanza ConfigError aquí, así el servicio no arranca.
    config = load_config(os.environ.get(CONFIG_ENV, DEFAULT_CONFIG_PATH))
    db_path = os.environ.get(DB_ENV, DEFAULT_DB_PATH)
    engine = make_engine(f"sqlite:///{db_path}")
    try:
        init_schema(engine)
        report = run_initial_seed(engine, os.environ.get(CLIENTS_ENV, DEFAULT_CLIENTS_PATH))
    except DatabaseError as exc:
        raise StorageError(f"No se pudo abrir la base de datos '{db_path}': {exc}") from exc
    if report is not None:
        logger.info("Carga inicial: %d clientes insertados", len(report.inserted))
        for item, reason in report.skipped:
            logger.warning("Carga inicial: se omitió %s (%s)", item, reason)
    # Un prompt ausente o vacío lanza ConfigError aquí, como scoring.json.
    prompt = load_prompt(os.environ.get(SUMMARY_PROMPT_ENV, DEFAULT_SUMMARY_PROMPT_PATH))
    demo_fixtures = os.environ.get(DEMO_FIXTURES_ENV)
    if demo_fixtures:
        # Las demostraciones nunca usan el BCRA ni el modelo reales (Principio IX).
        logger.warning("Modo demostración: BCRA y modelo simulados")
        credit_source, summarizer = load_demo(demo_fixtures)
    else:
        model = os.environ.get(SUMMARY_MODEL_ENV, DEFAULT_SUMMARY_MODEL)
        credit_source = HttpBcraSource(os.environ.get(BCRA_URL_ENV, DEFAULT_BCRA_URL))
        summarizer = _summarizer_from_env(prompt, model)
    return create_app(
        config, SqlClientRepository(engine), credit_source=credit_source, summarizer=summarizer
    )
