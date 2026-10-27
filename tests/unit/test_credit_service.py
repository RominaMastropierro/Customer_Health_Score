import pytest

from conftest import FAKE_SUMMARY, FakeBcraSource, FakeSummarizer, found, read_bcra
from health_score.credit.bcra import NotFound, Unavailable
from health_score.credit.models import CreditStatus
from health_score.credit.service import (
    BCRA_UNAVAILABLE_MESSAGE,
    NO_DATA_MESSAGE,
    SUMMARY_UNAVAILABLE_MESSAGE,
    check_credit,
    compute_facts,
    tone_for,
)


def facts_of(name: str):
    return compute_facts(found(name).parsed)


def test_compute_facts_on_most_recent_period():
    facts = facts_of("situacion-2")
    assert facts.period_label == "julio 2024"
    assert facts.worst_situation == 2
    assert facts.worst_entity == "BANCO FICTICIO DEL SUR"
    assert facts.entity_count == 3
    # 120.5 + 1000.0 + 129.5 miles de pesos.
    assert facts.total_pesos == "$ 1.250.000"
    assert facts.max_days_late == 45
    assert facts.tone == "warning"


@pytest.mark.parametrize(
    ("situation", "tone"),
    [(1, "positive"), (2, "warning"), (3, "risk"), (4, "risk"), (5, "risk"), (None, None)],
)
def test_tone_for(situation, tone):
    assert tone_for(situation) == tone


def test_uses_most_recent_period():
    facts = facts_of("varios-periodos")
    assert facts.period_label == "julio 2024"
    assert facts.worst_situation == 1
    assert facts.tone == "positive"


def test_incomplete_entity_ignored_for_tone_and_total():
    facts = facts_of("entidad-incompleta")
    assert facts.worst_situation == 2
    assert facts.worst_entity == "BANCO FICTICIO DEL SUR"
    assert facts.entity_count == 2
    assert facts.total_pesos == "$ 210.000"
    assert facts.tone == "warning"


def test_no_valid_situation_has_no_tone():
    facts = facts_of("sin-situacion-valida")
    assert facts.worst_situation is None
    assert facts.worst_entity is None
    assert facts.tone is None
    assert facts.total_pesos == "$ 230.000"


def test_check_credit_with_debts_sends_raw_response_to_summarizer():
    source = FakeBcraSource(found("situacion-2"))
    summarizer = FakeSummarizer()

    status = check_credit("20900000244", source, summarizer)

    assert status == CreditStatus(status="with_debts", tone="warning", message=FAKE_SUMMARY)
    assert source.calls == ["20900000244"]
    ((raw, facts),) = summarizer.calls
    assert raw == read_bcra("situacion-2")
    assert facts.worst_situation == 2


# --- US4: resultados con textos fijos, sin consultar al modelo ---


def test_not_found_is_no_data_without_summarizer():
    summarizer = FakeSummarizer()
    status = check_credit("20900000244", FakeBcraSource(NotFound()), summarizer)
    assert status == CreditStatus(status="no_data", tone=None, message=NO_DATA_MESSAGE)
    assert summarizer.calls == []


def test_unavailable_is_bcra_unavailable():
    summarizer = FakeSummarizer()
    status = check_credit("20900000244", FakeBcraSource(Unavailable("HTTP 503")), summarizer)
    assert status == CreditStatus(
        status="bcra_unavailable", tone=None, message=BCRA_UNAVAILABLE_MESSAGE
    )
    assert summarizer.calls == []


def test_summary_failure_is_summary_unavailable():
    status = check_credit("20900000244", FakeBcraSource(found("situacion-3")), FakeSummarizer(None))
    assert status == CreditStatus(
        status="summary_unavailable", tone=None, message=SUMMARY_UNAVAILABLE_MESSAGE
    )


def test_without_source_is_bcra_unavailable():
    assert check_credit("20900000244", None, FakeSummarizer()).status == "bcra_unavailable"


def test_without_summarizer_is_summary_unavailable():
    status = check_credit("20900000244", FakeBcraSource(found("situacion-1")), None)
    assert status.status == "summary_unavailable"


def test_fixed_messages_match_data_model():
    assert NO_DATA_MESSAGE == "El BCRA no registra deudas informadas para este CUIT/CUIL."
    assert BCRA_UNAVAILABLE_MESSAGE == (
        "No pudimos consultar la situación en el BCRA en este momento. "
        "Inténtalo de nuevo en unos minutos."
    )
    assert SUMMARY_UNAVAILABLE_MESSAGE == (
        "No pudimos preparar el resumen de la situación en el BCRA. "
        "Inténtalo de nuevo en unos minutos."
    )
