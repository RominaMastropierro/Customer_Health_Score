"""Carga inicial idempotente de la cartera desde el archivo de datos ficticios (research R6)."""

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import Engine, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from health_score.data.sql import ClientRow, SeedStateRow, row_values
from health_score.models import SeedClient

ALREADY_EXISTS = "ya existe el identificador o el CUIL"


@dataclass
class SeedReport:
    inserted: list[str] = field(default_factory=list)
    # (identificador o posición en el archivo, motivo en español)
    skipped: list[tuple[str, str]] = field(default_factory=list)


def load_seed_records(path: str | os.PathLike) -> list:
    records = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(records, list):
        raise ValueError(f"{path} debe contener una lista de clientes")
    return records


def _label(record, index: int) -> str:
    client_id = record.get("client_id") if isinstance(record, dict) else None
    return client_id if isinstance(client_id, str) and client_id else f"registro {index + 1}"


def _insert(session: Session, records: list) -> SeedReport:
    report = SeedReport()
    for index, raw in enumerate(records):
        try:
            client = SeedClient.model_validate(raw)
        except ValidationError as exc:
            reason = "; ".join(
                f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()
            )
            report.skipped.append((_label(raw, index), reason))
            continue
        # ON CONFLICT DO NOTHING: nunca modifica un cliente que ya existe (FR-004).
        statement = (
            sqlite_insert(ClientRow)
            .values(**row_values(client.client_id, client))
            .on_conflict_do_nothing()
        )
        if session.execute(statement).rowcount:
            report.inserted.append(client.client_id)
        else:
            report.skipped.append((client.client_id, ALREADY_EXISTS))
    return report


def seed_clients(engine: Engine, path: str | os.PathLike) -> SeedReport:
    """Agrega los clientes del archivo que falten, sin mirar si la base ya fue inicializada."""
    records = load_seed_records(path)
    with Session(engine) as session, session.begin():
        return _insert(session, records)


def run_initial_seed(engine: Engine, path: str | os.PathLike) -> SeedReport | None:
    """Carga inicial del arranque: solo si la base nunca fue inicializada (FR-005).

    La marca `seed_state` se escribe en la misma transacción, así una cartera vaciada por
    eliminaciones no se vuelve a poblar y un archivo inválido no deja datos parciales.
    """
    with Session(engine) as session, session.begin():
        if session.scalars(select(SeedStateRow)).first() is not None:
            return None
        report = _insert(session, load_seed_records(path))
        session.add(SeedStateRow(id=1, done=True))
        return report
