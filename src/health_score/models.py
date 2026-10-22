"""Modelos Pydantic que validan las entradas en el límite y describen los resultados."""

from enum import Enum
from typing import Annotated, Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    ValidationError,
    model_validator,
)

from health_score.cuil import Cuil
from health_score.metrics import METRIC_RANGES, Metric, range_message


def _metric_field(metric: Metric, description: str) -> Any:
    low, high = METRIC_RANGES[metric]
    return Annotated[StrictInt, Field(ge=low, le=high, description=description)]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ClientMetrics(_Frozen):
    """Las cuatro métricas de un cliente. Solo se aceptan enteros dentro de su rango."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}]
        }
    )

    usage: _metric_field(Metric.USAGE, "Porcentaje de uso del producto")
    support_tickets: _metric_field(
        Metric.SUPPORT_TICKETS, "Tickets de soporte abiertos en los últimos 30 días"
    )
    nps: _metric_field(Metric.NPS, "Puntaje NPS individual del cliente")
    days_to_renewal: _metric_field(Metric.RENEWAL, "Días que faltan para la renovación")


class HealthLevel(str, Enum):
    TOP = "Top"
    STABLE = "Estable"
    AT_RISK = "En riesgo"


SubScore = Annotated[float, Field(ge=0, le=100, description="Sub-score normalizado a 0–100")]


class SubScores(_Frozen):
    """Aporte de cada métrica, normalizado a 0–100 y redondeado a 2 decimales."""

    usage: SubScore
    support_tickets: SubScore
    nps: SubScore
    renewal: SubScore


class ScoreResult(_Frozen):
    """Resultado de evaluar un cliente válido."""

    score: Annotated[int, Field(ge=0, le=100, description="Score de salud ponderado, entero")]
    level: Annotated[HealthLevel, Field(description="Nivel según los umbrales configurados")]
    sub_scores: Annotated[SubScores, Field(description="Aporte de cada métrica (0–100)")]


class FieldError(_Frozen):
    """Un campo inválido y el motivo."""

    field: Annotated[str, Field(description="Ruta del campo", examples=["metrics.nps"])]
    message: Annotated[
        str, Field(description="Motivo", examples=["debe ser un entero entre 0 y 10"])
    ]


ClientId = Annotated[
    str,
    Field(
        min_length=1,
        description="Identificador único del cliente: el original en la carga inicial o un "
        "UUID generado por el servicio",
        examples=["C-001", "3f2b8c1e-9a4d-4e7b-8c21-5d6f0a9b1c2d"],
    ),
]
ClientName = Annotated[
    str | None, Field(description="Nombre ficticio del cliente", examples=["Acme Ficticia"])
]


class Client(_Frozen):
    """Cliente de la cartera con métricas válidas."""

    client_id: ClientId
    # Identifica al cliente persistido; el scoring lo copia al resultado sin usarlo (spec 003).
    cuil: str | None = None
    name: ClientName = None
    metrics: ClientMetrics


class InvalidClient(_Frozen):
    """Registro de cartera que no pasó la validación; se reporta sin cortar la evaluación."""

    # None solo cuando el propio registro almacenado no trae un client_id utilizable.
    client_id: str | None
    cuil: str | None = None
    name: str | None = None
    errors: list[FieldError]
    # Se conserva tal como llegó para que las interfaces muestren el dato que hay que corregir.
    metrics: dict[str, Any] | None = None


ClientInput = Client | InvalidClient


class RawClient(_Frozen):
    """Estructura de un cliente de cartera antes de validar sus métricas (research R5)."""

    client_id: ClientId
    name: ClientName = None
    metrics: Annotated[
        dict[str, Any], Field(description="Las cuatro métricas; se validan por cliente")
    ]


class ClientScoreResult(_Frozen):
    """Resultado de un cliente de la cartera: trae `result` o `errors`, nunca ambos."""

    client_id: str | None
    name: str | None
    metrics: Annotated[
        dict[str, Any] | None,
        Field(
            description="Métricas tal como se recibieron; en un cliente inválido pueden estar "
            "fuera de rango o no ser numéricas"
        ),
    ]
    result: Annotated[ScoreResult | None, Field(description="Presente si el cliente es válido")]
    errors: Annotated[
        list[FieldError] | None, Field(description="Presente si el cliente es inválido")
    ]

    @model_validator(mode="after")
    def _exactly_one_outcome(self) -> "ClientScoreResult":
        if (self.result is None) == (self.errors is None):
            raise ValueError("debe tener result o errors, y no ambos")
        return self


class ClientData(_Frozen):
    """Datos que envía quien crea o edita un cliente. El `client_id` lo genera el servicio."""

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "cuil": "20900000244",
                    "name": "Cliente Ficticio",
                    "metrics": {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90},
                }
            ]
        }
    )

    cuil: Cuil
    name: ClientName = None
    metrics: ClientMetrics


class SeedClient(ClientData):
    """Registro del archivo de la carga inicial: conserva su identificador original."""

    client_id: ClientId


class ClientRecord(_Frozen):
    """Cliente guardado, tal como lo devuelve el CRUD."""

    client_id: ClientId
    cuil: Annotated[str, Field(description="CUIL, 11 dígitos sin guiones")]
    name: ClientName = None
    metrics: ClientMetrics


class PortfolioSummary(_Frozen):
    """Conteos de la cartera: Top + Estable + En riesgo + invalid = total."""

    total: Annotated[int, Field(description="Cantidad de clientes recibidos")]
    by_level: Annotated[
        dict[str, int],
        Field(
            description="Clientes válidos por nivel; las tres claves siempre están presentes",
            examples=[{"Top": 1, "Estable": 0, "En riesgo": 0}],
        ),
    ]
    invalid: Annotated[int, Field(description="Clientes con errores de validación")]


class PortfolioResult(_Frozen):
    """Resultado de evaluar una cartera."""

    results: Annotated[
        list[ClientScoreResult], Field(description="Un resultado por cliente, en orden de entrada")
    ]
    summary: PortfolioSummary


class StoredClientScoreResult(ClientScoreResult):
    """Resultado de un cliente de la cartera almacenada: suma su CUIL (spec 003, FR-034).

    Es un modelo aparte para que `ClientScoreResult` (respuesta de `POST /portfolio/score`)
    conserve su contrato exacto de las specs 001 y 002.
    """

    cuil: Annotated[
        str | None,
        Field(description="CUIL del cliente, 11 dígitos sin guiones; null si no lo tiene"),
    ] = None


class StoredPortfolioResult(PortfolioResult):
    """Resultado de evaluar la cartera almacenada: cada cliente trae su CUIL."""

    results: Annotated[
        list[StoredClientScoreResult],
        Field(description="Un resultado por cliente, en orden de alta"),
    ]


_STRUCTURE_MESSAGES = {
    "missing": "campo obligatorio",
    "extra_forbidden": "campo no permitido",
}


def validation_message(loc: tuple, error_type: str, default: str) -> str:
    """Texto en español de un error de validación de un cuerpo HTTP (spec 002, C2).

    Sale de las mismas fuentes que los errores de cartera, así ninguna interfaz necesita
    conocer los rangos para explicar un rechazo.
    """
    if error_type in _STRUCTURE_MESSAGES:
        return _STRUCTURE_MESSAGES[error_type]
    metric_names = {metric.value for metric in Metric}
    if len(loc) == 2 and loc[0] == "body" and loc[1] in metric_names:
        return range_message(Metric(loc[1]))
    # Alta y edición de clientes (spec 003): las métricas llegan anidadas en `metrics`.
    if len(loc) == 3 and loc[:2] == ("body", "metrics") and loc[2] in metric_names:
        return range_message(Metric(loc[2]))
    return default


class MetricRange(_Frozen):
    """Rango válido de una métrica de entrada, derivado de METRIC_RANGES."""

    name: Annotated[Metric, Field(description="Métrica de entrada")]
    min: Annotated[int, Field(description="Extremo inferior inclusivo")]
    max: Annotated[int | None, Field(description="Extremo superior inclusivo; null = sin tope")]
    message: Annotated[str, Field(description="Regla de la métrica en lenguaje natural")]


def metric_ranges() -> list[MetricRange]:
    return [
        MetricRange(name=metric, min=low, max=high, message=range_message(metric))
        for metric, (low, high) in METRIC_RANGES.items()
    ]


def _structure_errors(error: ValidationError) -> list[FieldError]:
    return [
        FieldError(
            field=".".join(str(part) for part in item["loc"]) or "registro",
            message=_STRUCTURE_MESSAGES.get(item["type"], item["msg"]),
        )
        for item in error.errors()
    ]


def _metric_errors(error: ValidationError) -> list[FieldError]:
    errors = []
    for item in error.errors():
        name = str(item["loc"][0])
        message = _STRUCTURE_MESSAGES.get(item["type"]) or range_message(Metric(name))
        errors.append(FieldError(field=f"metrics.{name}", message=message))
    return errors


def validate_client_record(raw: Any) -> ClientInput:
    """Valida un registro de cartera y lo convierte en Client o InvalidClient.

    Cada cliente se valida por separado para que uno inválido no invalide la cartera
    entera (FR-014).
    """
    try:
        record = RawClient.model_validate(raw)
    except ValidationError as exc:
        client_id = raw.get("client_id") if isinstance(raw, dict) else None
        name = raw.get("name") if isinstance(raw, dict) else None
        metrics = raw.get("metrics") if isinstance(raw, dict) else None
        return InvalidClient(
            client_id=client_id if isinstance(client_id, str) and client_id else None,
            name=name if isinstance(name, str) else None,
            errors=_structure_errors(exc),
            metrics=metrics if isinstance(metrics, dict) else None,
        )
    try:
        metrics = ClientMetrics.model_validate(record.metrics)
    except ValidationError as exc:
        return InvalidClient(
            client_id=record.client_id,
            name=record.name,
            errors=_metric_errors(exc),
            metrics=record.metrics,
        )
    return Client(client_id=record.client_id, name=record.name, metrics=metrics)
