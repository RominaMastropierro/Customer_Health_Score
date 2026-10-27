import io
import json
import socket
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError

import pytest

from conftest import read_bcra
from health_score.credit import bcra
from health_score.credit.bcra import Found, HttpBcraSource, NotFound, Unavailable

BASE_URL = "https://bcra.test/CentralDeDeudores/v1.0"


class FakeHttpResponse:
    def __init__(self, body: bytes):
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


@pytest.fixture
def urlopen(monkeypatch):
    """Reemplaza urlopen en el módulo: ninguna prueba sale a la red (FR-026)."""
    calls: list[tuple] = []
    state = {"outcome": b"{}"}

    def fake(request, timeout):
        calls.append((request, timeout))
        if isinstance(state["outcome"], BaseException):
            raise state["outcome"]
        return FakeHttpResponse(state["outcome"])

    monkeypatch.setattr(bcra, "urlopen", fake)

    def respond_with(outcome):
        state["outcome"] = outcome
        return calls

    return respond_with


def body_of(name: str) -> bytes:
    return json.dumps(read_bcra(name)).encode("utf-8")


def test_requests_debts_with_eleven_digits(urlopen):
    calls = urlopen(body_of("situacion-1"))

    result = HttpBcraSource(base_url=BASE_URL).lookup("20900000244")

    ((request, timeout),) = calls
    assert request.full_url == f"{BASE_URL}/Deudas/20900000244"
    assert request.get_header("Accept") == "application/json"
    assert timeout == 10
    assert isinstance(result, Found)
    assert result.raw == read_bcra("situacion-1")
    assert result.parsed.results.periodos[0].entidades[0].situacion == 1


def test_trailing_slash_in_base_url(urlopen):
    calls = urlopen(body_of("situacion-1"))
    HttpBcraSource(base_url=BASE_URL + "/").lookup("20900000244")
    assert calls[0][0].full_url == f"{BASE_URL}/Deudas/20900000244"


# --- US4: "sin datos" y BCRA no disponible ---


def http_error(code: int) -> HTTPError:
    return HTTPError(f"{BASE_URL}/Deudas/20900000244", code, "error", {}, io.BytesIO(b"{}"))


def lookup_with(urlopen, outcome):
    urlopen(outcome)
    return HttpBcraSource(base_url=BASE_URL).lookup("20900000244")


def test_404_is_not_found(urlopen):
    assert lookup_with(urlopen, http_error(404)) == NotFound()


@pytest.mark.parametrize("code", [400, 429, 500, 503])
def test_other_http_errors_are_unavailable(urlopen, code):
    assert lookup_with(urlopen, http_error(code)) == Unavailable(f"HTTP {code}")


@pytest.mark.parametrize(
    "error",
    [
        URLError("sin conexión"),
        TimeoutError("timed out"),
        socket.timeout("timed out"),
        ConnectionResetError("reset"),
        IncompleteRead(b"{"),
    ],
    ids=["url", "timeout", "socket-timeout", "reset", "incompleta"],
)
def test_connection_failures_are_unavailable(urlopen, error):
    assert isinstance(lookup_with(urlopen, error), Unavailable)


@pytest.mark.parametrize(
    "body",
    [b"no es json", b"\xff\xfe", body_of("estructura-invalida")],
    ids=["no-json", "no-utf8", "estructura"],
)
def test_unreadable_responses_are_unavailable(urlopen, body):
    assert isinstance(lookup_with(urlopen, body), Unavailable)


def test_no_periods_is_not_found(urlopen):
    assert lookup_with(urlopen, body_of("sin-periodos")) == NotFound()


def test_latest_period_without_entities_is_not_found(urlopen):
    data = read_bcra("varios-periodos")
    data["results"]["periodos"][1]["entidades"] = []
    assert lookup_with(urlopen, json.dumps(data).encode("utf-8")) == NotFound()


def test_failure_reason_never_contains_the_cuit(urlopen):
    result = lookup_with(urlopen, URLError("fallo al consultar /Deudas/20900000244"))
    assert "20900000244" not in result.reason
