import pytest
from fastapi.testclient import TestClient

from conftest import DEFAULT_CONFIG_DATA, merge
from health_score import METRIC_RANGES, ConfigError
from health_score.metrics import range_message
from health_score.api.app import app_from_env, create_app

INTERMEDIATE = {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}


# --- POST /score (US1) ---


def test_score_returns_contract_example(client):
    response = client.post("/score", json=INTERMEDIATE)
    assert response.status_code == 200
    assert response.json() == {
        "score": 63,
        "level": "Estable",
        "sub_scores": {"usage": 60.0, "support_tickets": 70.0, "nps": 70.0, "renewal": 50.0},
    }


def test_score_rejects_nps_out_of_range(client):
    response = client.post("/score", json={**INTERMEDIATE, "nps": 11})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert any("nps" in error["loc"] for error in detail)
    # La forma estándar se conserva; solo el texto sale de range_message (spec 002, C2).
    assert detail[0]["msg"] == "debe ser un entero entre 0 y 10"
    assert detail[0]["type"] == "less_than_equal"


@pytest.mark.parametrize(
    "body",
    [
        {**INTERMEDIATE, "support_tickets": 2.5},
        {**INTERMEDIATE, "usage": "60"},
        {key: value for key, value in INTERMEDIATE.items() if key != "nps"},
        {**INTERMEDIATE, "churn": 1},
    ],
    ids=["decimal", "string", "missing", "extra"],
)
def test_score_rejects_invalid_bodies(client, body):
    assert client.post("/score", json=body).status_code == 422


@pytest.mark.parametrize(
    ("body", "loc", "msg"),
    [
        ({**INTERMEDIATE, "support_tickets": 2.5}, ["body", "support_tickets"],
         "debe ser un entero mayor o igual a 0"),
        ({**INTERMEDIATE, "usage": "60"}, ["body", "usage"], "debe ser un entero entre 0 y 100"),
        ({key: value for key, value in INTERMEDIATE.items() if key != "nps"}, ["body", "nps"],
         "campo obligatorio"),
        ({**INTERMEDIATE, "churn": 1}, ["body", "churn"], "campo no permitido"),
    ],
    ids=["decimal", "string", "missing", "extra"],
)
def test_score_422_messages_in_spanish(client, body, loc, msg):
    detail = client.post("/score", json=body).json()["detail"]
    assert all(set(error) >= {"loc", "msg", "type"} for error in detail)
    assert {"loc": loc, "msg": msg} in [{"loc": e["loc"], "msg": e["msg"]} for e in detail]


# --- GET /metrics (spec 002, C3) ---


def test_metrics_endpoint_matches_metric_ranges(client):
    response = client.get("/metrics")
    assert response.status_code == 200
    assert response.json() == [
        {"name": metric.value, "min": low, "max": high, "message": range_message(metric)}
        for metric, (low, high) in METRIC_RANGES.items()
    ]


# --- GET /config y cambio de configuracion (US2) ---


def test_config_endpoint_returns_active_config(client):
    response = client.get("/config")
    assert response.status_code == 200
    assert response.json() == DEFAULT_CONFIG_DATA


def test_lower_top_threshold_changes_level(config_factory, repository):
    config = config_factory(thresholds={"top": 60, "at_risk": 50})
    custom = TestClient(create_app(config, repository))
    body = custom.post("/score", json=INTERMEDIATE).json()
    assert (body["score"], body["level"]) == (63, "Top")


def test_invalid_config_prevents_startup(monkeypatch, write_config):
    bad = merge(DEFAULT_CONFIG_DATA, {"thresholds": {"top": 75, "at_risk": 80}})
    monkeypatch.setenv("HEALTH_SCORE_CONFIG", str(write_config(bad)))
    with pytest.raises(ConfigError, match="thresholds"):
        app_from_env()


# --- Cartera (US3) ---

