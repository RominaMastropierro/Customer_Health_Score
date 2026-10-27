import pytest
from pydantic import ValidationError

from health_score import METRIC_RANGES, ClientMetrics, Metric
from health_score.metrics import range_message
from health_score.models import validation_message

VALID = {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}


def with_value(field: str, value) -> dict:
    return {**VALID, field: value}


def boundary_values() -> list[tuple[str, int]]:
    cases = []
    for metric, (low, high) in METRIC_RANGES.items():
        cases.append((metric.value, low))
        cases.append((metric.value, high if high is not None else 10_000))
    return cases


def out_of_range_values() -> list[tuple[str, int]]:
    cases = []
    for metric, (low, high) in METRIC_RANGES.items():
        cases.append((metric.value, low - 1))
        if high is not None:
            cases.append((metric.value, high + 1))
    return cases


def assert_rejected_at(data: dict, field: str) -> None:
    with pytest.raises(ValidationError) as excinfo:
        ClientMetrics.model_validate(data)
    locs = [error["loc"] for error in excinfo.value.errors()]
    assert any(field in loc for loc in locs), locs


@pytest.mark.parametrize(("field", "value"), boundary_values())
def test_accepts_inclusive_limits(field, value):
    metrics = ClientMetrics.model_validate(with_value(field, value))
    assert getattr(metrics, field) == value


def test_range_values_match_constitution():
    assert METRIC_RANGES[Metric.USAGE] == (0, 100)
    assert METRIC_RANGES[Metric.SUPPORT_TICKETS] == (0, None)
    assert METRIC_RANGES[Metric.NPS] == (0, 10)
    assert METRIC_RANGES[Metric.RENEWAL] == (0, None)


@pytest.mark.parametrize(("field", "value"), out_of_range_values())
def test_rejects_out_of_range(field, value):
    assert_rejected_at(with_value(field, value), field)


@pytest.mark.parametrize("field", list(VALID))
@pytest.mark.parametrize("value", [5.0, 2.5, "5", True, None])
def test_rejects_wrong_types(field, value):
    assert_rejected_at(with_value(field, value), field)


@pytest.mark.parametrize("field", list(VALID))
def test_rejects_missing_field(field):
    data = {key: value for key, value in VALID.items() if key != field}
    assert_rejected_at(data, field)


def test_rejects_extra_field():
    assert_rejected_at({**VALID, "churn": 1}, "churn")


def test_is_immutable():
    metrics = ClientMetrics.model_validate(VALID)
    with pytest.raises(ValidationError):
        metrics.usage = 1


# --- Mensajes de cuerpos anidados (spec 003, POST/PUT /clients) ---


@pytest.mark.parametrize("metric", list(Metric))
def test_nested_metric_errors_use_range_message(metric):
    loc = ("body", "metrics", metric.value)
    assert validation_message(loc, "less_than_equal", "Input should be...") == range_message(metric)


def test_nested_structure_errors_keep_priority():
    assert validation_message(("body", "metrics", "nps"), "missing", "x") == "campo obligatorio"


def test_other_nested_errors_pass_through():
    assert validation_message(("body", "cuil"), "cuil_format", "mensaje") == "mensaje"
    assert validation_message(("body", "metrics", "otro"), "int_type", "mensaje") == "mensaje"
