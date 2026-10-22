import pytest
from pydantic import BaseModel, ValidationError

from health_score.cuil import Cuil, check_digit, normalize_cuil

FORMAT_MESSAGE = "el CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)"
CHECK_DIGIT_MESSAGE = "el dígito verificador del CUIL no es válido"


class Holder(BaseModel):
    cuil: Cuil


def error_of(value) -> dict:
    with pytest.raises(ValidationError) as info:
        Holder(cuil=value)
    (error,) = info.value.errors()
    return error


@pytest.mark.parametrize("value", ["20900000015", "20-90000001-5"])
def test_accepts_with_and_without_dashes(value):
    assert normalize_cuil(value) == "20900000015"
    assert Holder(cuil=value).cuil == "20900000015"


@pytest.mark.parametrize(
    "value",
    [
        "2090000001",
        "209000000150",
        "2090000001A",
        " 20900000015",
        "20900000015 ",
        "20-9000000-15",
        "2-09000001-55",
        "",
        None,
        20900000015,
    ],
)
def test_rejects_bad_format(value):
    error = error_of(value)
    assert error["type"] == "cuil_format"
    assert error["msg"] == FORMAT_MESSAGE


def test_check_digit_examples():
    assert check_digit("2090000001") == 5
    assert check_digit("2090000002") == 3


def test_check_digit_does_not_exist_for_remainder_one():
    assert check_digit("2090000004") is None


@pytest.mark.parametrize("last", [d for d in range(10) if d != 5])
def test_rejects_every_wrong_check_digit(last):
    error = error_of(f"2090000001{last}")
    assert error["type"] == "cuil_check_digit"
    assert error["msg"] == CHECK_DIGIT_MESSAGE


@pytest.mark.parametrize("last", range(10))
def test_body_with_remainder_one_is_always_invalid(last):
    assert error_of(f"2090000004{last}")["type"] == "cuil_check_digit"


def test_leading_zero_is_kept_as_text():
    body = next(
        f"0{n:09d}" for n in range(1, 100) if check_digit(f"0{n:09d}") is not None
    )
    value = body + str(check_digit(body))
    assert Holder(cuil=value).cuil == value
    assert value.startswith("0")
