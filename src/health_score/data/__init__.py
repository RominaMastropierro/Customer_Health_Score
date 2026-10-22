"""Adapters de datos. El núcleo de scoring nunca importa este paquete."""

from health_score.data.local_json import LocalJsonClientRepository
from health_score.data.repository import ClientConflictError, ClientRepository, ClientStore
from health_score.data.seed import SeedReport, run_initial_seed, seed_clients
from health_score.data.sql import SqlClientRepository, StorageError, init_schema, make_engine

__all__ = [
    "ClientConflictError",
    "ClientRepository",
    "ClientStore",
    "LocalJsonClientRepository",
    "SeedReport",
    "SqlClientRepository",
    "StorageError",
    "init_schema",
    "make_engine",
    "run_initial_seed",
    "seed_clients",
]
