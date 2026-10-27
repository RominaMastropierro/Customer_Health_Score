"""Interpretación de la respuesta del BCRA sin IA: datos calculados, tono y textos fijos.

El tono y los textos fijos viven solo aquí (Principio VI); las descripciones de cada
situación viven solo en el prompt (research R10).
"""

from health_score.credit.bcra import BcraSource, Found, NotFound
from health_score.credit.models import BcraDebtResponse, CreditFacts, CreditStatus, CreditTone
from health_score.credit.summarizer import Summarizer

MONTHS = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)
VALID_SITUATIONS = range(1, 6)

NO_DATA_MESSAGE = "El BCRA no registra deudas informadas para este CUIT/CUIL."
BCRA_UNAVAILABLE_MESSAGE = (
    "No pudimos consultar la situación en el BCRA en este momento. "
    "Inténtalo de nuevo en unos minutos."
)
SUMMARY_UNAVAILABLE_MESSAGE = (
    "No pudimos preparar el resumen de la situación en el BCRA. "
    "Inténtalo de nuevo en unos minutos."
)


def tone_for(situation: int | None) -> CreditTone | None:
    if situation is None:
        return None
    if situation == 1:
        return "positive"
    if situation == 2:
        return "warning"
    return "risk"


def _period_label(period: str) -> str:
    return f"{MONTHS[int(period[4:]) - 1]} {period[:4]}"


def _pesos(thousands: float) -> str:
    # Los montos del BCRA vienen en miles de pesos; separador de miles con punto.
    return "$ " + f"{int(round(thousands * 1000)):,}".replace(",", ".")


def compute_facts(parsed: BcraDebtResponse) -> CreditFacts:
    """Cifras del período más reciente, calculadas en código para que sean exactas (R8)."""
    latest = max(parsed.results.periodos, key=lambda period: period.periodo)
    entities = latest.entidades
    valid = [entity for entity in entities if entity.situacion in VALID_SITUATIONS]
    worst = max((entity.situacion for entity in valid), default=None)
    worst_entity = next((entity.entidad for entity in valid if entity.situacion == worst), None)
    return CreditFacts(
        period_label=_period_label(latest.periodo),
        worst_situation=worst,
        worst_entity=worst_entity,
        entity_count=len(entities),
        total_pesos=_pesos(sum(entity.monto for entity in entities if entity.monto is not None)),
        max_days_late=max((entity.diasAtrasoPago or 0 for entity in entities), default=0),
        tone=tone_for(worst),
    )


def check_credit(
    digits: str, source: BcraSource | None, summarizer: Summarizer | None
) -> CreditStatus:
    """Consulta al BCRA el CUIT ya validado (11 dígitos) y arma el resultado para mostrar.

    Sin fuente o sin modelo configurados se responde como si no estuvieran disponibles: la
    consulta nunca sale a la red ni bloquea el resto de la aplicación (FR-029).
    """
    if source is None:
        return CreditStatus(status="bcra_unavailable", message=BCRA_UNAVAILABLE_MESSAGE)
    lookup = source.lookup(digits)
    if isinstance(lookup, NotFound):
        return CreditStatus(status="no_data", message=NO_DATA_MESSAGE)
    if not isinstance(lookup, Found):
        return CreditStatus(status="bcra_unavailable", message=BCRA_UNAVAILABLE_MESSAGE)
    if summarizer is None:
        return CreditStatus(status="summary_unavailable", message=SUMMARY_UNAVAILABLE_MESSAGE)
    facts = compute_facts(lookup.parsed)
    summary = summarizer.summarize(lookup.raw, facts)
    if summary is None:
        return CreditStatus(status="summary_unavailable", message=SUMMARY_UNAVAILABLE_MESSAGE)
    return CreditStatus(status="with_debts", tone=facts.tone, message=summary)
