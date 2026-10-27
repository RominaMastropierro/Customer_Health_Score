import logging

import pytest

from health_score.api.app import _summarizer_from_env
from health_score.config import ConfigError
from health_score.credit.summarizer import ClaudeSummarizer, OllamaSummarizer

PROMPT = "Prompt ficticio."
FAKE_KEY = "clave-ficticia-de-prueba"
NO_CREDENTIALS = "Sin credenciales del modelo: la consulta al BCRA no podrá resumir"


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    # Cada prueba arranca sin credenciales ni proveedor, aunque la máquina tenga alguno.
    for name in [
        "ANTHROPIC_API_KEY_FILE",
        "ANTHROPIC_API_KEY",
        "HEALTH_SCORE_SUMMARIZER",
        "HEALTH_SCORE_SUMMARY_MODEL",
        "HEALTH_SCORE_SUMMARY_TIMEOUT",
        "HEALTH_SCORE_OLLAMA_URL",
    ]:
        monkeypatch.delenv(name, raising=False)


def test_reads_key_from_secret_file(monkeypatch, tmp_path):
    secret = tmp_path / "anthropic_api_key"
    secret.write_text(f"{FAKE_KEY}\n", encoding="utf-8")
    monkeypatch.setenv("ANTHROPIC_API_KEY_FILE", str(secret))

    summarizer = _summarizer_from_env(PROMPT)

    assert isinstance(summarizer, ClaudeSummarizer)
    assert summarizer.client.api_key == FAKE_KEY
    assert summarizer.prompt == PROMPT
    assert summarizer.model == "claude-opus-5-5"
    assert summarizer.timeout == 15.0


def test_reads_key_from_environment(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    monkeypatch.setenv("HEALTH_SCORE_SUMMARY_MODEL", "claude-sonnet-5-5")
    summarizer = _summarizer_from_env(PROMPT)
    assert summarizer.client.api_key == FAKE_KEY
    assert summarizer.model == "claude-sonnet-5-5"


def test_without_credentials_warns_once_and_returns_none(caplog):
    with caplog.at_level(logging.WARNING):
        assert _summarizer_from_env(PROMPT) is None
    assert [record.getMessage() for record in caplog.records] == [NO_CREDENTIALS]


@pytest.mark.parametrize("content", [None, "", "  \n"], ids=["inexistente", "vacio", "espacios"])
def test_missing_or_empty_secret_file_means_no_credentials(monkeypatch, tmp_path, content):
    secret = tmp_path / "anthropic_api_key"
    if content is not None:
        secret.write_text(content, encoding="utf-8")
    monkeypatch.setenv("ANTHROPIC_API_KEY_FILE", str(secret))
    assert _summarizer_from_env(PROMPT) is None


# --- Ollama (research R5b) ---


def test_ollama_needs_no_credentials_and_uses_defaults(monkeypatch, caplog):
    monkeypatch.setenv("HEALTH_SCORE_SUMMARIZER", "ollama")
    with caplog.at_level(logging.WARNING):
        summarizer = _summarizer_from_env(PROMPT)
    assert isinstance(summarizer, OllamaSummarizer)
    assert summarizer.prompt == PROMPT
    assert summarizer.model == "qwen2.5:7b"
    assert summarizer.base_url == "http://127.0.0.1:11434"
    assert summarizer.timeout == 15.0
    assert caplog.records == []


def test_ollama_reads_model_url_and_timeout(monkeypatch):
    monkeypatch.setenv("HEALTH_SCORE_SUMMARIZER", " Ollama ")
    monkeypatch.setenv("HEALTH_SCORE_SUMMARY_MODEL", "llama3.2:1b")
    monkeypatch.setenv("HEALTH_SCORE_OLLAMA_URL", "http://host.docker.internal:11434/")
    monkeypatch.setenv("HEALTH_SCORE_SUMMARY_TIMEOUT", "75")
    summarizer = _summarizer_from_env(PROMPT)
    assert summarizer.model == "llama3.2:1b"
    assert summarizer.base_url == "http://host.docker.internal:11434"
    assert summarizer.timeout == 75.0


def test_timeout_also_applies_to_claude(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    monkeypatch.setenv("HEALTH_SCORE_SUMMARY_TIMEOUT", "20.5")
    assert _summarizer_from_env(PROMPT).timeout == 20.5


def test_unknown_provider_prevents_startup(monkeypatch):
    monkeypatch.setenv("HEALTH_SCORE_SUMMARIZER", "openai")
    with pytest.raises(ConfigError, match="HEALTH_SCORE_SUMMARIZER"):
        _summarizer_from_env(PROMPT)


@pytest.mark.parametrize("value", ["abc", "0", "-3", "nan"])
def test_invalid_timeout_prevents_startup(monkeypatch, value):
    monkeypatch.setenv("HEALTH_SCORE_SUMMARIZER", "ollama")
    monkeypatch.setenv("HEALTH_SCORE_SUMMARY_TIMEOUT", value)
    with pytest.raises(ConfigError, match="HEALTH_SCORE_SUMMARY_TIMEOUT"):
        _summarizer_from_env(PROMPT)
