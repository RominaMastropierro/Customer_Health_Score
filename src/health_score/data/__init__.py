"""Adapters de datos. El núcleo de scoring nunca importa este paquete."""

from health_score.data.local_json import LocalJsonClientRepository
from health_score.data.repository import ClientRepository

__all__ = ["ClientRepository", "LocalJsonClientRepository"]
