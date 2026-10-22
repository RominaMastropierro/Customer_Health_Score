# Data Model: Persistencia y CRUD de Clientes

## Tablas (SQLite)

### `clients`

| Columna | Tipo | Restricciones | Notas |
|---------|------|---------------|-------|
| `client_id` | `TEXT` | UNIQUE, NOT NULL (clave lógica) | Inmutable; comparación exacta (sensible a mayúsculas). `C-001` … `C-020` en la carga inicial; UUID v4 (36 caracteres, minúsculas) en los clientes creados por la API |
| `cuil` | `TEXT` | **UNIQUE**, NOT NULL | 11 dígitos sin guiones, siempre texto (preserva ceros iniciales) |
| `name` | `TEXT` | NULL permitido | Ficticio |
| `usage` | `INTEGER` | NOT NULL | Rango solo en `METRIC_RANGES` |
| `support_tickets` | `INTEGER` | NOT NULL | idem |
| `nps` | `INTEGER` | NOT NULL | idem |
| `days_to_renewal` | `INTEGER` | NOT NULL | idem |
| `position` | `INTEGER` | PRIMARY KEY (autoincremental) | Mantiene el orden de inserción para que `/portfolio` conserve el orden del archivo |

Se listan los clientes ordenados por `position`. SQLite solo autoincrementa un
`INTEGER PRIMARY KEY`, por eso `position` es la clave física y `client_id` es la clave
lógica con `UNIQUE NOT NULL`: la unicidad y el 409 por identificador no cambian.

### `seed_state`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| `id` | `INTEGER` | PRIMARY KEY, siempre `1` |
| `done` | `BOOLEAN` | NOT NULL |

Existe la fila ⇔ la carga inicial ya se ejecutó (FR-005). Se escribe en la misma
transacción que la carga.

## Modelos Pydantic (límite de la API)

**Nuevos**

- **`Cuil`** (`health_score/cuil.py`): `str` normalizado a 11 dígitos. Errores:
  `cuil_format` ("el CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)") y
  `cuil_check_digit` ("el dígito verificador del CUIL no es válido").
- **`ClientData`** (frozen, `extra="forbid"`): `cuil: Cuil`, `name: ClientName = None`,
  `metrics: ClientMetrics`. Cuerpo de `POST /clients` y de `PUT /clients/{client_id}`
  (reemplazo completo). Un `client_id` en el cuerpo → 422 "campo no permitido".
- **`SeedClient`** (frozen, `extra="forbid"`): `client_id: ClientId` + los campos de
  `ClientData`. Valida cada registro de `data/clients.json` en la carga inicial.
- **`ClientRecord`** (frozen): `client_id`, `cuil` (11 dígitos, obligatorio), `name`,
  `metrics`. Salida de `POST/GET/PUT /clients`.

**Modificados (aditivo)**

- **`Client`**: + `cuil: str | None = None`. El scoring no lo lee.
- **`InvalidClient`**: + `cuil: str | None = None`.
- **`StoredClientScoreResult(ClientScoreResult)`** (nuevo): + `cuil: str | None = None`.
  Respuesta de `GET /clients/{client_id}/score`.
- **`StoredPortfolioResult(PortfolioResult)`** (nuevo): `results: list[StoredClientScoreResult]`.
  Respuesta de `GET /portfolio`.

**Sin cambios**: `ClientMetrics`, `RawClient` (entrada de `POST /portfolio/score`, sigue sin
`cuil`), `ClientScoreResult` y `PortfolioResult` (respuesta de `POST /portfolio/score`, sin
`cuil`), `ScoreResult`, `PortfolioSummary`.

## Interfaces del adapter

```text
ClientRepository (existente, intacta)
  list_clients() -> list[ClientInput]          # Client con cuil cuando la fuente lo tiene
  get_client(client_id) -> ClientInput | None

ClientStore (nueva; la implementa SqlClientRepository)
  list_records() -> list[ClientRecord]
  get_record(client_id) -> ClientRecord | None
  create(data: ClientData) -> ClientRecord     # genera client_id = str(uuid4()); ClientConflictError
  update(client_id, data: ClientData) -> ClientRecord | None   # None si no existe; ClientConflictError
  delete(client_id) -> bool                    # False si no existe
```

`ClientConflictError(field: "client_id" | "cuil", value: str)` lo traduce la API a 409.
La carga inicial inserta `SeedClient` con su propio `client_id` (función de `seed.py`, no
`create`).

## Modelo del frontend (`frontend/src/api/types.ts`)

- **`ClientScoreResult`**: + `cuil?: string | null` (opcional y anulable, FR-039).
- **Presentación del CUIL** (`lib/display.ts`): `formatCuil(value)` → `XX-XXXXXXXX-X` /
  valor tal cual / `"—"`; `matchesCuil(cuil, query)`. No se almacena ni se envía a la API.

## Reglas de validación

| Regla | Dónde se define | Dónde se aplica |
|-------|-----------------|-----------------|
| Rangos de métricas | `METRIC_RANGES` (sin cambios) | `ClientMetrics` en alta, edición y carga inicial |
| Formato y dígito del CUIL | `health_score/cuil.py` | `ClientData`, `SeedClient` |
| Unicidad `client_id` / `cuil` | UNIQUE (`client_id`, `cuil`) | `SqlClientRepository` → 409 |
| Generación del `client_id` | `SqlClientRepository.create` (`uuid.uuid4`) | Alta por API |
| 422 antes que 409 | orden natural: Pydantic antes del repositorio | API |
| Formato de presentación del CUIL | `frontend/src/lib/display.ts` | Tabla, tarjetas, detalle |

## Transiciones de estado

- Cliente: `inexistente → creado (UUID asignado) → (actualizado)* → eliminado`. Eliminar
  libera el `cuil`; el `client_id` eliminado no se vuelve a generar.
- Base: `sin seed_state → (carga inicial) → con seed_state`. Nunca vuelve atrás.
