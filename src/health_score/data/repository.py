"""Interfaz de acceso a la cartera almacenada (Principio IV)."""

from typing import Literal, Protocol, runtime_checkable

from health_score.models import ClientData, ClientInput, ClientRecord


class ClientRepository(Protocol):
    """Fuente de clientes. Una nueva fuente (Sheets, otra API) solo implementa esto."""

    def list_clients(self) -> list[ClientInput]: ...

    def get_client(self, client_id: str) -> ClientInput | None: ...


@runtime_checkable
class ClientStore(ClientRepository, Protocol):
    """Fuente de clientes que además admite escritura (CRUD de la spec 003)."""

    def list_records(self) -> list[ClientRecord]: ...

    def get_record(self, client_id: str) -> ClientRecord | None: ...

    def create(self, data: ClientData) -> ClientRecord: ...

    def update(self, client_id: str, data: ClientData) -> ClientRecord | None: ...

    def delete(self, client_id: str) -> bool: ...


class ClientConflictError(Exception):
    """El identificador o el CUIL ya pertenece a otro cliente (HTTP 409)."""

    def __init__(self, field: Literal["client_id", "cuil"], value: str):
        self.field = field
        self.value = value
        if field == "client_id":
            self.message = f"Ya existe un cliente con el identificador '{value}'"
        else:
            self.message = f"El CUIL '{value}' ya está registrado en otro cliente"
        super().__init__(self.message)
