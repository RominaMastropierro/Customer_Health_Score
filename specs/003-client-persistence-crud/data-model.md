# Data Model: Persistencia y CRUD de Clientes

## Tablas (SQLite)

### `clients`

| Columna | Tipo | Restricciones | Notas |
|---------|------|---------------|-------|
| `client_id` | `TEXT` | PRIMARY KEY, NOT NULL, longitud ≥ 1 (Pydantic) | Inmutable; comparación exacta (sensible a mayúsculas) |
| `cuil` | `TEXT` | **UNIQUE**, NOT NULL | 11 dígitos sin guiones, siempre texto (preserva ceros iniciales) |
| `name` | `TEXT` | NULL permitido | Ficticio |
| `usage` | `INTEGER` | NOT NULL | Rango solo en `METRIC_RANGES` |
| `support_tickets` | `INTEGER` | NOT NULL | idem |
| `nps` | `INTEGER` | NOT NULL | idem |
| `days_to_renewal` | `INTEGER` | NOT NULL | idem |
| `position` | `INTEGER` | NOT NULL, autoincremental | Mantiene el orden de inserción para que `/portfolio` conserve el orden del archivo |

Se listan los clientes ordenados por `position`.

### `seed_state`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `INTEGER` | PRIMARY KEY, siempre `1` |
| `done` | `BOOLEAN` | NOT NULL |

Existe la fila ⇔ la carga inicial ya se ejecutó (FR-005). Se escribe en la misma
transacción que la carga.

## Modelos Pydantic (límite de la API)

- **`Cuil`** (`health_score/cuil.py`): `str` normalizado a 11 dígitos. Errores:
  `cuil_format` ("el CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)") y
  `cuil_check_digit` ("el dígito verificador del CUIL no es válido").
- **`ClientCreate`** (frozen, `extra="forbid"`): `client_id: ClientId`, `cuil: Cuil`,
  `name: ClientName = None`, `metrics: ClientMetrics`. Entrada de `POST /clients` y de la
  carga inicial.
- **`ClientUpdate`** (frozen, `extra="forbid"`): `cuil: Cuil`, `name: ClientName = None`,
  `metrics: ClientMetrics`. Entrada de `PUT /clients/{client_id}` (reemplazo completo).
- **`ClientRecord`** (frozen): `client_id`, `cuil` (11 dígitos), `name`, `metrics`. Salida de
  `POST/GET/PUT /clients`.
- **Sin cambios**: `Client`, `ClientMetrics`, `RawClient`, `InvalidClient`, `ClientScoreResult`,
  `PortfolioResult`.

## Interfaces del adapter

```text
ClientRepository (existente, intacta)
  list_clients() -> list[ClientInput]
  get_client(client_id) -> ClientInput | None

ClientStore (nueva; la implementa SqlClientRepository)
  list_records() -> list[ClientRecord]
  get_record(client_id) -> ClientRecord | None
  create(data: ClientCreate) -> ClientRecord      # ClientConflictError si client_id o cuil existen
  update(client_id, data: ClientUpdate) -> ClientRecord | None   # None si no existe; ClientConflictError
  delete(client_id) -> bool                        # False si no existe
```

`ClientConflictError(field: "client_id" | "cuil", value: str)` lo traduce la API a 409.

## Reglas de validación

| Regla | Dónde se define | Dónde se aplica |
|-------|-----------------|-----------------|
| Rangos de métricas | `METRIC_RANGES` (sin cambios) | `ClientMetrics` en alta, edición y carga inicial |
| Formato y dígito del CUIL | `health_score/cuil.py` | `ClientCreate`, `ClientUpdate`, carga inicial |
| Unicidad `client_id` / `cuil` | PRIMARY KEY / UNIQUE | `SqlClientRepository` → 409 |
| 422 antes que 409 | orden natural: Pydantic antes del repositorio | API |

## Transiciones de estado

- Cliente: `inexistente → creado → (actualizado)* → eliminado`. Eliminar libera el
  `client_id` y el `cuil`.
- Base: `sin seed_state → (carga inicial) → con seed_state`. Nunca vuelve atrás.
