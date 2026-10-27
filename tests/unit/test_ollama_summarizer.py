import json
import logging
import socket
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError

import pytest

from conftest import read_bcra
from health_score.credit import summarizer as summarizer_module
from health_score.credit.models import CreditFacts
from health_score.credit.summarizer import OllamaSummarizer

PROMPT = "Prompt ficticio de prueba."
FACTS = CreditFacts(
    period_label="julio 2024",
    worst_situation=2,
    worst_entity="BANCO FICTICIO DEL SUR",
    entity_count=3,
    total_pesos="$ 1.250.000",
    max_days_late=45,
    tone="warning",
)
CUIT = "30900000014"


class FakeHttpResponse:
    def __init__(self, body: bytes):
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def reply(content: object, done_reason: str = "stop") -> bytes:
    return json.dumps(
        {"message": {"role": "assistant", "content": content}, "done": True, "done_reason": done_reason}
    ).encode("utf-8")


@pytest.fixture
def urlopen(monkeypatch):
    """Reemplaza urlopen en el módulo: ninguna prueba llama a Ollama (FR-026)."""
    calls: list[tuple] = []
    state: dict = {"outcome": reply("Resumen")}

    def fake(request, timeout):
        calls.append((request, timeout))
        if isinstance(state["outcome"], BaseException):
            raise state["outcome"]
        return FakeHttpResponse(state["outcome"])

    monkeypatch.setattr(summarizer_module, "urlopen", fake)

    def respond_with(outcome):
        state["outcome"] = outcome
        return calls

    return respond_with


def summarize(**kwargs) -> str | None:
    return OllamaSummarizer(PROMPT, **kwargs).summarize(read_bcra("situacion-2"), FACTS)


def test_call_parameters(urlopen):
    calls = urlopen(reply("Resumen"))
    summarize(base_url="http://ollama.test:11434/", timeout=60.0)

    ((request, timeout),) = calls
    assert request.full_url == "http://ollama.test:11434/api/chat"
    assert request.get_method() == "POST"
    assert request.get_header("Content-type") == "application/json"
    assert timeout == 60.0
    body = json.loads(request.data)
    assert body["model"] == "qwen2.5:7b"
    assert body["stream"] is False
    assert body["keep_alive"] == "30m"
    assert body["options"] == {"temperature": 0.2, "num_predict": 600, "num_ctx": 8192}
    system, user = body["messages"]
    assert system == {"role": "system", "content": PROMPT}
    assert user["role"] == "user"


def test_user_message_is_the_same_as_claude(urlopen):
    calls = urlopen(reply("Resumen"))
    summarize()
    content = json.loads(calls[0][0].data)["messages"][1]["content"]
    raw_json = json.dumps(read_bcra("situacion-2"), ensure_ascii=False)
    assert f"<respuesta_bcra>\n{raw_json}\n</respuesta_bcra>" in content
    assert "peor_situacion: 2" in content
    assert content.index("<datos_calculados>") > content.index("</respuesta_bcra>")


def test_custom_model(urlopen):
    calls = urlopen(reply("Resumen"))
    summarize(model="llama3.2:1b")
    assert json.loads(calls[0][0].data)["model"] == "llama3.2:1b"


def test_returns_stripped_text(urlopen):
    urlopen(reply("  Resumen ficticio.\n"))
    assert summarize() == "Resumen ficticio."


def test_reply_without_done_reason_is_accepted(urlopen):
    urlopen(json.dumps({"message": {"content": "Resumen"}}).encode("utf-8"))
    assert summarize() == "Resumen"


# --- US4: resumen no disponible ---


@pytest.mark.parametrize(
    "outcome",
    [
        URLError(ConnectionRefusedError()),
        TimeoutError(),
        socket.timeout(),
        HTTPError("http://ollama.test/api/chat", 404, "model not found", {}, None),
        HTTPError("http://ollama.test/api/chat", 500, "error", {}, None),
        IncompleteRead(b""),
        b"no es json",
        b"\xff\xfe",
        b"[]",
        b"{}",
        json.dumps({"message": None}).encode("utf-8"),
    ],
    ids=[
        "sin-ollama", "timeout", "socket-timeout", "modelo-inexistente", "500",
        "cortada", "no-json", "no-utf8", "lista", "sin-message", "message-nulo",
    ],
)
def test_failures_mean_summary_unavailable(urlopen, outcome):
    urlopen(outcome)
    assert summarize() is None


@pytest.mark.parametrize("done_reason", ["length", "load"])
def test_incomplete_reply_means_summary_unavailable(urlopen, done_reason):
    urlopen(reply("Resumen a medias", done_reason=done_reason))
    assert summarize() is None


@pytest.mark.parametrize("content", ["", "   \n ", None, 42])
def test_empty_or_non_text_content_means_summary_unavailable(urlopen, content):
    urlopen(reply(content))
    assert summarize() is None


def test_text_longer_than_limit_means_summary_unavailable(urlopen):
    urlopen(reply("a" * 1201))
    assert summarize() is None
    urlopen(reply("a" * 1200))
    assert summarize() == "a" * 1200


def test_failure_log_has_no_personal_data(urlopen, caplog):
    urlopen(HTTPError(f"http://ollama.test/{CUIT}", 500, f"error {CUIT}", {}, None))
    raw = read_bcra("situacion-2")
    raw["results"]["identificacion"] = int(CUIT)
    with caplog.at_level(logging.WARNING):
        assert OllamaSummarizer(PROMPT).summarize(raw, FACTS) is None
    assert [record.getMessage() for record in caplog.records] == ["Resumen no disponible: HTTPError"]
    assert CUIT not in caplog.text
    assert "EMPRESA FICTICIA" not in caplog.text
