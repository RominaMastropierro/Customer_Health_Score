"""Modo demostración: BCRA y modelo simulados con las respuestas ficticias de los fixtures.

La constitución (v2.4.0, Principio IX) exige que las demostraciones usen versiones simuladas
de las fuentes y del modelo: un CUIT "sintético" enviado al BCRA real podría pertenecer a una
persona real. El texto de DemoSummarizer es solo para demostraciones; no es una alternativa al
modelo en uso real (clarificación del 2026-10-26).
"""

import json
from pathlib import Path

from health_score.credit.bcra import BcraLookup, NotFound, interpret_response
from health_score.credit.models import CreditFacts

INDEX_FILE = "bcra-demo.json"
RESPONSES_DIR = "bcra"

# Índice: {"<11 dígitos>": {"fixture": "<archivo de bcra/>", "summary": "ok" | "fail"}}.
DemoIndex = dict[str, dict[str, str]]


class FixtureBcraSource:
    """Devuelve el fixture que el índice asigna a cada CUIT; fuera del índice, "sin datos"."""

    def __init__(self, responses_dir: Path, index: DemoIndex):
        self.responses_dir = responses_dir
        self.index = index

    def lookup(self, digits: str) -> BcraLookup:
        entry = self.index.get(digits)
        if entry is None:
            return NotFound()
        raw = json.loads((self.responses_dir / entry["fixture"]).read_text(encoding="utf-8"))
        # Como el BCRA real, la respuesta trae la identificación consultada. DemoSummarizer la
        # usa para buscar el CUIT, porque Summarizer.summarize no lo recibe y todos los
        # fixtures comparten la misma identificación.
        if isinstance(raw.get("results"), dict):
            raw["results"]["identificacion"] = int(digits)
        return interpret_response(raw)


class DemoSummarizer:
    """Texto fijo con los datos calculados, o None si el índice marca una falla del modelo."""

    def __init__(self, index: DemoIndex):
        self.index = index

    def summarize(self, raw: dict, facts: CreditFacts) -> str | None:
        digits = str(raw["results"]["identificacion"]).zfill(11)
        if self.index.get(digits, {}).get("summary") == "fail":
            return None
        worst = facts.worst_situation if facts.worst_situation is not None else "no informada"
        return (
            f"[Demostración] {raw['results'].get('denominacion') or 'Sin denominación'}, "
            f"{facts.period_label}: peor situación {worst}, {facts.entity_count} entidades, "
            f"monto total {facts.total_pesos}."
        )


def load_demo(fixtures_dir: str | Path) -> tuple[FixtureBcraSource, DemoSummarizer]:
    """Las dos versiones simuladas, construidas con el mismo índice."""
    fixtures = Path(fixtures_dir)
    index: DemoIndex = json.loads((fixtures / INDEX_FILE).read_text(encoding="utf-8"))
    return FixtureBcraSource(fixtures / RESPONSES_DIR, index), DemoSummarizer(index)
