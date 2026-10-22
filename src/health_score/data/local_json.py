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
        self._clients = [validate_client_record(_without_cuil(record)) for record in records]

    def list_clients(self) -> list[ClientInput]:
        return list(self._clients)

    def get_client(self, client_id: str) -> ClientInput | None:
        return next((c for c in self._clients if c.client_id == client_id), None)


def _without_cuil(record):
    # El archivo es compartido con la carga inicial de la base (spec 003) y RawClient no
    # acepta `cuil`; este adapter conserva su comportamiento de las specs 001 y 002.
    if isinstance(record, dict):
        return {key: value for key, value in record.items() if key != "cuil"}
    return record
