import json
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from health_score import Client
from health_score.data import (
    ClientConflictError,
    SqlClientRepository,
    init_schema,
    make_engine,
    run_initial_seed,
    seed_clients,
    sql,
)
from health_score.data.sql import SeedStateRow
from health_score.models import ClientData

CLIENTS_PATH = Path("data/clients.json")
METRICS = {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}


@pytest.fixture
def engine():
    engine = make_engine("sqlite://")
    init_schema(engine)
    return engine


@pytest.fixture
def store(engine) -> SqlClientRepository:
    seed_clients(engine, CLIENTS_PATH)
    return SqlClientRepository(engine)


def write_seed(tmp_path, records) -> Path:
    path = tmp_path / "seed.json"
    path.write_text(json.dumps(records), encoding="utf-8")
    return path


def seed_done(engine) -> bool:
    with Session(engine) as session:
        return session.scalars(select(SeedStateRow)).first() is not None


# --- Lectura y carga inicial (US1) ---


def test_seed_loads_file_in_order_with_cuil(store):
    clients = store.list_clients()
    assert [c.client_id for c in clients] == [f"C-{i:03d}" for i in range(1, 21)]
    assert all(isinstance(c, Client) and len(c.cuil) == 11 for c in clients)
    assert store.get_client("C-001").cuil == "20900000015"


def test_get_client_compares_exactly(store):
    assert store.get_client("c-001") is None
    assert store.get_client("NO-EXISTE") is None


def test_records_include_cuil(store):
    records = store.list_records()
    assert len(records) == 20
    assert store.get_record("C-002").cuil == "20900000023"


def test_seed_is_idempotent(engine, store):
    before = store.list_records()
    for _ in range(5):
        seed_clients(engine, CLIENTS_PATH)
    assert store.list_records() == before


def test_seed_does_not_overwrite_existing_client(engine, store):
    store.update("C-001", ClientData(cuil="20900000244", name="Editado", metrics=METRICS))
    report = seed_clients(engine, CLIENTS_PATH)
    assert report.inserted == []
    assert store.get_record("C-001").name == "Editado"


def test_seed_skips_invalid_records_and_reports_them(engine, tmp_path):
    path = write_seed(
        tmp_path,
        [
            {"client_id": "C-001", "cuil": "20900000015", "metrics": METRICS},
            {"client_id": "C-002", "cuil": "20900000023", "metrics": {**METRICS, "nps": 11}},
            {"client_id": "C-003", "cuil": "20900000016", "metrics": METRICS},
        ],
    )
    report = seed_clients(engine, path)
    assert report.inserted == ["C-001"]
    assert [item for item, _ in report.skipped] == ["C-002", "C-003"]
    assert "dígito verificador" in report.skipped[1][1]


def test_seed_skips_existing_id_or_cuil(engine, tmp_path):
    seed_clients(engine, CLIENTS_PATH)
    path = write_seed(
        tmp_path,
        [
            {"client_id": "C-001", "cuil": "20900000244", "metrics": METRICS},
            {"client_id": "C-999", "cuil": "20900000015", "metrics": METRICS},
        ],
    )
    report = seed_clients(engine, path)
    assert report.inserted == []
    assert [item for item, _ in report.skipped] == ["C-001", "C-999"]


def test_initial_seed_runs_once(engine):
    report = run_initial_seed(engine, CLIENTS_PATH)
    assert len(report.inserted) == 20
    assert seed_done(engine)
    store = SqlClientRepository(engine)
    for record in store.list_records():
        store.delete(record.client_id)
    assert run_initial_seed(engine, CLIENTS_PATH) is None
    assert store.list_clients() == []


@pytest.mark.parametrize("content", [None, '{"no": "es una lista"}', "no es json"])
def test_initial_seed_fails_without_partial_data(engine, tmp_path, content):
    path = tmp_path / "seed.json"
    if content is not None:
        path.write_text(content, encoding="utf-8")
    with pytest.raises((FileNotFoundError, ValueError)):
        run_initial_seed(engine, path)
    assert SqlClientRepository(engine).list_clients() == []
    assert not seed_done(engine)


# --- Alta con UUID (US2) ---

NEW = ClientData(cuil="20900000244", name="Cliente Ficticio", metrics=METRICS)


def test_create_generates_uuid4(store):
    record = store.create(NEW)
    parsed = uuid.UUID(record.client_id)
    assert parsed.version == 4
    assert str(parsed) == record.client_id
    assert record.cuil == "20900000244"


def test_two_creates_get_distinct_ids(store):
    other = ClientData(cuil="20900000252", metrics=METRICS)
    assert store.create(NEW).client_id != store.create(other).client_id


def test_created_client_is_listed_last_with_cuil(store):
    record = store.create(NEW)
    last = store.list_clients()[-1]
    assert (last.client_id, last.cuil) == (record.client_id, "20900000244")


def test_create_with_existing_cuil_conflicts_and_saves_nothing(store):
    with pytest.raises(ClientConflictError) as info:
        store.create(ClientData(cuil="20900000015", metrics=METRICS))
    assert info.value.field == "cuil"
    assert len(store.list_records()) == 20


def test_generated_id_collision_conflicts(store, monkeypatch):
    existing = store.create(NEW)
    monkeypatch.setattr(sql.uuid, "uuid4", lambda: uuid.UUID(existing.client_id))
    with pytest.raises(ClientConflictError) as info:
        store.create(ClientData(cuil="20900000252", metrics=METRICS))
    assert info.value.field == "client_id"


def test_id_and_cuil_collision_reports_id_first(store, monkeypatch):
    existing = store.create(NEW)
    monkeypatch.setattr(sql.uuid, "uuid4", lambda: uuid.UUID(existing.client_id))
    with pytest.raises(ClientConflictError) as info:
        store.create(NEW)
    assert info.value.field == "client_id"


# --- Actualizar (US4) ---


def test_update_replaces_data_and_keeps_identity(store):
    position = [r.client_id for r in store.list_records()].index("C-002")
    data = ClientData(cuil="20900000244", name="Nuevo nombre", metrics={**METRICS, "nps": 10})
    record = store.update("C-002", data)
    assert (record.client_id, record.cuil, record.name) == ("C-002", "20900000244", "Nuevo nombre")
    assert record.metrics.nps == 10
    assert [r.client_id for r in store.list_records()].index("C-002") == position


def test_update_with_own_cuil_is_not_a_conflict(store):
    data = ClientData(cuil="20900000023", name="Globex Demo", metrics=METRICS)
    assert store.update("C-002", data).cuil == "20900000023"


def test_update_with_cuil_of_other_client_conflicts(store):
    before = store.get_record("C-002")
    with pytest.raises(ClientConflictError) as info:
        store.update("C-002", ClientData(cuil="20900000015", metrics=METRICS))
    assert info.value.field == "cuil"
    assert store.get_record("C-002") == before


def test_update_unknown_client_returns_none(store):
    assert store.update("C-999", NEW) is None
    assert len(store.list_records()) == 20


# --- Eliminar (US5) ---


def test_delete_removes_client(store):
    assert store.delete("C-001") is True
    assert store.get_record("C-001") is None
    assert "C-001" not in [c.client_id for c in store.list_clients()]


def test_delete_unknown_client_returns_false(store):
    assert store.delete("C-999") is False


def test_deleted_cuil_can_be_reused_with_new_id(store):
    store.delete("C-001")
    record = store.create(ClientData(cuil="20900000015", metrics=METRICS))
    assert record.client_id != "C-001"
    assert uuid.UUID(record.client_id).version == 4
