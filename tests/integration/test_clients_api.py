import uuid

import pytest
from fastapi.testclient import TestClient

from health_score.api.app import create_app
from health_score.cuil import CHECK_DIGIT_MESSAGE as CUIL_CHECK_DIGIT_MESSAGE
from health_score.cuil import FORMAT_MESSAGE as CUIL_FORMAT_MESSAGE
from health_score.cuil import check_digit
from health_score.data import SqlClientRepository, init_schema, make_engine, seed_clients
from health_score.metrics import Metric, range_message

METRICS = {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}
NEW = {"cuil": "20900000244", "name": "Cliente Ficticio", "metrics": METRICS}


@pytest.fixture
def api(default_config) -> TestClient:
    engine = make_engine("sqlite://")
    init_schema(engine)
    seed_clients(engine, "data/clients.json")
    return TestClient(create_app(default_config, SqlClientRepository(engine)))


def errors_of(response) -> list[dict]:
    assert response.status_code == 422
    return [{"loc": e["loc"], "msg": e["msg"]} for e in response.json()["detail"]]


def count(api) -> int:
    return len(api.get("/clients").json())


# --- Crear y consultar (US2) ---


def test_create_returns_record_with_generated_uuid(api):
    response = api.post("/clients", json=NEW)
    assert response.status_code == 201
    body = response.json()
    assert uuid.UUID(body["client_id"]).version == 4
    assert body == {**NEW, "client_id": body["client_id"]}
    assert response.headers["location"] == f"/clients/{body['client_id']}"


def test_created_client_can_be_read_and_appears_in_portfolio(api):
    created = api.post("/clients", json=NEW).json()
    client_id = created["client_id"]
    assert api.get(f"/clients/{client_id}").json() == created

    records = api.get("/clients").json()
    assert len(records) == 21
    assert records[-1] == created
    assert set(records[0]) == {"client_id", "cuil", "name", "metrics"}

    expected = api.post("/score", json=METRICS).json()
    entry = next(e for e in api.get("/portfolio").json()["results"] if e["client_id"] == client_id)
    assert entry["result"] == expected
    assert entry["cuil"] == "20900000244"
    assert api.get(f"/clients/{client_id}/score").json()["cuil"] == "20900000244"


def test_duplicate_cuil_conflicts(api):
    api.post("/clients", json=NEW)
    response = api.post("/clients", json=NEW)
    assert response.status_code == 409
    assert response.json() == {"detail": "El CUIL '20900000244' ya está registrado en otro cliente"}
    assert count(api) == 21


def test_duplicate_cuil_with_dashes_conflicts(api):
    response = api.post("/clients", json={**NEW, "cuil": "20-90000001-5"})
    assert response.status_code == 409
    assert "20900000015" in response.json()["detail"]


def test_client_id_in_body_is_rejected(api):
    response = api.post("/clients", json={**NEW, "client_id": "C-999"})
    assert {"loc": ["body", "client_id"], "msg": "campo no permitido"} in errors_of(response)
    assert count(api) == 20


def test_missing_cuil_is_rejected(api):
    data = {k: v for k, v in NEW.items() if k != "cuil"}
    assert {"loc": ["body", "cuil"], "msg": "campo obligatorio"} in errors_of(
        api.post("/clients", json=data)
    )


def test_unknown_client_returns_404(api):
    response = api.get("/clients/NO-EXISTE")
    assert response.status_code == 404
    assert response.json() == {"detail": "Cliente 'NO-EXISTE' no encontrado"}


# --- Validación estricta (US3) ---

METRIC_NAMES = {
    "usage": Metric.USAGE,
    "support_tickets": Metric.SUPPORT_TICKETS,
    "nps": Metric.NPS,
    "days_to_renewal": Metric.RENEWAL,
}
OUT_OF_RANGE = [
    ("usage", -1), ("usage", 101), ("nps", -1), ("nps", 11),
    ("support_tickets", -1), ("days_to_renewal", -1),
]
BAD_TYPES = [2.5, "60", True, None]