PORTFOLIO_REQUEST = {
    "clients": [
        {
            "client_id": "C-001",
            "name": "Acme Ficticia",
            "metrics": {"usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300},
        },
        {
            "client_id": "C-002",
            "metrics": {"usage": 120, "support_tickets": 1, "nps": 8, "days_to_renewal": 60},
        },
    ]
}

PORTFOLIO_RESPONSE = {
    "results": [
        {
            "client_id": "C-001",
            "name": "Acme Ficticia",
            "metrics": {"usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300},
            "result": {
                "score": 95,
                "level": "Top",
                "sub_scores": {
                    "usage": 90.0,
                    "support_tickets": 100.0,
                    "nps": 90.0,
                    "renewal": 100.0,
                },
            },
            "errors": None,
        },
        {
            "client_id": "C-002",
            "name": None,
            "metrics": {"usage": 120, "support_tickets": 1, "nps": 8, "days_to_renewal": 60},
            "result": None,
            "errors": [{"field": "metrics.usage", "message": "debe ser un entero entre 0 y 100"}],
        },
    ],
    "summary": {"total": 2, "by_level": {"Top": 1, "Estable": 0, "En riesgo": 0}, "invalid": 1},
}


def test_portfolio_score_returns_contract_example(client):
    response = client.post("/portfolio/score", json=PORTFOLIO_REQUEST)
    assert response.status_code == 200
    assert response.json() == PORTFOLIO_RESPONSE


def test_empty_portfolio(client):
    response = client.post("/portfolio/score", json={"clients": []})
    assert response.status_code == 200
    assert response.json()["summary"] == {
        "total": 0,
        "by_level": {"Top": 0, "Estable": 0, "En riesgo": 0},
        "invalid": 0,
    }


VALID_METRICS = INTERMEDIATE


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"clients": {"client_id": "C-001", "metrics": VALID_METRICS}},
        {"clients": [{"metrics": VALID_METRICS}]},
        {"clients": [{"client_id": "C-001"}]},
        {"clients": [{"client_id": "C-001", "metrics": 5}]},
        {
            "clients": [
                {"client_id": "C-001", "metrics": VALID_METRICS},
                {"client_id": "C-001", "metrics": VALID_METRICS},
            ]
        },
    ],
    ids=["no-clients", "not-a-list", "no-client-id", "no-metrics", "metrics-not-object", "dup"],
)
def test_portfolio_score_rejects_bad_structure(client, body):
    assert client.post("/portfolio/score", json=body).status_code == 422


def test_stored_portfolio(client):
    response = client.get("/portfolio")
    assert response.status_code == 200
    summary = response.json()["summary"]
    assert summary["total"] == 3
    assert sum(summary["by_level"].values()) + summary["invalid"] == summary["total"]
    assert summary["invalid"] == 1


def test_stored_client_score(client):
    response = client.get("/clients/C-001/score")
    assert response.status_code == 200
    body = response.json()
    assert body["client_id"] == "C-001"
    assert body["result"]["score"] == 95
    assert body["errors"] is None


def test_stored_portfolio_includes_metrics(client):
    results = client.get("/portfolio").json()["results"]
    assert all("metrics" in entry for entry in results)


def test_stored_invalid_client_keeps_original_metrics(client):
    body = client.get("/clients/C-003/score").json()
    assert body["metrics"]["nps"] == 11
    assert body["result"] is None


def test_unknown_client_returns_404(client):
    response = client.get("/clients/NO-EXISTE/score")
    assert response.status_code == 404
    assert response.json() == {"detail": "Cliente 'NO-EXISTE' no encontrado"}


# --- OpenAPI (US4) ---

EXPECTED_ENDPOINTS = {
    ("/score", "post"): "ScoreResult",
    ("/portfolio/score", "post"): "PortfolioResult",
    ("/portfolio", "get"): "PortfolioResult",
    ("/clients/{client_id}/score", "get"): "ClientScoreResult",
    ("/config", "get"): "ScoringConfig",
}


@pytest.fixture
def openapi(client) -> dict:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    return response.json()


@pytest.mark.parametrize(("path", "method"), list(EXPECTED_ENDPOINTS))
def test_openapi_declares_endpoint_and_response_model(openapi, path, method):
    operation = openapi["paths"][path][method]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema["$ref"].endswith("/" + EXPECTED_ENDPOINTS[(path, method)])
    assert operation.get("summary")
    assert operation.get("description")


@pytest.mark.parametrize("path", ["/score", "/portfolio/score"])
def test_openapi_posts_declare_422(openapi, path):
    assert "422" in openapi["paths"][path]["post"]["responses"]


def test_openapi_declares_metrics_endpoint(openapi):
    operation = openapi["paths"]["/metrics"]["get"]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema["type"] == "array"
    assert schema["items"]["$ref"].endswith("/MetricRange")
    assert operation.get("summary")


def test_openapi_client_score_declares_404(openapi):
    assert "404" in openapi["paths"]["/clients/{client_id}/score"]["get"]["responses"]


def test_openapi_schemas_use_data_model_field_names(openapi):
    schemas = openapi["components"]["schemas"]
    expected = {
        "ClientMetrics": {"usage", "support_tickets", "nps", "days_to_renewal"},
        "ScoreResult": {"score", "level", "sub_scores"},
        "SubScores": {"usage", "support_tickets", "nps", "renewal"},
        "ClientScoreResult": {"client_id", "name", "metrics", "result", "errors"},
        "PortfolioResult": {"results", "summary"},
        "PortfolioSummary": {"total", "by_level", "invalid"},
        "FieldError": {"field", "message"},
        "ScoringConfig": {"weights", "thresholds", "normalization"},
    }
    for name, fields in expected.items():
        assert set(schemas[name]["properties"]) == fields, name
    assert schemas["HealthLevel"]["enum"] == ["Top", "Estable", "En riesgo"]


# --- Rendimiento (SC-002) ---


def test_single_score_under_one_second(client):
    import time

    start = time.perf_counter()
    response = client.post("/score", json=INTERMEDIATE)
    assert response.status_code == 200
    assert time.perf_counter() - start < 1
