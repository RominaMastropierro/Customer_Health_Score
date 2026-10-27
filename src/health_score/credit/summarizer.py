"""Redacción del resumen con un modelo de IA, detrás de una interfaz (Principio IV)."""

import json
import logging
from http.client import HTTPException
from pathlib import Path
from typing import Protocol
from urllib.request import Request, urlopen

import anthropic

from health_score.config import ConfigError
from health_score.credit.models import CreditFacts

DEFAULT_MODEL = "claude-opus-5-5"
DEFAULT_OLLAMA_MODEL = "qwen2.5:7b"
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"
MODEL_TIMEOUT_SECONDS = 15.0
# Tope de tokens generados en Ollama: ~1.200 caracteres en español son unos 400 tokens.
OLLAMA_MAX_TOKENS = 600
# Contexto suficiente para el prompt y una respuesta del BCRA con muchas entidades.
OLLAMA_CONTEXT_TOKENS = 8192
# Mantiene el modelo cargado entre consultas: la primera carga es la más lenta.
OLLAMA_KEEP_ALIVE = "30m"
# Deja margen al razonamiento sobre los ~400 tokens del texto (research R5).
MAX_TOKENS = 2000
# Límite duro del texto (FR-012); el prompt pide 1.000 para dejar margen.
MAX_SUMMARY_CHARS = 1200
NOT_REPORTED = "no informado"

logger = logging.getLogger(__name__)


class Summarizer(Protocol):
    def summarize(self, raw: dict, facts: CreditFacts) -> str | None:
        """Texto para mostrar, o None si el resumen no está disponible."""
        ...


def load_prompt(path: str | Path) -> str:
    """Lee el prompt versionado (FR-016). Un prompt ausente o vacío impide arrancar."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        raise ConfigError(f"No se pudo leer el prompt '{path}': {exc}") from exc
    if not text.strip():
        raise ConfigError(f"El prompt '{path}' está vacío")
    return text


def _value(value: object) -> str:
    return NOT_REPORTED if value is None else str(value)


def _facts_block(facts: CreditFacts) -> str:
    lines = [
        f"periodo: {facts.period_label}",
        f"peor_situacion: {_value(facts.worst_situation)}",
        f"entidad_peor_situacion: {_value(facts.worst_entity)}",
        f"cantidad_entidades: {facts.entity_count}",
        f"monto_total: {facts.total_pesos}",
        f"maximo_dias_atraso: {facts.max_days_late}",
    ]
    return "<datos_calculados>\n" + "\n".join(lines) + "\n</datos_calculados>"


def _user_message(raw: dict, facts: CreditFacts) -> str:
    # Los delimitadores marcan la respuesta del BCRA como datos y no como
    # instrucciones (FR-019); las cifras ya calculadas evitan errores de cálculo (R8).
    return (
        f"<respuesta_bcra>\n{json.dumps(raw, ensure_ascii=False)}\n</respuesta_bcra>\n\n"
        + _facts_block(facts)
    )


def _checked_text(text: str) -> str | None:
    text = text.strip()
    if not text or len(text) > MAX_SUMMARY_CHARS:
        logger.warning("Resumen no disponible: texto vacío o demasiado largo")
        return None
    return text


class ClaudeSummarizer:
    """Pide a Claude el texto descriptivo de la respuesta del BCRA (FR-015)."""

    def __init__(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        client: anthropic.Anthropic | None = None,
        timeout: float = MODEL_TIMEOUT_SECONDS,
    ):
        self.prompt = prompt
        self.model = model
        self.client = client or anthropic.Anthropic()
        self.timeout = timeout

    def summarize(self, raw: dict, facts: CreditFacts) -> str | None:
        user_message = _user_message(raw, facts)
        # Sin reintentos del SDK: con ellos la demora podría triplicarse y romper SC-005;
        # el reintento lo decide la persona con "Reintentar" (research R6).
        try:
            response = self.client.with_options(
                timeout=self.timeout, max_retries=0
            ).messages.create(
                model=self.model,
                max_tokens=MAX_TOKENS,
                output_config={"effort": "low"},
                system=self.prompt,
                cache_control={"type": "ephemeral"},
                messages=[{"role": "user", "content": user_message}],
            )
        except anthropic.AnthropicError as exc:
            # Solo el tipo de falla: nunca el prompt, la respuesta del BCRA ni el CUIT (FR-024).
            logger.warning("Resumen no disponible: %s", type(exc).__name__)
            return None
        if response.stop_reason != "end_turn":
            logger.warning("Resumen no disponible: stop_reason %s", response.stop_reason)
            return None
        return _checked_text("".join(b.text for b in response.content if b.type == "text"))


class OllamaSummarizer:
    """Pide el texto a un modelo local de Ollama con la biblioteca estándar (research R5b).

    La respuesta del BCRA no sale de la máquina donde corre Ollama (Principio IX).
    """

    def __init__(
        self,
        prompt: str,
        model: str = DEFAULT_OLLAMA_MODEL,
        base_url: str = DEFAULT_OLLAMA_URL,
        timeout: float = MODEL_TIMEOUT_SECONDS,
    ):
        self.prompt = prompt
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def summarize(self, raw: dict, facts: CreditFacts) -> str | None:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": self.prompt},
                {"role": "user", "content": _user_message(raw, facts)},
            ],
            "stream": False,
            "keep_alive": OLLAMA_KEEP_ALIVE,
            # Temperatura baja: el texto describe datos, no tiene que ser creativo.
            "options": {
                "temperature": 0.2,
                "num_predict": OLLAMA_MAX_TOKENS,
                "num_ctx": OLLAMA_CONTEXT_TOKENS,
            },
        }
        request = Request(
            f"{self.base_url}/api/chat",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        # Sin reintentos, como con Claude (research R6).
        try:
            with urlopen(request, timeout=self.timeout) as response:
                reply = json.loads(response.read().decode("utf-8"))
            done_reason = reply.get("done_reason", "stop")
            text = reply["message"]["content"]
        except (OSError, HTTPException, ValueError, KeyError, TypeError, AttributeError) as exc:
            # HTTPError, URLError y TimeoutError son OSError; JSONDecodeError es ValueError.
            # Solo el tipo de falla: nunca el prompt, la respuesta del BCRA ni el CUIT (FR-024).
            logger.warning("Resumen no disponible: %s", type(exc).__name__)
            return None
        if done_reason != "stop" or not isinstance(text, str):
            logger.warning("Resumen no disponible: done_reason %s", done_reason)
            return None
        return _checked_text(text)
