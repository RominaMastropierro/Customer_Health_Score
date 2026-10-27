import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from health_score import ScoringConfig
from health_score.api.app import create_app
from health_score.credit.bcra import Found
from health_score.credit.models import BcraDebtResponse
from health_score.models import ClientInput, validate_client_record

DEFAULT_CONFIG_DATA = {
    "weights": {"usage": 25, "support_tickets": 25, "nps": 25, "renewal": 25},
    "thresholds": {"top": 75, "at_risk": 50},
    "normalization": {"ticket_cap": 10, "renewal_horizon_days": 180},
}


def merge(base: dict, overrides: dict) -> dict:
    merged = dict(base)
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = merge(merged[key], value)
        else:
            merged[key] = value
    return merged


@pytest.fixture
def default_config() -> ScoringConfig:
    return ScoringConfig.model_validate(DEFAULT_CONFIG_DATA)


@pytest.fixture
def config_factory():
    def factory(**overrides) -> ScoringConfig:
        return ScoringConfig.model_validate(merge(DEFAULT_CONFIG_DATA, overrides))

    return factory


@pytest.fixture
def write_config(tmp_path):
    def write(data, name: str = "scoring.json"):
        path = tmp_path / name
        text = data if isinstance(data, str) else json.dumps(data)
        path.write_text(text, encoding="utf-8")
        return path

    return write


STORED_RECORDS = [
    {
        "client_id": "C-001",
        "name": "Acme Ficticia",
        "metrics": {"usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300},
    },
    {
        "client_id": "C-002",
        "name": "Globex Demo",
        "metrics": {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90},
    },
    {
        "client_id": "C-003",
        "name": "Initech Inventada",
        "metrics": {"usage": 60, "support_tickets": 3, "nps": 11, "days_to_renewal": 90},
    },
]


class InMemoryClientRepository:
    def __init__(self, records: list[dict]):
        self._clients = [validate_client_record(record) for record in records]

    def list_clients(self) -> list[ClientInput]:
        return list(self._clients)

    def get_client(self, client_id: str) -> ClientInput | None:
        return next((c for c in self._clients if c.client_id == client_id), None)


@pytest.fixture
def repository() -> InMemoryClientRepository:
    return InMemoryClientRepository(STORED_RECORDS)


@pytest.fixture
def client(default_config, repository) -> TestClient:
    return TestClient(create_app(default_config, repository))


# --- Consulta al BCRA (spec 005): fuentes simuladas, nunca el BCRA ni el modelo reales ---

BCRA_FIXTURES = Path(__file__).parent / "fixtures" / "bcra"
FAKE_SUMMARY = "Texto ficticio del resumen."


def read_bcra(name: str) -> dict:
    return json.loads((BCRA_FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


def found(name: str) -> Found:
    raw = read_bcra(name)
    return Found(raw=raw, parsed=BcraDebtResponse.model_validate(raw))


class FakeBcraSource:
    def __init__(self, result):
        self.result = result
        self.calls: list[str] = []

    def lookup(self, digits: str):
        self.calls.append(digits)
        return self.result


class FakeSummarizer:
    def __init__(self, text: str | None = FAKE_SUMMARY):
        self.text = text
        self.calls: list[tuple] = []

    def summarize(self, raw: dict, facts):
        self.calls.append((raw, facts))
        return self.text
