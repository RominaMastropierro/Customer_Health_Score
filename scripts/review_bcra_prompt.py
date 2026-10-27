"""Revisión manual del prompt del resumen del BCRA (spec 005, FR-028 y SC-006).

Se ejecuta solo a mano; la suite de pruebas nunca lo importa ni lo ejecuta. Envía únicamente
las respuestas ficticias de tests/fixtures/bcra/, como permite la constitución v2.4.0
(Principio IX: revisión manual de un prompt con fixtures ficticios).

Proveedores:
  --provider ollama   modelo local de Ollama, sin costo; los datos no salen de la máquina.
  --provider claude   modelo real de Claude, con costo y aprobación previa. Antes de usarlo,
                      confirmar que la cuenta de la API key no entrena con los datos (T050b).
                      Credenciales: ANTHROPIC_API_KEY o un perfil de `ant auth login`.

Uso:
  python scripts/review_bcra_prompt.py --provider ollama [--model qwen2.5:7b]
  python scripts/review_bcra_prompt.py --provider claude [--model claude-sonnet-5-5]

Escribe en tmp/prompt-review/<fixture>.txt el texto generado junto con los datos calculados,
y al final la duración de cada llamada al modelo (máximo y percentil 95, para SC-001).
Revisar cada texto contra FR-017 a FR-019.
"""

import argparse
import json
import math
import time
from pathlib import Path

from health_score.credit.bcra import Found, interpret_response
from health_score.credit.service import compute_facts
from health_score.credit.summarizer import (
    DEFAULT_MODEL,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OLLAMA_URL,
    ClaudeSummarizer,
    OllamaSummarizer,
    load_prompt,
)

ROOT = Path(__file__).resolve().parents[1]
# Solo las respuestas de bcra/: el índice de la demo (bcra-demo.json) está fuera a propósito.
FIXTURES = ROOT / "tests" / "fixtures" / "bcra"
PROMPT = ROOT / "config" / "prompts" / "bcra-summary.md"
OUTPUT = ROOT / "tmp" / "prompt-review"
# SC-001 pide el texto en menos de 10 s; se dejan unos 2 s para el BCRA.
MODEL_BUDGET_SECONDS = 8.0
# Margen para medir: un modelo local lento no debe cortarse antes de saber cuánto tarda.
REVIEW_TIMEOUT_SECONDS = 120.0


def percentile_95(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[math.ceil(0.95 * len(ordered)) - 1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--provider", choices=["ollama", "claude"], default="ollama")
    parser.add_argument("--model", help="modelo a revisar (por defecto, el del proveedor)")
    parser.add_argument("--ollama-url", default=DEFAULT_OLLAMA_URL)
    args = parser.parse_args()

    prompt = load_prompt(PROMPT)
    if args.provider == "ollama":
        model = args.model or DEFAULT_OLLAMA_MODEL
        summarizer = OllamaSummarizer(prompt, model, args.ollama_url, REVIEW_TIMEOUT_SECONDS)
    else:
        model = args.model or DEFAULT_MODEL
        summarizer = ClaudeSummarizer(prompt, model=model)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    durations: list[float] = []
    for path in sorted(FIXTURES.glob("*.json")):
        lookup = interpret_response(json.loads(path.read_text(encoding="utf-8")))
        if not isinstance(lookup, Found):
            print(f"{path.name}: sin deudas que describir, se omite")
            continue
        facts = compute_facts(lookup.parsed)
        started = time.perf_counter()
        text = summarizer.summarize(lookup.raw, facts)
        durations.append(time.perf_counter() - started)
        report = (
            f"Proveedor: {args.provider}\nModelo: {model}\nDuración: {durations[-1]:.1f} s\n\n"
            f"Datos calculados:\n{facts.model_dump_json(indent=2)}\n\n"
            f"Texto ({len(text) if text else 0} caracteres):\n{text or '(resumen no disponible)'}\n"
        )
        (OUTPUT / f"{path.stem}.txt").write_text(report, encoding="utf-8")
        print(f"{path.name}: {durations[-1]:.1f} s")

    if not durations:
        return
    p95 = percentile_95(durations)
    print(f"\nLlamadas: {len(durations)} · máximo {max(durations):.1f} s · p95 {p95:.1f} s")
    if p95 > MODEL_BUDGET_SECONDS:
        print(
            f"El p95 supera {MODEL_BUDGET_SECONDS:.0f} s (SC-001): probar un modelo más "
            "rápido o subir HEALTH_SCORE_SUMMARY_TIMEOUT."
        )
    print(f"Textos en {OUTPUT}")


if __name__ == "__main__":
    main()
