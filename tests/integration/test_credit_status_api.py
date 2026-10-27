import logging
from urllib.error import URLError

import pytest
from fastapi.testclient import TestClient

from conftest import FAKE_SUMMARY, FakeBcraSource, FakeSummarizer, found
from health_score.api.app import create_app
from health_score.credit import bcra
from health_score.credit.bcra import HttpBcraSource, NotFound, Unavailable
from health_score.credit.service import (
    BCRA_UNAVAILABLE_MESSAGE,
    NO_DATA_MESSAGE,
    SUMMARY_UNAVAILABLE_MESSAGE,
)


@pytest.fixture
def fakes():
    return FakeBcraSource(found("situacion-2")), FakeSummarizer()


@pytest.fixture
def credit_client(default_config, repository, fakes) -> TestClient:
    source, summarizer = fakes
    return TestClient(
        create_app(default_config, repository, credit_source=source, summarizer=summarizer)
    )


# --- US1 ---


@pytest.mark.parametrize("cuil", ["20-90000024-4", "20900000244"])
def test_with_debts_queries_bcra_without_dashes(credit_client, fakes, cuil):
    response = credit_client.post("/credit-status", json={"cuil": cuil})

    assert response.status_code == 200
    assert response.json() == {"status": "with_debts", "tone": "warning", "message": FAKE_SUMMARY}
    source, summarizer = fakes
    assert source.calls == ["20900000244"]
    assert len(summarizer.calls) == 1


def test_extra_field_is_rejected(credit_client, fakes):
    response = credit_client.post("/credit-status", json={"cuil": "20900000244", "nombre": "x"})
    assert response.status_code == 422
    assert fakes[0].calls == []


# --- US2: el servicio rechaza un CUIT inválido sin consultar a las fuentes ---


@pytest.mark.parametrize(
    ("body", "error_type"),
    [
        ({"cuil": "20900000245"}, "cuil_check_digit"),
        ({"cuil": "20 90000024 4"}, "cuil_format"),
        ({}, "missing"),
    ],
    ids=["digito", "formato", "vacio"],
)
def test_invalid_cuil_is_rejected_without_lookup(credit_client, fakes, body, error_type):
    response = credit_client.post("/credit-status", json=body)

    assert response.status_code == 422
    (error,) = response.json()["detail"]
    assert error["loc"] == ["body", "cuil"]
    assert error["type"] == error_type
    source, summarizer = fakes
    assert source.calls == []
    assert summarizer.calls == []


# --- US4: resultados no felices por HTTP ---


@pytest.mark.parametrize(
    ("lookup", "summary", "expected"),
    [
        (NotFound(), FAKE_SUMMARY, {"status": "no_data", "message": NO_DATA_MESSAGE}),
        (
            Unavailable("HTTP 503"),
            FAKE_SUMMARY,
            {"status": "bcra_unavailable", "message": BCRA_UNAVAILABLE_MESSAGE},
        ),
        (
            "situacion-3",
            None,
            {"status": "summary_unavailable", "message": SUMMARY_UNAVAILABLE_MESSAGE},
        ),
    ],
    ids=["sin-datos", "bcra", "resumen"],
)
def test_unhappy_results(default_config, repository, lookup, summary, expected):
    source = FakeBcraSource(found(lookup) if isinstance(lookup, str) else lookup)
    app = create_app(
        default_config, repository, credit_source=source, summarizer=FakeSummarizer(summary)
    )

    response = TestClient(app).post("/credit-status", json={"cuil": "20900000244"})

    assert response.status_code == 200
    assert response.json() == {**expected, "tone": None}


def test_without_sources_never_goes_to_the_network(client):
    # `client` es create_app(config, repo) de conftest, igual que en las pruebas previas.
    response = client.post("/credit-status", json={"cuil": "20900000244"})
    assert response.status_code == 200
    assert response.json()["status"] == "bcra_unavailable"


def test_without_summarizer_with_debts_is_summary_unavailable(default_config, repository):
    app = create_app(
        default_config,
        repository,
        credit_source=FakeBcraSource(found("situacion-2")),
        summarizer=None,
    )
    response = TestClient(app).post("/credit-status", json={"cuil": "20900000244"})
    assert response.json()["status"] == "summary_unavailable"


# --- Privacidad (FR-024, SC-008) ---


def test_logs_never_contain_personal_data(default_config, repository, monkeypatch, caplog):
    caplog.set_level(logging.DEBUG)

    def unreachable(request, timeout):
        raise URLError(f"sin conexión a {request.full_url}")

    monkeypatch.setattr(bcra, "urlopen", unreachable)
    sources = [
        (FakeBcraSource(found("situacion-2")), FakeSummarizer()),
        (FakeBcraSource(NotFound()), FakeSummarizer()),
        (FakeBcraSource(Unavailable("HTTP 503")), FakeSummarizer()),
        (FakeBcraSource(found("situacion-2")), FakeSummarizer(None)),
        (HttpBcraSource("https://bcra.test/CentralDeDeudores/v1.0"), FakeSummarizer()),
    ]
    for source, summarizer in sources:
        app = create_app(default_config, repository, credit_source=source, summarizer=summarizer)
        client = TestClient(app)
        assert client.post("/credit-status", json={"cuil": "20-90000024-4"}).status_code == 200
        assert client.post("/credit-status", json={"cuil": "20900000245"}).status_code == 422

    assert caplog.records, "se esperaba al menos el registro de la falla del BCRA"
    logged = "\n".join(record.getMessage() for record in caplog.records)
    for secret in ["20900000244", "20-90000024-4", "20900000245", "EMPRESA FICTICIA", FAKE_SUMMARY]:
        assert secret not in logged
