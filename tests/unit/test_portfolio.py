import time

from health_score import Client, ClientMetrics, FieldError, score_client, score_portfolio
from health_score.models import InvalidClient, validate_client_record


def fictitious_client(index: int) -> Client:
    # Valores deterministas que recorren los tres niveles.
    return Client(
        client_id=f"C-{index:04d}",
        name=f"Empresa Ficticia {index}",
        metrics=ClientMetrics(
            usage=(index * 37) % 101,
            support_tickets=(index * 3) % 14,
            nps=index % 11,
            days_to_renewal=(index * 23) % 400,
        ),
    )


def assert_invariants(result) -> None:
    summary = result.summary
    assert set(summary.by_level) == {"Top", "Estable", "En riesgo"}
    assert sum(summary.by_level.values()) + summary.invalid == summary.total
    assert summary.total == len(result.results)
    for entry in result.results:
        assert (entry.result is None) != (entry.errors is None)


def test_valid_portfolio_keeps_order_and_counts(default_config):
    clients = [fictitious_client(i) for i in range(20)]
    result = score_portfolio(clients, default_config)

    assert [entry.client_id for entry in result.results] == [c.client_id for c in clients]
    assert result.summary.total == 20
    assert result.summary.invalid == 0
    assert sum(result.summary.by_level.values()) == 20
    assert_invariants(result)


def test_invalid_client_does_not_stop_the_rest(default_config):
    clients = [fictitious_client(i) for i in range(19)]
    bad = validate_client_record(
        {
            "client_id": "C-BAD",
            "name": "Cliente Inválido Ficticio",
            "metrics": {"usage": 120, "support_tickets": 1, "nps": 8, "days_to_renewal": 60},
        }
    )
    assert isinstance(bad, InvalidClient)
    clients.insert(7, bad)

    result = score_portfolio(clients, default_config)

    assert len(result.results) == 20
    assert sum(1 for entry in result.results if entry.result is not None) == 19
    invalid_entry = result.results[7]
    assert invalid_entry.client_id == "C-BAD"
    assert invalid_entry.result is None
    assert invalid_entry.errors == [
        FieldError(field="metrics.usage", message="debe ser un entero entre 0 y 100")
    ]
    assert result.summary.invalid == 1
    assert_invariants(result)


def test_validate_client_record_reports_every_bad_metric():
    record = validate_client_record(
        {
            "client_id": "C-X",
            "metrics": {"usage": 50.5, "support_tickets": -1, "nps": "7", "extra": 1},
        }
    )
    assert isinstance(record, InvalidClient)
    assert {error.field: error.message for error in record.errors} == {
        "metrics.usage": "debe ser un entero entre 0 y 100",
        "metrics.support_tickets": "debe ser un entero mayor o igual a 0",
        "metrics.nps": "debe ser un entero entre 0 y 10",
        "metrics.days_to_renewal": "campo obligatorio",
        "metrics.extra": "campo no permitido",
    }


def test_validate_client_record_returns_client_when_valid():
    record = validate_client_record(
        {
            "client_id": "C-OK",
            "metrics": {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90},
        }
    )
    assert isinstance(record, Client)
    assert record.name is None


def test_empty_portfolio(default_config):
    result = score_portfolio([], default_config)
    assert result.results == []
    assert result.summary.total == 0
    assert result.summary.by_level == {"Top": 0, "Estable": 0, "En riesgo": 0}
    assert result.summary.invalid == 0


def test_thousand_clients_under_five_seconds(default_config):
    clients = [fictitious_client(i) for i in range(1_000)]
    start = time.perf_counter()
    result = score_portfolio(clients, default_config)
    assert time.perf_counter() - start < 5
    assert result.summary.total == 1_000


# --- Métricas originales en el resultado (spec 002, contrato C1) ---


def test_valid_result_includes_validated_metrics(default_config):
    client = fictitious_client(3)
    entry = score_portfolio([client], default_config).results[0]
    assert entry.metrics == client.metrics.model_dump()
    assert set(entry.metrics) == {"usage", "support_tickets", "nps", "days_to_renewal"}
    assert entry.result is not None


def test_invalid_result_keeps_original_metrics(default_config):
    raw = {"usage": 120, "support_tickets": 1, "nps": 8, "days_to_renewal": 60}
    bad = validate_client_record({"client_id": "C-BAD", "metrics": raw})
    entry = score_portfolio([bad], default_config).results[0]
    assert entry.metrics == raw
    assert entry.result is None
    assert entry.errors == [
        FieldError(field="metrics.usage", message="debe ser un entero entre 0 y 100")
    ]


def test_invalid_result_keeps_non_numeric_metric(default_config):
    bad = validate_client_record(
        {"client_id": "C-STR", "metrics": {"usage": "abc", "support_tickets": 1, "nps": 8,
                                           "days_to_renewal": 60}}
    )
    entry = score_portfolio([bad], default_config).results[0]
    assert entry.metrics["usage"] == "abc"


def test_record_without_metrics_object_has_null_metrics(default_config):
    missing = validate_client_record({"client_id": "C-NONE"})
    not_object = validate_client_record({"client_id": "C-LIST", "metrics": [1, 2]})
    results = score_portfolio([missing, not_object], default_config).results
    assert [entry.metrics for entry in results] == [None, None]
    assert all(entry.errors for entry in results)


def test_metrics_field_does_not_change_scoring(default_config):
    client = fictitious_client(5)
    entry = score_portfolio([client], default_config).results[0]
    assert entry.result == score_client(client.metrics, default_config)
