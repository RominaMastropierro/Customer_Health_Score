import pytest

from health_score import ClientMetrics, HealthLevel, classify, score_client


def metrics(usage, support_tickets, nps, days_to_renewal) -> ClientMetrics:
    return ClientMetrics(
        usage=usage,
        support_tickets=support_tickets,
        nps=nps,
        days_to_renewal=days_to_renewal,
    )


def sub_scores_tuple(result) -> tuple[float, float, float, float]:
    s = result.sub_scores
    return (s.usage, s.support_tickets, s.nps, s.renewal)


def test_healthy_client_is_top(default_config):
    result = score_client(metrics(90, 0, 9, 300), default_config)
    assert result.score == 95
    assert result.level is HealthLevel.TOP
    assert sub_scores_tuple(result) == (90.0, 100.0, 90.0, 100.0)


def test_intermediate_client_rounds_half_up(default_config):
    # 60/70/70/50 promedian exactamente 62,5: half-up da 63 (round() daría 62).
    result = score_client(metrics(60, 3, 7, 90), default_config)
    assert result.score == 63
    assert result.level is HealthLevel.STABLE
    assert sub_scores_tuple(result) == (60.0, 70.0, 70.0, 50.0)


def test_at_risk_client_with_tickets_above_cap(default_config):
    result = score_client(metrics(10, 15, 2, 10), default_config)
    assert result.score == 9
    assert result.level is HealthLevel.AT_RISK
    assert result.sub_scores.support_tickets == 0.0
    assert result.sub_scores.renewal == 5.56


def test_days_above_horizon_give_full_renewal(default_config):
    result = score_client(metrics(50, 0, 5, 10_000), default_config)
    assert result.sub_scores.renewal == 100.0


@pytest.mark.parametrize(
    "values",
    [(0, 0, 10, 0), (100, 0, 10, 0), (0, 10, 0, 0), (0, 10_000, 0, 0), (100, 0, 10, 10_000)],
)
def test_boundary_inputs_stay_in_range(default_config, values):
    result = score_client(metrics(*values), default_config)
    assert 0 <= result.score <= 100
    for value in sub_scores_tuple(result):
        assert 0 <= value <= 100


def test_extremes_reach_0_and_100(default_config):
    assert score_client(metrics(0, 10, 0, 0), default_config).score == 0
    assert score_client(metrics(100, 0, 10, 10_000), default_config).score == 100


def test_is_deterministic(default_config):
    first = score_client(metrics(60, 3, 7, 90), default_config)
    second = score_client(metrics(60, 3, 7, 90), default_config)
    assert first == second


@pytest.mark.parametrize(
    ("score", "level"),
    [
        (100, HealthLevel.TOP),
        (75, HealthLevel.TOP),
        (74, HealthLevel.STABLE),
        (50, HealthLevel.STABLE),
        (49, HealthLevel.AT_RISK),
        (0, HealthLevel.AT_RISK),
    ],
)
def test_classify_thresholds_are_inclusive_upward(default_config, score, level):
    assert classify(score, default_config) is level


def test_higher_nps_weight_raises_score_of_promoter(default_config, config_factory):
    client = metrics(20, 8, 10, 20)
    default_score = score_client(client, default_config).score
    nps_heavy = score_client(client, config_factory(weights={"nps": 50})).score
    assert nps_heavy > default_score


def test_lower_top_threshold_promotes_client(default_config, config_factory):
    client = metrics(80, 3, 7, 120)
    with_defaults = score_client(client, default_config)
    assert (with_defaults.score, with_defaults.level) == (72, HealthLevel.STABLE)
    lowered = score_client(client, config_factory(thresholds={"top": 70}))
    assert (lowered.score, lowered.level) == (72, HealthLevel.TOP)


def test_normalization_parameters_change_sub_scores(default_config, config_factory):
    client = metrics(60, 3, 7, 90)
    custom = config_factory(normalization={"ticket_cap": 6, "renewal_horizon_days": 90})
    before = score_client(client, default_config).sub_scores
    after = score_client(client, custom).sub_scores
    assert (before.support_tickets, before.renewal) == (70.0, 50.0)
    assert (after.support_tickets, after.renewal) == (50.0, 100.0)


def test_zero_weight_metric_has_no_effect(config_factory):
    config = config_factory(weights={"nps": 0})
    low_nps = score_client(metrics(60, 3, 0, 90), config)
    high_nps = score_client(metrics(60, 3, 10, 90), config)
    assert low_nps.score == high_nps.score
