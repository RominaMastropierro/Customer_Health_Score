"""Redacción del resumen con un modelo de IA, detrás de una interfaz (Principio IV)."""

import json
import logging
from pathlib import Path
from typing import Protocol

import anthropic

from health_score.config import ConfigError
from health_score.credit.models import CreditFacts

DEFAULT_MODEL = "claude-opus-5-5"
MODEL_TIMEOUT_SECONDS = 15.0
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


class ClaudeSummarizer:
    """Pide a Claude el texto descriptivo de la respuesta del BCRA (FR-015)."""

    def __init__(
        self,
        prompt: str,
        model: str = DEFAULT_MODEL,
        client: anthropic.Anthropic | None = None,
    ):
        self.prompt = prompt
        self.model = model
        self.client = client or anthropic.Anthropic()

    def summarize(self, raw: dict, facts: CreditFacts) -> str | None:
        # Los delimitadores marcan la respuesta del BCRA como datos y no como
        # instrucciones (FR-019); las cifras ya calculadas evitan errores de cálculo (R8).
        user_message = (
            f"<respuesta_bcra>\n{json.dumps(raw, ensure_ascii=False)}\n</respuesta_bcra>\n\n"
            + _facts_block(facts)
        )
        # Sin reintentos del SDK: con ellos la demora podría triplicarse y romper SC-005;
        # el reintento lo decide la persona con "Reintentar" (research R6).
        try:
            response = self.client.with_options(
                timeout=MODEL_TIMEOUT_SECONDS, max_retries=0
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
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        if not text or len(text) > MAX_SUMMARY_CHARS:
            logger.warning("Resumen no disponible: texto vacío o demasiado largo")
            return None
        return text
