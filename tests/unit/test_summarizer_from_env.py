import logging

import pytest

from health_score.api.app import _summarizer_from_env
from health_score.credit.summarizer import ClaudeSummarizer

PROMPT = "Prompt ficticio."
FAKE_KEY = "clave-ficticia-de-prueba"
NO_CREDENTIALS = "Sin credenciales del modelo: la consulta al BCRA no podrá resumir"


@pytest.fixture(autouse=True)
def no_credentials(monkeypatch):
    # Cada prueba arranca sin credenciales, aunque la máquina tenga alguna configurada.
    monkeypatch.delenv("ANTHROPIC_API_KEY_FILE", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


def test_reads_key_from_secret_file(monkeypatch, tmp_path):
    secret = tmp_path / "anthropic_api_key"
    secret.write_text(f"{FAKE_KEY}\n", encoding="utf-8")
    monkeypatch.setenv("ANTHROPIC_API_KEY_FILE", str(secret))

    summarizer = _summarizer_from_env(PROMPT, "claude-opus-5-5")

    assert isinstance(summarizer, ClaudeSummarizer)
    assert summarizer.client.api_key == FAKE_KEY
    assert summarizer.prompt == PROMPT


def test_reads_key_from_environment(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", FAKE_KEY)
    summarizer = _summarizer_from_env(PROMPT, "claude-sonnet-5-5")
    assert summarizer.client.api_key == FAKE_KEY
    assert summarizer.model == "claude-sonnet-5-5"


def test_without_credentials_warns_once_and_returns_none(caplog):
    with caplog.at_level(logging.WARNING):
        assert _summarizer_from_env(PROMPT, "claude-opus-5-5") is None
    assert [record.getMessage() for record in caplog.records] == [NO_CREDENTIALS]


@pytest.mark.parametrize("content", [None, "", "  \n"], ids=["inexistente", "vacio", "espacios"])
def test_missing_or_empty_secret_file_means_no_credentials(monkeypatch, tmp_path, content):
    secret = tmp_path / "anthropic_api_key"
    if content is not None:
        secret.write_text(content, encoding="utf-8")
    monkeypatch.setenv("ANTHROPIC_API_KEY_FILE", str(secret))
    assert _summarizer_from_env(PROMPT, "claude-opus-5-5") is None