def free_cuil(index: int) -> str:
    # CUIL sintéticos libres (cuerpos 91000000 + n), distintos de los 20 de la carga inicial;
    # si el cuerpo no tiene dígito válido se salta de a 1000 para no chocar con otro índice.
    body = 91000000 + index
    while check_digit(f"20{body}") is None:
        body += 1000
    return f"20{body}{check_digit(f'20{body}')}"


def with_metric(name: str, value) -> dict:
    return {**NEW, "metrics": {**METRICS, name: value}}


@pytest.mark.parametrize(("name", "value"), OUT_OF_RANGE)
def test_out_of_range_metric_is_rejected(api, name, value):
    errors = errors_of(api.post("/clients", json=with_metric(name, value)))
    assert errors == [
        {"loc": ["body", "metrics", name], "msg": range_message(METRIC_NAMES[name])}
    ]
    assert count(api) == 20


@pytest.mark.parametrize("name", list(METRIC_NAMES))
@pytest.mark.parametrize("value", BAD_TYPES, ids=repr)
def test_bad_metric_type_is_rejected(api, name, value):
    errors = errors_of(api.post("/clients", json=with_metric(name, value)))
    assert [e["loc"] for e in errors] == [["body", "metrics", name]]
    assert count(api) == 20


def test_missing_metric_and_extra_fields_are_rejected(api):
    metrics = {k: v for k, v in METRICS.items() if k != "nps"}
    body = {**NEW, "metrics": {**metrics, "extra": 1}, "otro": 1}
    errors = errors_of(api.post("/clients", json=body))
    assert {"loc": ["body", "metrics", "nps"], "msg": "campo obligatorio"} in errors
    assert {"loc": ["body", "metrics", "extra"], "msg": "campo no permitido"} in errors
    assert {"loc": ["body", "otro"], "msg": "campo no permitido"} in errors
    assert count(api) == 20


@pytest.mark.parametrize(
    ("index", "name", "value"),
    [(1, "usage", 0), (2, "usage", 100), (3, "nps", 0), (4, "nps", 10),
     (5, "support_tickets", 0), (6, "days_to_renewal", 0)],
)
def test_boundary_values_are_accepted(api, index, name, value):
    body = {**with_metric(name, value), "cuil": free_cuil(index)}
    assert api.post("/clients", json=body).status_code == 201


def test_cuil_with_and_without_dashes_is_stored_normalized(api):
    plain = free_cuil(7)
    dashed = free_cuil(8)
    dashed_input = f"{dashed[:2]}-{dashed[2:10]}-{dashed[10]}"
    assert api.post("/clients", json={**NEW, "cuil": plain}).json()["cuil"] == plain
    assert api.post("/clients", json={**NEW, "cuil": dashed_input}).json()["cuil"] == dashed


@pytest.mark.parametrize(
    "value",
    ["2090000001", "209000000150", "2090000001A", " 20900000244", "20-9000002-44",
     20900000244, None, ""],
    ids=repr,
)
def test_bad_cuil_format_is_rejected(api, value):
    errors = errors_of(api.post("/clients", json={**NEW, "cuil": value}))
    assert errors == [{"loc": ["body", "cuil"], "msg": CUIL_FORMAT_MESSAGE}]
    assert count(api) == 20


def test_bad_check_digit_is_rejected(api):
    errors = errors_of(api.post("/clients", json={**NEW, "cuil": "20900000016"}))
    assert errors == [{"loc": ["body", "cuil"], "msg": CUIL_CHECK_DIGIT_MESSAGE}]


def test_several_invalid_fields_are_reported_together(api):
    body = {**with_metric("usage", 101), "cuil": "20900000016"}
    locs = [e["loc"] for e in errors_of(api.post("/clients", json=body))]
    assert ["body", "cuil"] in locs
    assert ["body", "metrics", "usage"] in locs


