import json

from health_score import Client
from health_score.data import LocalJsonClientRepository
from health_score.models import InvalidClient

VALID_METRICS = {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}


def write_clients(tmp_path, records) -> str:
    path = tmp_path / "clients.json"
    path.write_text(json.dumps(records), encoding="utf-8")
    return str(path)


def test_keeps_valid_and_invalid_records(tmp_path):
    path = write_clients(
        tmp_path,
        [
            {"client_id": "C-001", "name": "Acme Ficticia", "metrics": VALID_METRICS},
            {"client_id": "C-002", "metrics": {**VALID_METRICS, "nps": 11}},
            {"name": "Sin Id Ficticio", "metrics": VALID_METRICS},
        ],
    )
    clients = LocalJsonClientRepository(path).list_clients()

    assert len(clients) == 3
    assert isinstance(clients[0], Client)
    assert clients[0].name == "Acme Ficticia"
    assert isinstance(clients[1], InvalidClient)
    assert clients[1].client_id == "C-002"
    assert [e.field for e in clients[1].errors] == ["metrics.nps"]
    assert isinstance(clients[2], InvalidClient)
    assert clients[2].client_id is None
    assert [e.field for e in clients[2].errors] == ["client_id"]


def test_get_client(tmp_path):
    path = write_clients(
        tmp_path, [{"client_id": "C-001", "name": "Acme Ficticia", "metrics": VALID_METRICS}]
    )
    repository = LocalJsonClientRepository(path)
    assert repository.get_client("C-001").client_id == "C-001"
    assert repository.get_client("NO-EXISTE") is None


def test_shipped_portfolio_loads_twenty_valid_clients():
    clients = LocalJsonClientRepository("data/clients.json").list_clients()
    assert len(clients) == 20
    assert all(isinstance(client, Client) for client in clients)
    assert [client.client_id for client in clients] == [f"C-{i:03d}" for i in range(1, 21)]
