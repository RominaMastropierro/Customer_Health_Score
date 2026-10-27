"""Modelos de la consulta crediticia (spec 005): solicitud, respuesta del BCRA y resultado.

Nada de esto se persiste (FR-024): cada modelo vive solo durante una solicitud.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from health_score.cuil import Cuil

CreditTone = Literal["positive", "warning", "risk"]
CreditStatusKind = Literal["with_debts", "no_data", "bcra_unavailable", "summary_unavailable"]


class CreditStatusRequest(BaseModel):
    """Cuerpo de `POST /credit-status`. El CUIT va en el cuerpo para que no quede en los
    access logs (research R1)."""

    model_config = ConfigDict(extra="forbid")

    cuil: Cuil


class _BcraModel(BaseModel):
    # Se toleran campos nuevos del BCRA; solo se exige la estructura que se usa (R4).
    model_config = ConfigDict(extra="ignore")


class BcraEntity(_BcraModel):
    entidad: str
    situacion: int | None = Field(
        default=None, description="Fuera de 1–5 se acepta pero no cuenta para el tono"
    )
    monto: float | None = Field(default=None, description="Miles de pesos; None no suma al total")
    diasAtrasoPago: int | None = Field(default=None, description="0 = no aplicable")
    fechaSit1: str | None = None
    refinanciaciones: bool = False
    recategorizacionOblig: bool = False
    situacionJuridica: bool = False
    irrecDisposicionTecnica: bool = False
    enRevision: bool = False
    procesoJud: bool = False


class BcraPeriod(_BcraModel):
    periodo: Annotated[str, Field(pattern=r"^\d{6}$")]
    entidades: list[BcraEntity]


class BcraResults(_BcraModel):
    identificacion: int
    denominacion: str | None = None
    periodos: list[BcraPeriod]


class BcraDebtResponse(_BcraModel):
    """Respuesta del método "Deudas" de la Central de Deudores, con los nombres del manual."""

    status: int
    results: BcraResults


class CreditFacts(BaseModel):
    """Datos calculados sin IA sobre el período más reciente (research R8)."""

    model_config = ConfigDict(frozen=True)

    period_label: str
    worst_situation: int | None
    worst_entity: str | None
    entity_count: int
    total_pesos: str
    max_days_late: int
    tone: CreditTone | None


class CreditStatus(BaseModel):
    """Resultado de la consulta, con el texto listo para mostrar."""

    status: Annotated[
        CreditStatusKind,
        Field(
            description="with_debts: el BCRA informa deudas y `message` es el resumen; "
            "no_data: el BCRA no registra deudas; bcra_unavailable: no se pudo consultar al "
            "BCRA; summary_unavailable: el BCRA respondió pero no se pudo preparar el resumen"
        ),
    ]
    tone: Annotated[
        CreditTone | None,
        Field(
            description="Nivel visual según la peor situación del período más reciente "
            "(1 positive, 2 warning, 3 a 5 risk). Solo con with_debts; null en los demás "
            "casos o si ninguna entidad informa una situación válida"
        ),
    ] = None
    message: Annotated[str, Field(description="Texto en español listo para mostrar")]
