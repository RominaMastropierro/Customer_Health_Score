"""Motor de scoring de salud de clientes: interfaz pública de la biblioteca."""

from health_score.config import ConfigError, ScoringConfig, load_config
from health_score.metrics import METRIC_RANGES, Metric
from health_score.models import (
    Client,
    ClientData,
    ClientMetrics,
    ClientRecord,
    ClientScoreResult,
    FieldError,
    HealthLevel,
    PortfolioResult,
    ScoreResult,
    SubScores,
)
from health_score.scoring import classify, score_client, score_portfolio

__all__ = [
    "METRIC_RANGES",
    "Client",
    "ClientData",
    "ClientMetrics",
    "ClientRecord",
    "ClientScoreResult",
    "ConfigError",
    "FieldError",
    "HealthLevel",
    "Metric",
    "PortfolioResult",
    "ScoreResult",
    "ScoringConfig",
    "SubScores",
    "classify",
    "load_config",
    "score_client",
    "score_portfolio",
]
