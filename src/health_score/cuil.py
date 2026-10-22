"""Regla del CUIT/CUIL: normalización, formato y dígito verificador (único lugar, Principio VI).

Módulo puro, sin I/O, para reutilizarlo en el alta, la edición y la carga inicial.
"""

import re
from typing import Annotated

from pydantic import BeforeValidator, Field
from pydantic_core import PydanticCustomError

# Solo 11 dígitos, o guiones exactamente en las posiciones canónicas (spec 003, FR-029).
CUIL_PATTERN = re.compile(r"^\d{11}$|^\d{2}-\d{8}-\d$")
WEIGHTS = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)

FORMAT_MESSAGE = "el CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)"
CHECK_DIGIT_MESSAGE = "el dígito verificador del CUIL no es válido"


def check_digit(first10: str) -> int | None:
    """Dígito verificador oficial (módulo 11). None si el resto es 1: no existe dígito válido."""
    remainder = sum(int(digit) * weight for digit, weight in zip(first10, WEIGHTS)) % 11
    if remainder == 0:
        return 0
    if remainder == 1:
        return None
    return 11 - remainder


def normalize_cuil(value: object) -> str:
    # Un número JSON se rechaza: como texto se preservan los ceros iniciales (FR-028).
    if not isinstance(value, str) or not CUIL_PATTERN.match(value):
        raise PydanticCustomError("cuil_format", FORMAT_MESSAGE)
    digits = value.replace("-", "")
    expected = check_digit(digits[:10])
    if expected is None or expected != int(digits[10]):
        raise PydanticCustomError("cuil_check_digit", CHECK_DIGIT_MESSAGE)
    return digits


Cuil = Annotated[
    str,
    BeforeValidator(normalize_cuil),
    Field(
        description="CUIT/CUIL: 11 dígitos, con o sin guiones (XX-XXXXXXXX-X); "
        "se devuelve sin guiones",
        examples=["20900000015"],
    ),
]
