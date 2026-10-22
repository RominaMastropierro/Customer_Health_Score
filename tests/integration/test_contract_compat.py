"""Los endpoints existentes conservan su contrato con la cartera persistida (FR-019/020, SC-001)."""

import pytest
from fastapi.testclient import TestClient

from health_score.api.app import create_app
from health_score.data import (
    LocalJsonClientRepository,
    SqlClientRepository,
    init_schema,
    make_engine,
    seed_clients,
)

CLIENTS_PATH = "data/clients.json"
PREVIOUS_FIELDS = ("client_id", "name", "metrics", "result", "errors")


@pytest.fixture
def json_api(default_config) -> TestClient:
    return TestClient(create_app(default_config, LocalJsonClientRepository(CLIENTS_PATH)))


@pytest.fixture
def sql_api(default_config) -> TestClient:
    engine = make_engine("sqlite://")
    init_schema(engine)
    seed_clients(engine, CLIENTS_PATH)
    return TestClient(create_app(default_config, SqlClientRepository(engine)))


def test_portfolio_matches_json_source(json_api, sql_api):
    before = json_api.get("/portfolio").json()
    after = sql_api.get("/portfolio").json()
    assert after["summary"] == before["summary"]
    for old, new in zip(before["results"], after["results"], strict=True):
        assert {k: new[k] for k in PREVIOUS_FIELDS} == {k: old[k] for k in PREVIOUS_FIELDS}
        assert len(new["cuil"]) == 11


def test_client_score_includes_cuil(json_api, sql_api):
    old = json_api.get("/clients/C-001/score").json()
    new = sql_api.get("/clients/C-001/score").json()
    assert {k: new[k] for k in PREVIOUS_FIELDS} == {k: old[k] for k in PREVIOUS_FIELDS}
    assert new["cuil"] == "20900000015"


def test_portfolio_score_keeps_its_contract(sql_api):
    body = {
        "clients": [
            {
                "client_id": "X-1",
                "metrics": {"usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300},
            }
        ]
    }
    (entry,) = sql_api.post("/portfolio/score", json=body).json()["results"]
    assert set(entry) == set(PREVIOUS_FIELDS)


def test_portfolio_score_rejects_cuil_in_request(sql_api):
    body = {
        "clients": [
            {
                "client_id": "X-1",
                "cuil": "20900000015",
                "metrics": {"usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300},
            }
        ]
    }
    response = sql_api.post("/portfolio/score", json=body)
    assert response.status_code == 422
    assert {"loc": ["body", "clients", 0, "cuil"], "msg": "campo no permitido"} in [
        {"loc": e["loc"], "msg": e["msg"]} for e in response.json()["detail"]
    ]


def test_score_endpoint_unchanged(sql_api):
    body = {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}
    assert set(sql_api.post("/score", json=body).json()) == {"score", "level", "sub_scores"}