def test_validation_wins_over_conflict(api):
    # Mismos 10 primeros dígitos que el CUIL de C-001, con otro dígito verificador.
    response = api.post("/clients", json={**NEW, "cuil": "20900000016"})
    assert response.status_code == 422


def test_invalid_json_body_is_rejected(api):
    response = api.post(
        "/clients", content="{no es json", headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)


# --- Actualizar (US4) ---

UPDATE = {"cuil": "20900000244", "name": "Globex Editada", "metrics": {**METRICS, "nps": 10}}


def test_update_is_reflected_everywhere(api):
    before = api.get("/clients/C-002/score").json()["result"]
    response = api.put("/clients/C-002", json=UPDATE)
    assert response.status_code == 200
    assert response.json() == {**UPDATE, "client_id": "C-002"}
    assert api.get("/clients/C-002").json() == {**UPDATE, "client_id": "C-002"}
    score = api.get("/clients/C-002/score").json()
    assert score["cuil"] == "20900000244"
    assert score["result"] == api.post("/score", json=UPDATE["metrics"]).json()
    assert score["result"] != before
    entry = next(e for e in api.get("/portfolio").json()["results"] if e["client_id"] == "C-002")
    assert entry["name"] == "Globex Editada"


def test_update_with_own_cuil_is_accepted(api):
    body = {**UPDATE, "cuil": "20900000023"}
    assert api.put("/clients/C-002", json=body).status_code == 200


@pytest.mark.parametrize("cuil", ["20900000015", "20-90000001-5"])
def test_update_with_cuil_of_other_client_conflicts(api, cuil):
    before = api.get("/clients/C-002").json()
    response = api.put("/clients/C-002", json={**UPDATE, "cuil": cuil})
    assert response.status_code == 409
    assert api.get("/clients/C-002").json() == before


@pytest.mark.parametrize(
    "body",
    [
        {**UPDATE, "cuil": "2090000002"},
        {**UPDATE, "cuil": "20900000024"},
        {**UPDATE, "metrics": {**METRICS, "usage": 101}},
        {**UPDATE, "client_id": "C-002"},
    ],
    ids=["formato", "digito", "metrica", "client_id"],
)
def test_invalid_update_is_rejected_without_changes(api, body):
    before = api.get("/clients/C-002").json()
    assert api.put("/clients/C-002", json=body).status_code == 422
    assert api.get("/clients/C-002").json() == before


def test_update_client_id_in_body_message(api):
    errors = errors_of(api.put("/clients/C-002", json={**UPDATE, "client_id": "C-002"}))
    assert {"loc": ["body", "client_id"], "msg": "campo no permitido"} in errors


def test_update_unknown_client_returns_404(api):
    response = api.put("/clients/C-999", json=UPDATE)
    assert response.status_code == 404
    assert response.json() == {"detail": "Cliente 'C-999' no encontrado"}
    assert count(api) == 20


# --- Eliminar (US5) ---


def test_delete_removes_client_everywhere(api):
    response = api.delete("/clients/C-001")
    assert response.status_code == 204
    assert response.content == b""
    assert api.get("/clients/C-001").status_code == 404
    assert api.get("/clients/C-001/score").status_code == 404
    summary = api.get("/portfolio").json()["summary"]
    assert summary["total"] == 19
    assert sum(summary["by_level"].values()) + summary["invalid"] == summary["total"]


def test_deleted_cuil_can_be_reused(api):
    api.delete("/clients/C-001")
    response = api.post("/clients", json={**NEW, "cuil": "20900000015"})
    assert response.status_code == 201
    assert response.json()["client_id"] != "C-001"


def test_delete_unknown_client_returns_404(api):
    response = api.delete("/clients/C-999")
    assert response.status_code == 404
    assert response.json() == {"detail": "Cliente 'C-999' no encontrado"}
