import importlib
import json
import sys
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from health_score.api.app import app_from_env
from health_score.cuil import check_digit
from health_score.data import StorageError

UNAVAILABLE = {"detail": "La cartera no está disponible en este momento"}


@pytest.fixture
def env(monkeypatch, tmp_path):
    db = tmp_path / "test.db"
    monkeypatch.setenv("HEALTH_SCORE_DB", str(db))
    monkeypatch.setenv("HEALTH_SCORE_CLIENTS", "data/clients.json")
    monkeypatch.setenv("HEALTH_SCORE_CONFIG", "config/scoring.json")
    return db


def test_first_start_loads_portfolio(env):
    client = TestClient(app_from_env())
    assert client.get("/portfolio").json()["summary"]["total"] == 20


def test_restart_keeps_portfolio_without_duplicates(env):
    TestClient(app_from_env()).get("/portfolio")
    portfolio = TestClient(app_from_env()).get("/portfolio").json()
    assert portfolio["summary"]["total"] == 20
    ids = [entry["client_id"] for entry in portfolio["results"]]
    assert len(set(ids)) == 20


def test_missing_seed_file_prevents_startup(env, monkeypatch, tmp_path):
    monkeypatch.setenv("HEALTH_SCORE_CLIENTS", str(tmp_path / "no-existe.json"))
    with pytest.raises(FileNotFoundError):
        app_from_env()


def test_importing_the_module_does_not_touch_the_database(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("HEALTH_SCORE_DB", str(tmp_path / "import.db"))
    monkeypatch.delitem(sys.modules, "health_score.api.app", raising=False)
    module = importlib.import_module("health_score.api.app")
    assert not (tmp_path / "import.db").exists()
    assert not hasattr(module, "app")


def test_corrupt_database_prevents_startup(env):
    env.write_bytes(b"no es una base")
    with pytest.raises(StorageError, match="No se pudo abrir la base de datos"):
        app_from_env()


def test_unavailable_storage_returns_503(env):
    app = app_from_env()
    client = TestClient(app, raise_server_exceptions=False)
    with app.state.repository.engine.begin() as connection:
        connection.execute(text("DROP TABLE clients"))
    for path in ("/portfolio", "/clients"):
        response = client.get(path)
        assert response.status_code == 503
        assert response.json() == UNAVAILABLE


def test_emptied_portfolio_is_not_reloaded(env):
    client = TestClient(app_from_env())
    for record in client.get("/clients").json():
        assert client.delete(f"/clients/{record['client_id']}").status_code == 204
    portfolio = TestClient(app_from_env()).get("/portfolio").json()
    assert portfolio["summary"]["total"] == 0
    assert portfolio["results"] == []


def test_portfolio_of_1000_clients_is_fast(env, monkeypatch, tmp_path):
    # SC-008: cartera completa de 1000 clientes en menos de 2 segundos.
    cuils, body = [], 91000001
    while len(cuils) < 1000:
        digit = check_digit(f"20{body}")
        if digit is not None:
            cuils.append(f"20{body}{digit}")
        body += 1
    records = [
        {
            "client_id": f"F-{i:04d}",
            "cuil": cuil,
            "metrics": {"usage": i % 101, "support_tickets": i % 12, "nps": i % 11,
                        "days_to_renewal": i % 365},
        }
        for i, cuil in enumerate(cuils, start=1)
    ]
    seed = tmp_path / "clients_1000.json"
    seed.write_text(json.dumps(records), encoding="utf-8")
    monkeypatch.setenv("HEALTH_SCORE_CLIENTS", str(seed))
    client = TestClient(app_from_env())
    start = time.perf_counter()
    response = client.get("/portfolio")
    elapsed = time.perf_counter() - start
    assert response.json()["summary"]["total"] == 1000
    assert elapsed < 2
