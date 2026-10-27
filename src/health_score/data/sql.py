"""Repositorio de clientes sobre SQLite con SQLAlchemy (spec 003)."""

import uuid

from sqlalchemy import Boolean, Engine, Integer, String, create_engine, delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column
from sqlalchemy.pool import StaticPool

from health_score.models import (
    Client,
    ClientData,
    ClientInput,
    ClientMetrics,
    ClientRecord,
)
from health_score.data.repository import ClientConflictError


class StorageError(Exception):
    """La base de datos no se puede abrir o está dañada."""


class Base(DeclarativeBase):
    pass


class ClientRow(Base):
    __tablename__ = "clients"

    # SQLite solo autoincrementa un INTEGER PRIMARY KEY; `position` conserva el orden de alta
    # y `client_id` es la clave lógica, con su propia restricción de unicidad.
    position: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    cuil: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    # Sin CHECK de rango: los rangos viven solo en METRIC_RANGES (research R10).
    usage: Mapped[int] = mapped_column(Integer, nullable=False)
    support_tickets: Mapped[int] = mapped_column(Integer, nullable=False)
    nps: Mapped[int] = mapped_column(Integer, nullable=False)
    days_to_renewal: Mapped[int] = mapped_column(Integer, nullable=False)

    def to_metrics(self) -> ClientMetrics:
        return ClientMetrics(
            usage=self.usage,
            support_tickets=self.support_tickets,
            nps=self.nps,
            days_to_renewal=self.days_to_renewal,
        )

    def to_client(self) -> Client:
        return Client(
            client_id=self.client_id, cuil=self.cuil, name=self.name, metrics=self.to_metrics()
        )

    def to_record(self) -> ClientRecord:
        return ClientRecord(
            client_id=self.client_id, cuil=self.cuil, name=self.name, metrics=self.to_metrics()
        )


class SeedStateRow(Base):
    __tablename__ = "seed_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False)


def make_engine(url: str) -> Engine:
    # Los endpoints síncronos corren en un pool de hilos; una base en memoria necesita una
    # única conexión compartida para no perder los datos entre sesiones.
    if url in ("sqlite://", "sqlite:///:memory:"):
        return create_engine(
            url, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    return create_engine(url, connect_args={"check_same_thread": False})


def init_schema(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def row_values(client_id: str, data: ClientData) -> dict:
    return {
        "client_id": client_id,
        "cuil": data.cuil,
        "name": data.name,
        **data.metrics.model_dump(),
    }


class SqlClientRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def _rows(self, session: Session) -> list[ClientRow]:
        return list(session.scalars(select(ClientRow).order_by(ClientRow.position)))

    def _row(self, session: Session, client_id: str) -> ClientRow | None:
        return session.scalars(select(ClientRow).where(ClientRow.client_id == client_id)).first()

    def list_clients(self) -> list[ClientInput]:
        with Session(self.engine) as session:
            return [row.to_client() for row in self._rows(session)]

    def get_client(self, client_id: str) -> ClientInput | None:
        with Session(self.engine) as session:
            row = self._row(session, client_id)
            return row.to_client() if row else None

    def list_records(self) -> list[ClientRecord]:
        with Session(self.engine) as session:
            return [row.to_record() for row in self._rows(session)]

    def get_record(self, client_id: str) -> ClientRecord | None:
        with Session(self.engine) as session:
            row = self._row(session, client_id)
            return row.to_record() if row else None

    def create(self, data: ClientData) -> ClientRecord:
        # Único lugar donde se generan identificadores (research R12).
        client_id = str(uuid.uuid4())
        row = ClientRow(**row_values(client_id, data))
        try:
            with Session(self.engine) as session, session.begin():
                session.add(row)
                session.flush()
                return row.to_record()
        except IntegrityError:
            raise self._conflict(client_id, data.cuil) from None

    def update(self, client_id: str, data: ClientData) -> ClientRecord | None:
        values = row_values(client_id, data)
        try:
            with Session(self.engine) as session, session.begin():
                result = session.execute(
                    update(ClientRow).where(ClientRow.client_id == client_id).values(**values)
                )
                if result.rowcount == 0:
                    return None
                return self._row(session, client_id).to_record()
        except IntegrityError:
            raise ClientConflictError("cuil", data.cuil) from None

    def delete(self, client_id: str) -> bool:
        with Session(self.engine) as session, session.begin():
            result = session.execute(delete(ClientRow).where(ClientRow.client_id == client_id))
            return result.rowcount > 0

    def _conflict(self, client_id: str, cuil: str) -> ClientConflictError:
        # La restricción de la base ya rechazó la escritura; aquí solo se identifica el campo
        # para el mensaje. Si colisionan ambos, se informa el identificador primero.
        with Session(self.engine) as session:
            if self._row(session, client_id) is not None:
                return ClientConflictError("client_id", client_id)
        return ClientConflictError("cuil", cuil)
