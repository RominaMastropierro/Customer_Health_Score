"""Repositorio de clientes sobre un archivo JSON local con datos ficticios."""

import json
import os
from pathlib import Path

from health_score.models import ClientInput, validate_client_record


class LocalJsonClientRepository:
    def __init__(self, path: str | os.PathLike):
        records = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(records, list):
            raise ValueError(f"{path} debe contener una lista de clientes")
        # Los registros inválidos se conservan como errores para reportarlos igual que
        # en POST /portfolio/score (research R9), en lugar de descartarlos en silencio.
        self._clients = [validate_client_record(record) for record in records]

    def list_clients(self) -> list[ClientInput]:
        return list(self._clients)

    def get_client(self, client_id: str) -> ClientInput | None:
        return next((c for c in self._clients if c.client_id == client_id), None)
