import pytest

from conftest import DEFAULT_CONFIG_DATA, merge
from health_score import ClientMetrics, ConfigError, load_config, score_client


def without(data: dict, section: str, key: str | None = None) -> dict:
    copy = merge(data, {})
    if key is None:
        del copy[section]
    else:
        copy[section] = {k: v for k, v in copy[section].items() if k != key}
    return copy


def assert_config_error(write_config, data, expected_path: str) -> None:
    with pytest.raises(ConfigError) as excinfo:
        load_config(write_config(data))
    assert expected_path in str(excinfo.value)


def test_shipped_config_has_fr012_defaults(default_config):
    assert load_config("config/scoring.json") == default_config


def test_missing_file_raises(tmp_path):
    with pytest.raises(ConfigError, match="no existe"):
        load_config(tmp_path / "no-existe.json")


def test_invalid_json_raises(write_config):
    with pytest.raises(ConfigError, match="JSON"):
        load_config(write_config("{ weights: "))


@pytest.mark.parametrize("section", list(DEFAULT_CONFIG_DATA))
def test_missing_section_raises(write_config, section):
    assert_config_error(write_config, without(DEFAULT_CONFIG_DATA, section), section)


@pytest.mark.parametrize(
    ("section", "key"),
    [(section, key) for section, keys in DEFAULT_CONFIG_DATA.items() for key in keys],
)
def test_missing_nested_key_raises(write_config, section, key):
    data = without(DEFAULT_CONFIG_DATA, section, key)
    assert_config_error(write_config, data, f"{section}.{key}")


def test_extra_key_raises(write_config):
    data = merge(DEFAULT_CONFIG_DATA, {"thresholds": {"critical": 10}})
    assert_config_error(write_config, data, "thresholds.critical")


@pytest.mark.parametrize(
    ("overrides", "expected_path"),
    [
        ({"weights": {"usage": -1}}, "weights.usage"),
        ({"weights": {"nps": True}}, "weights.nps"),
        ({"weights": {"usage": 0, "support_tickets": 0, "nps": 0, "renewal": 0}}, "weights"),
        ({"thresholds": {"top": 101}}, "thresholds.top"),
        ({"thresholds": {"top": -1}}, "thresholds.top"),
        ({"thresholds": {"at_risk": -1}}, "thresholds.at_risk"),
        ({"thresholds": {"at_risk": 101}}, "thresholds.at_risk"),
        ({"thresholds": {"top": 60, "at_risk": 60}}, "thresholds"),
        ({"thresholds": {"top": 60, "at_risk": 80}}, "thresholds"),
        ({"thresholds": {"top": 75.5}}, "thresholds.top"),
        ({"normalization": {"ticket_cap": 0}}, "normalization.ticket_cap"),
        ({"normalization": {"ticket_cap": -1}}, "normalization.ticket_cap"),
        ({"normalization": {"renewal_horizon_days": 0}}, "normalization.renewal_horizon_days"),
    ],
)
def test_invalid_values_raise_with_field_path(write_config, overrides, expected_path):
    assert_config_error(write_config, merge(DEFAULT_CONFIG_DATA, overrides), expected_path)


def test_cross_field_messages_explain_the_rule(write_config):
    with pytest.raises(ConfigError, match="at_risk debe ser menor que top"):
        load_config(write_config(merge(DEFAULT_CONFIG_DATA, {"thresholds": {"at_risk": 90}})))
    zero = {"weights": {"usage": 0, "support_tickets": 0, "nps": 0, "renewal": 0}}
    with pytest.raises(ConfigError, match="suma de los pesos"):
        load_config(write_config(merge(DEFAULT_CONFIG_DATA, zero)))


def test_single_zero_weight_is_valid(write_config):
    config = load_config(write_config(merge(DEFAULT_CONFIG_DATA, {"weights": {"nps": 0}})))
    assert config.weights.nps == 0


def test_weight_scale_does_not_matter(write_config, default_config):
    ones = {"weights": {"usage": 1, "support_tickets": 1, "nps": 1, "renewal": 1}}
    scaled = load_config(write_config(merge(DEFAULT_CONFIG_DATA, ones)))
    for values in [(60, 3, 7, 90), (90, 0, 9, 300), (10, 15, 2, 10), (33, 4, 6, 77)]:
        metrics = ClientMetrics(
            usage=values[0], support_tickets=values[1], nps=values[2], days_to_renewal=values[3]
        )
        assert score_client(metrics, scaled) == score_client(metrics, default_config)
