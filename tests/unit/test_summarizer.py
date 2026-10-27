import json
from types import SimpleNamespace

import anthropic
import httpx2
import pytest

from conftest import read_bcra
from health_score.config import ConfigError
from health_score.credit.models import CreditFacts
from health_score.credit.summarizer import ClaudeSummarizer, load_prompt

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


def text_response(text: str, stop_reason: str = "end_turn"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
    )


class FakeMessages:
    def __init__(self, outcome):
        self.outcome = outcome
        self.kwargs: dict | None = None

    def create(self, **kwargs):
        self.kwargs = kwargs
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


class FakeClient:
    """Imita `client.with_options(...).messages.create(**kwargs)` del SDK."""

    def __init__(self, outcome):
        self.messages = FakeMessages(outcome)
        self.options: dict | None = None

    def with_options(self, **options):
        self.options = options
        return self


def summarize_with(outcome, facts: CreditFacts = FACTS):
    client = FakeClient(outcome)
    text = ClaudeSummarizer(PROMPT, client=client).summarize(read_bcra("situacion-2"), facts)
    return text, client


def test_call_parameters():
    _, client = summarize_with(text_response("Resumen"))
    assert client.options == {"timeout": 15.0, "max_retries": 0}
    kwargs = client.messages.kwargs
    assert kwargs["model"] == "claude-opus-5-5"
    assert kwargs["max_tokens"] == 2000
    assert kwargs["output_config"] == {"effort": "low"}
    assert kwargs["system"] == PROMPT
    assert kwargs["cache_control"] == {"type": "ephemeral"}


def test_user_message_carries_raw_response_and_facts():
    _, client = summarize_with(text_response("Resumen"))
    (message,) = client.messages.kwargs["messages"]
    assert message["role"] == "user"
    content = message["content"]
    raw_json = json.dumps(read_bcra("situacion-2"), ensure_ascii=False)
    assert f"<respuesta_bcra>\n{raw_json}\n</respuesta_bcra>" in content
    for line in [
        "periodo: julio 2024",
        "peor_situacion: 2",
        "entidad_peor_situacion: BANCO FICTICIO DEL SUR",
        "cantidad_entidades: 3",
        "monto_total: $ 1.250.000",
        "maximo_dias_atraso: 45",
    ]:
        assert line in content
    assert content.index("<datos_calculados>") > content.index("</respuesta_bcra>")


def test_missing_facts_are_written_as_not_reported():
    facts = FACTS.model_copy(update={"worst_situation": None, "worst_entity": None, "tone": None})
    _, client = summarize_with(text_response("Resumen"), facts)
    content = client.messages.kwargs["messages"][0]["content"]
    assert "peor_situacion: no informado" in content
    assert "entidad_peor_situacion: no informado" in content
    assert "None" not in content.split("<datos_calculados>")[1]


def test_returns_stripped_text():
    text, _ = summarize_with(text_response("  Resumen ficticio.\n"))
    assert text == "Resumen ficticio."


def test_custom_model():
    client = FakeClient(text_response("Resumen"))
    ClaudeSummarizer(PROMPT, model="claude-sonnet-5-5", client=client).summarize({}, FACTS)
    assert client.messages.kwargs["model"] == "claude-sonnet-5-5"


@pytest.mark.parametrize("content", ["", "   \n"])
def test_load_prompt_rejects_empty_file(tmp_path, content):
    path = tmp_path / "prompt.md"
    path.write_text(content, encoding="utf-8")
    with pytest.raises(ConfigError, match="vacío"):
        load_prompt(path)


def test_load_prompt_rejects_missing_file(tmp_path):
    with pytest.raises(ConfigError, match="prompt"):
        load_prompt(tmp_path / "no-existe.md")


def test_load_prompt_reads_versioned_prompt():
    assert "Central de Deudores" in load_prompt("config/prompts/bcra-summary.md")


# --- US4: resumen no disponible ---

REQUEST = httpx2.Request("POST", "https://api.anthropic.test/v1/messages")


def status_response(code: int) -> httpx2.Response:
    return httpx2.Response(code, request=REQUEST)


@pytest.mark.parametrize(
    "error",
    [
        anthropic.APITimeoutError(request=REQUEST),
        anthropic.APIConnectionError(request=REQUEST),
        anthropic.RateLimitError("límite", response=status_response(429), body=None),
        anthropic.APIStatusError("error", response=status_response(500), body=None),
        anthropic.AnthropicError("x"),
    ],
    ids=["timeout", "conexion", "429", "500", "cliente"],
)
def test_sdk_errors_mean_summary_unavailable(error):
    text, _ = summarize_with(error)
    assert text is None


@pytest.mark.parametrize("stop_reason", ["refusal", "max_tokens"])
def test_incomplete_stop_reasons_mean_summary_unavailable(stop_reason):
    text, _ = summarize_with(text_response("Resumen a medias", stop_reason=stop_reason))
    assert text is None


def test_no_text_blocks_means_summary_unavailable():
    response = SimpleNamespace(
        stop_reason="end_turn", content=[SimpleNamespace(type="thinking", thinking="")]
    )
    assert summarize_with(response)[0] is None


@pytest.mark.parametrize("content", ["", "   \n "])
def test_empty_text_means_summary_unavailable(content):
    assert summarize_with(text_response(content))[0] is None


def test_text_longer_than_limit_means_summary_unavailable():
    assert summarize_with(text_response("a" * 1201))[0] is None
    assert summarize_with(text_response("a" * 1200))[0] == "a" * 1200
