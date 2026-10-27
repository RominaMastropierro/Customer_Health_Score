"""Modo demostración (spec 005, T045b): BCRA y modelo simulados, nunca los reales.

La constitución (v2.4.0, Principio IX) exige que las demostraciones usen versiones simuladas.
"""

import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import read_bcra
from health_score.api import app as app_module
from health_score.credit import bcra
from health_score.credit.bcra import Found, NotFound, Unavailable
from health_score.credit.demo import load_demo
from health_score.credit.service import (
    BCRA_UNAVAILABLE_MESSAGE,
    NO_DATA_MESSAGE,
    SUMMARY_UNAVAILABLE_MESSAGE,
    check_credit,
    compute_facts,
)

FIXTURES = Path(__file__).parents[1] / "fixtures"
INDEX = json.loads((FIXTURES / "bcra-demo.json").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def unreachable(*args, **kwargs):
        raise AssertionError("el modo demo no debe salir a la red")

    monkeypatch.setattr(bcra, "urlopen", unreachable)


@pytest.fixture
def demo():
    return load_demo(FIXTURES)


@pytest.mark.parametrize(
    ("digits", "entry"),
    [(d, e) for d, e in INDEX.items() if e["fixture"] != "estructura-invalida.json"],
)
def test_found_with_queried_identification(demo, digits, entry):
    source, _ = demo
    result = source.lookup(digits)

    assert isinstance(result, Found)
    expected = read_bcra(entry["fixture"].removesuffix(".json"))
    expected["results"]["identificacion"] = int(digits)
    assert result.raw == expected


def test_invalid_structure_is_unavailable(demo):
    source, _ = demo
    (digits,) = [d for d, e in INDEX.items() if e["fixture"] == "estructura-invalida.json"]
    assert isinstance(source.lookup(digits), Unavailable)


def test_cuit_outside_index_is_no_data(demo):
    source, _ = demo
    assert source.lookup("20900000015") == NotFound()


def test_demo_summary_includes_calculated_facts(demo):
    source, summarizer = demo
    found = source.lookup("20900000244")
    facts = compute_facts(found.parsed)

    text = summarizer.summarize(found.raw, facts)

    assert text.startswith("[Demostración]")
    for value in [facts.period_label, str(facts.worst_situation), str(facts.entity_count), facts.total_pesos]:
        assert value in text


@pytest.mark.parametrize(
    ("digits", "status", "message"),
    [
        ("20900000244", "with_debts", None),
        ("20900000066", "summary_unavailable", SUMMARY_UNAVAILABLE_MESSAGE),
        ("20900000058", "bcra_unavailable", BCRA_UNAVAILABLE_MESSAGE),
        ("20900000015", "no_data", NO_DATA_MESSAGE),
    ],
)
def test_check_credit_end_to_end(demo, digits, status, message):
    result = check_credit(digits, *demo)
    assert result.status == status
    if message:
        assert result.message == message


@pytest.fixture
def demo_env(monkeypatch, tmp_path):
    monkeypatch.setenv("HEALTH_SCORE_DB", str(tmp_path / "demo.db"))
    monkeypatch.setenv("HEALTH_SCORE_CLIENTS", "data/clients.json")
    monkeypatch.setenv("HEALTH_SCORE_CONFIG", "config/scoring.json")
    monkeypatch.setenv("HEALTH_SCORE_DEMO_FIXTURES", str(FIXTURES))

    def real_source_forbidden(*args, **kwargs):
        raise AssertionError("el modo demo no debe construir fuentes reales")

    monkeypatch.setattr(app_module, "HttpBcraSource", real_source_forbidden)
    monkeypatch.setattr(app_module, "ClaudeSummarizer", real_source_forbidden)


def test_app_from_env_uses_simulated_sources(demo_env, caplog):
    with caplog.at_level(logging.WARNING, logger="health_score.api.app"):
        client = TestClient(app_module.app_from_env())

    demo_warnings = [r for r in caplog.records if "demostración" in r.getMessage()]
    assert [r.getMessage() for r in demo_warnings] == ["Modo demostración: BCRA y modelo simulados"]
    response = client.post("/credit-status", json={"cuil": "20-90000006-6"})
    assert response.json()["status"] == "summary_unavailable"
    assert client.post("/credit-status", json={"cuil": "20-90000024-4"}).json()["tone"] == "warning"
