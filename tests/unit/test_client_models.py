import pytest
from pydantic import ValidationError

from health_score.models import (
    Client,
    ClientData,
    ClientRecord,
    ClientScoreResult,
    InvalidClient,
    PortfolioSummary,
    RawClient,
    SeedClient,
    StoredClientScoreResult,
    StoredPortfolioResult,
)

METRICS = {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}
DATA = {"cuil": "20900000244", "name": "Cliente Ficticio", "metrics": METRICS}


def error_types(model, data) -> dict[tuple, str]:
    with pytest.raises(ValidationError) as info:
        model.model_validate(data)
    return {tuple(e["loc"]): e["type"] for e in info.value.errors()}


def test_client_data_valid_and_name_optional():
    assert ClientData.model_validate(DATA).cuil == "20900000244"
    assert ClientData.model_validate({"cuil": "20-90000024-4", "metrics": METRICS}).name is None


def test_client_data_rejects_client_id():
    assert error_types(ClientData, {**DATA, "client_id": "C-999"}) == {
        ("client_id",): "extra_forbidden"
    }


def test_client_data_requires_cuil():
    data = {k: v for k, v in DATA.items() if k != "cuil"}
    assert error_types(ClientData, data) == {("cuil",): "missing"}


def test_client_data_metric_range_like_client_metrics():
    types = error_types(ClientData, {**DATA, "metrics": {**METRICS, "usage": 101}})
    assert types == {("metrics", "usage"): "less_than_equal"}


def test_client_data_reports_cuil_and_metric_together():
    types = error_types(
        ClientData, {**DATA, "cuil": "20900000016", "metrics": {**METRICS, "usage": 101}}
    )
    assert types == {("cuil",): "cuil_check_digit", ("metrics", "usage"): "less_than_equal"}


def test_seed_client_requires_non_empty_client_id():
    assert SeedClient.model_validate({**DATA, "client_id": "C-001"}).client_id == "C-001"
    assert ("client_id",) in error_types(SeedClient, DATA)
    assert error_types(SeedClient, {**DATA, "client_id": ""}) == {("client_id",): "string_too_short"}


def test_client_record_serializes_cuil_as_text():
    record = ClientRecord(client_id="C-001", cuil="20900000015", metrics=METRICS)
    assert record.model_dump(mode="json")["cuil"] == "20900000015"


def test_cuil_optional_in_client_inputs():
    assert Client(client_id="C-001", metrics=METRICS).cuil is None
    assert InvalidClient(client_id="C-001", errors=[]).cuil is None


def test_client_score_result_keeps_its_contract_without_cuil():
    # POST /portfolio/score conserva el contrato exacto de las specs 001 y 002 (FR-020).
    assert "cuil" not in ClientScoreResult.model_fields


def test_stored_results_add_cuil():
    stored = StoredClientScoreResult(
        client_id="C-001", cuil="20900000015", name=None, metrics=None, result=None, errors=[]
    )
    assert isinstance(stored, ClientScoreResult)
    portfolio = StoredPortfolioResult(
        results=[stored], summary=PortfolioSummary(total=1, by_level={}, invalid=1)
    )
    assert portfolio.model_dump()["results"][0]["cuil"] == "20900000015"


def test_raw_client_still_rejects_cuil():
    raw = {"client_id": "C-001", "cuil": "20900000015", "metrics": METRICS}
    assert error_types(RawClient, raw) == {("cuil",): "extra_forbidden"}
