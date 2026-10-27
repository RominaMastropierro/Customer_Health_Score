"""Acceso a la Central de Deudores del BCRA detrás de una interfaz (Principio IV)."""

import json
import logging
from dataclasses import dataclass
from http.client import HTTPException
from typing import Protocol
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from pydantic import ValidationError

from health_score.credit.models import BcraDebtResponse

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Found:
    """El BCRA informó deudas. `raw` es el JSON tal como llegó: se envía completo al modelo."""

    raw: dict
    parsed: BcraDebtResponse


@dataclass(frozen=True)
class NotFound:
    """El BCRA no tiene datos para la identificación (404, sin períodos o sin entidades)."""


@dataclass(frozen=True)
class Unavailable:
    """No se pudo consultar o interpretar al BCRA. `reason` nunca incluye el CUIT."""

    reason: str


BcraLookup = Found | NotFound | Unavailable


class BcraSource(Protocol):
    def lookup(self, digits: str) -> BcraLookup: ...


def interpret_response(raw: object) -> BcraLookup:
    """Valida un JSON del método "Deudas" en el límite (Principio V, research R4)."""
    try:
        parsed = BcraDebtResponse.model_validate(raw)
    except ValidationError as exc:
        return Unavailable(f"respuesta inválida ({type(exc).__name__})")
    periods = parsed.results.periodos
    # Sin períodos o sin entidades en el más reciente no hay deudas que describir.
    if not periods or not max(periods, key=lambda period: period.periodo).entidades:
        return NotFound()
    return Found(raw=raw, parsed=parsed)


class HttpBcraSource:
    """Método "Deudas" de la Central de Deudores, con la biblioteca estándar (research R3).

    Nunca se desactiva la verificación TLS, aunque la cadena del BCRA dé problemas.
    """

    def __init__(self, base_url: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def lookup(self, digits: str) -> BcraLookup:
        result = self._lookup(digits)
        if isinstance(result, Unavailable):
            # Solo el motivo: la URL y la respuesta contienen el CUIT (FR-024).
            logger.warning("BCRA no disponible: %s", result.reason)
        return result

    def _lookup(self, digits: str) -> BcraLookup:
        request = Request(f"{self.base_url}/Deudas/{digits}", headers={"Accept": "application/json"})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            # 404 es el "sin datos" documentado del BCRA, no una falla.
            return NotFound() if exc.code == 404 else Unavailable(f"HTTP {exc.code}")
        except (OSError, HTTPException) as exc:
            # URLError, TimeoutError, TLS y conexiones cortadas a mitad de la respuesta.
            return Unavailable(type(exc).__name__)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            return Unavailable(f"respuesta inválida ({type(exc).__name__})")
        return interpret_response(raw)
