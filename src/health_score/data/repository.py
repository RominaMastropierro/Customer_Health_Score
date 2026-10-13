"""Interfaz de acceso a la cartera almacenada (Principio IV)."""

from typing import Protocol

from health_score.models import ClientInput


class ClientRepository(Protocol):
    """Fuente de clientes. Una nueva fuente (Sheets, otra API) solo implementa esto."""

    def list_clients(self) -> list[ClientInput]: ...

    def get_client(self, client_id: str) -> ClientInput | None: ...
