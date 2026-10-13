"""Carga y validación de la configuración del scoring (Principio III)."""

import json
import os
from pathlib import Path
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictFloat,
    StrictInt,
    ValidationError,
    model_validator,
)
from pydantic_core import PydanticCustomError


class ConfigError(Exception):
    """La configuración no existe, no es JSON válido o incumple alguna regla."""


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


# Acepta 25 y 0.5 pero rechaza true y "25", que Pydantic convertiría sin avisar.
Weight = Annotated[StrictInt | StrictFloat, Field(ge=0)]
Percent = Annotated[StrictInt, Field(ge=0, le=100)]
PositiveInt = Annotated[StrictInt, Field(gt=0)]


class Weights(_Frozen):
    """Peso relativo de cada métrica, en cualquier escala; el score divide por la suma."""

    usage: Weight
    support_tickets: Weight
    nps: Weight
    renewal: Weight

    @model_validator(mode="after")
    def _some_weight_is_positive(self) -> "Weights":
        # El score divide por la suma de pesos (research R3).
        if self.usage + self.support_tickets + self.nps + self.renewal == 0:
            raise PydanticCustomError("weights_sum", "la suma de los pesos debe ser mayor que 0")
        return self


class Thresholds(_Frozen):
    """Cortes de nivel: Top si score ≥ top, En riesgo si score < at_risk."""

    top: Annotated[Percent, Field(description="Score mínimo para el nivel Top")]
    at_risk: Annotated[
        Percent, Field(description="Por debajo de este score el cliente está En riesgo")
    ]

    @model_validator(mode="after")
    def _at_risk_below_top(self) -> "Thresholds":
        if self.at_risk >= self.top:
            raise PydanticCustomError("thresholds_order", "at_risk debe ser menor que top")
        return self


class Normalization(_Frozen):
    """Parámetros para llevar tickets y días a una escala 0–100."""

    ticket_cap: Annotated[
        PositiveInt, Field(description="Cantidad de tickets a partir de la cual el sub-score es 0")
    ]
    renewal_horizon_days: Annotated[
        PositiveInt, Field(description="Días a partir de los cuales el sub-score de renovación es 100")
    ]


class ScoringConfig(_Frozen):
    """Configuración del scoring, cargada desde config/scoring.json."""

    weights: Weights
    thresholds: Thresholds
    normalization: Normalization


def _format_errors(error: ValidationError) -> str:
    lines = []
    for item in error.errors():
        path = ".".join(str(part) for part in item["loc"]) or "(raíz)"
        lines.append(f"{path}: {item['msg']}")
    return "; ".join(lines)


def load_config(path: str | os.PathLike) -> ScoringConfig:
    config_path = Path(path)
    try:
        raw = config_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise ConfigError(f"no existe el archivo de configuración: {config_path}") from None
    except OSError as exc:
        raise ConfigError(f"no se pudo leer {config_path}: {exc}") from None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ConfigError(f"{config_path} no es JSON válido: {exc}") from None
    try:
        return ScoringConfig.model_validate(data)
    except ValidationError as exc:
        raise ConfigError(
            f"configuración inválida en {config_path}: {_format_errors(exc)}"
        ) from None
