"""La biblioteca y la API HTTP devuelven lo mismo para la misma entrada (SC-005)."""

import itertools
import random

import pytest
from fastapi.testclient import TestClient

from health_score import METRIC_RANGES, ClientMetrics, Metric, score_client, score_portfolio
from health_score.api.app import create_app
from health_score.models import validate_client_record

QUICKSTART_INPUTS = [(90, 0, 9, 300), (60, 3, 7, 90), (10, 15, 2, 10), (0, 0, 10, 0)]


def boundary_inputs() -> list[tuple[int, ...]]:
    per_metric = []
    for metric in Metric:
        low, high = METRIC_RANGES[metric]
        per_metric.append((low, high if high is not None else 10_000))
    return list(itertools.product(*per_metric))


def random_inputs(count: int = 200) -> list[tuple[int, ...]]:
    rng = random.Random(0)
    return [
        (rng.randint(0, 100), rng.randint(0, 25), rng.randint(0, 10), rng.randint(0, 400))
        for _ in range(count)
    ]


ALL_INPUTS = QUICKSTART_INPUTS + boundary_inputs() + random_inputs()


@pytest.fixture(params=["default", "custom"])
def config(request, default_config, config_factory):
    if request.param == "default":
        return default_config
    return config_factory(
        weights={"usage": 40, "support_tickets": 10, "nps": 30.5, "renewal": 0},
        thresholds={"top": 68, "at_risk": 41},
        normalization={"ticket_cap": 7, "renewal_horizon_days": 365},
    )


@pytest.fixture
def api(config, repository) -> TestClient:
    return TestClient(create_app(config, repository))


def as_metrics(values: tuple[int, ...]) -> dict:
    return dict(zip([metric.value for metric in Metric], values, strict=True))


def test_single_client_parity(config, api):
    for values in ALL_INPUTS:
        body = as_metrics(values)
        library = score_client(ClientMetrics.model_validate(body), config)
        assert api.post("/score", json=body).json() == library.model_dump(mode="json"), values


def test_portfolio_parity(config, api):
    records = [
        {"client_id": f"C-{i:03d}", "name": f"Cliente Ficticio {i}", "metrics": as_metrics(v)}
        for i, v in enumerate(ALL_INPUTS)
    ]
    records.append({"client_id": "C-BAD", "metrics": {**as_metrics((50, 1, 5, 30)), "nps": 11}})

    library = score_portfolio([validate_client_record(r) for r in records], config)
    response = api.post("/portfolio/score", json={"clients": records})

    assert response.status_code == 200
    assert response.json() == library.model_dump(mode="json")
    # El campo metrics (spec 002, C1) también es idéntico: el inválido conserva su valor original.
    assert response.json()["results"][-1]["metrics"]["nps"] == 11
