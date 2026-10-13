"""Núcleo del scoring: funciones puras, sin I/O ni estado (Principio II).

Las entradas llegan ya validadas por Pydantic en el límite, así que aquí no se revalidan.
"""

import math
from collections.abc import Iterable
from fractions import Fraction

from health_score.config import ScoringConfig
from health_score.metrics import Metric
from health_score.models import (
    ClientInput,
    ClientMetrics,
    ClientScoreResult,
    HealthLevel,
    InvalidClient,
    PortfolioResult,
    PortfolioSummary,
    ScoreResult,
    SubScores,
)

HUNDRED = Fraction(100)


def _round_half_up(value: Fraction, ndigits: int = 0) -> Fraction:
    # round() redondea los empates al par y el float puede volver 74,5 en 74,4999…;
    # con Fraction el empate es exacto y siempre sube, así el nivel no depende del azar.
    scale = 10**ndigits
    return Fraction(math.floor(value * scale + Fraction(1, 2)), scale)


def _weights(config: ScoringConfig) -> dict[Metric, Fraction]:
    w = config.weights
    # Fraction(str(...)) evita arrastrar el error binario de un peso como 0.1.
    return {
        Metric.USAGE: Fraction(str(w.usage)),
        Metric.SUPPORT_TICKETS: Fraction(str(w.support_tickets)),
        Metric.NPS: Fraction(str(w.nps)),
        Metric.RENEWAL: Fraction(str(w.renewal)),
    }


def sub_scores(metrics: ClientMetrics, config: ScoringConfig) -> dict[Metric, Fraction]:
    cap = config.normalization.ticket_cap
    horizon = config.normalization.renewal_horizon_days
    return {
        Metric.USAGE: Fraction(metrics.usage),
        Metric.SUPPORT_TICKETS: HUNDRED * (1 - Fraction(min(metrics.support_tickets, cap), cap)),
        Metric.NPS: Fraction(metrics.nps * 10),
        Metric.RENEWAL: HUNDRED * Fraction(min(metrics.days_to_renewal, horizon), horizon),
    }


def compute_score(subs: dict[Metric, Fraction], config: ScoringConfig) -> int:
    # Se divide por la suma de pesos para que no tengan que sumar 100 (research R3).
    weights = _weights(config)
    weighted = sum(weights[metric] * subs[metric] for metric in Metric)
    return int(_round_half_up(weighted / sum(weights.values())))


def classify(score: int, config: ScoringConfig) -> HealthLevel:
    if score >= config.thresholds.top:
        return HealthLevel.TOP
    if score < config.thresholds.at_risk:
        return HealthLevel.AT_RISK
    return HealthLevel.STABLE


def score_client(metrics: ClientMetrics, config: ScoringConfig) -> ScoreResult:
    subs = sub_scores(metrics, config)
    score = compute_score(subs, config)

    def display(metric: Metric) -> float:
        return float(_round_half_up(subs[metric], 2))

    return ScoreResult(
        score=score,
        level=classify(score, config),
        sub_scores=SubScores(
            usage=display(Metric.USAGE),
            support_tickets=display(Metric.SUPPORT_TICKETS),
            nps=display(Metric.NPS),
            renewal=display(Metric.RENEWAL),
        ),
    )


def score_client_input(client: ClientInput, config: ScoringConfig) -> ClientScoreResult:
    if isinstance(client, InvalidClient):
        return ClientScoreResult(
            client_id=client.client_id,
            name=client.name,
            metrics=client.metrics,
            result=None,
            errors=client.errors,
        )
    return ClientScoreResult(
        client_id=client.client_id,
        name=client.name,
        metrics=client.metrics.model_dump(),
        result=score_client(client.metrics, config),
        errors=None,
    )


def score_portfolio(clients: Iterable[ClientInput], config: ScoringConfig) -> PortfolioResult:
    results = [score_client_input(client, config) for client in clients]
    by_level = {level.value: 0 for level in HealthLevel}
    invalid = 0
    for entry in results:
        if entry.result is None:
            invalid += 1
        else:
            by_level[entry.result.level.value] += 1
    return PortfolioResult(
        results=results,
        summary=PortfolioSummary(total=len(results), by_level=by_level, invalid=invalid),
    )
