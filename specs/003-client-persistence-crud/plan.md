# Implementation Plan: Persistencia y CRUD de Clientes

**Branch**: `003-client-persistence-crud` | **Date**: 2026-10-19 (revisión del plan del 2026-10-15) | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-client-persistence-crud/spec.md`

## Summary

Reemplazar la lectura directa de `data/clients.json` por una cartera persistida en SQLite, con
CRUD de clientes (incluido el campo `cuil`, único y validado con el dígito verificador
oficial), identificadores UUID generados por el servicio, carga inicial idempotente de los 20
clientes ficticios, el CUIL visible en el dashboard y pruebas automatizadas. El scoring no
cambia y los contratos existentes solo crecen de forma aditiva.

**Cambios respecto del plan del 2026-10-15** (la spec cambió después de planificar):

- **FR-034**: las respuestas de cartera y de score de un cliente persistido ahora **incluyen**
  `cuil` (antes el plan decía que no). Se agrega `cuil: str | None` a los resultados (R2).
- **FR-035 a FR-039**: el frontend muestra y busca por CUIL (R11). Antes el plan no tocaba el
  frontend.
- **Clarificación 2026-10-19**: el `client_id` de los clientes nuevos lo genera el servicio
  con `uuid.uuid4()`; `POST /clients` ya no recibe `client_id` (R12).

Enfoque técnico (detalle en [research.md](research.md)):

- Nueva implementación del adapter, `SqlClientRepository` (SQLAlchemy 2.x + `sqlite3` de la
  biblioteca estándar), que cumple el `ClientRepository` existente y agrega las operaciones de
  escritura en un Protocol nuevo, `ClientStore`.
- `Client` e `InvalidClient` suman `cuil: str | None = None`. `ClientScoreResult` y
  `PortfolioResult` **no cambian** (las pruebas de contrato de la 001 comparan su forma exacta);
  `GET /portfolio` y `GET /clients/{id}/score` responden con subclases nuevas,
  `StoredPortfolioResult` y `StoredClientScoreResult`, que suman `cuil`. La API agrega el CUIL al
  resultado ya calculado: `scoring.py` no cambia. `POST /portfolio/score` conserva su contrato
  exacto (sin la clave `cuil`) (research R2, revisión de implementación).
- La regla del CUIL (normalización + formato + dígito verificador) vive en un único módulo
  puro, `health_score/cuil.py`, expuesto como tipo Pydantic `Cuil` (Principios V y VI).
- La unicidad de `client_id` y de `cuil` la garantizan restricciones PRIMARY KEY / UNIQUE de
  la base; el repositorio traduce la violación a `ClientConflictError` → HTTP 409.
- La carga inicial corre en el arranque, dentro de una transacción que también registra
  "base inicializada" (tabla `seed_state`), así no repuebla una cartera vaciada (FR-005).
- En el frontend, el formateo y la búsqueda por CUIL viven en un único lugar
  (`frontend/src/lib/display.ts`) y se reutilizan en la tabla, las tarjetas y el detalle.

## Technical Context

**Language/Version**: Python >= 3.12; TypeScript (frontend existente, React 19 + Vite)

**Primary Dependencies**: FastAPI, Pydantic v2, uvicorn (existentes); **SQLAlchemy >= 2.0** (nueva, justificada abajo); `uuid` de la biblioteca estándar. Frontend sin dependencias nuevas.

**Storage**: SQLite en archivo (`data/health_score.db`, configurable con `HEALTH_SCORE_DB`; ignorado por git); `sqlite:///:memory:` en pruebas

**Testing**: pytest + httpx (backend); Vitest + Testing Library (frontend, existentes)

**Target Platform**: servicio local / servidor Linux o Windows con Python; navegador moderno

**Project Type**: web-service (backend `src/health_score`) + web app (`frontend/`)

**Performance Goals**: cartera de 1000 clientes en < 2 s (SC-008); búsqueda en la tabla < 0,5 s (spec 002, SC-004)

**Constraints**: scoring puro e intacto; contratos existentes solo con cambios aditivos; solo datos ficticios; una escritura es atómica; pruebas previas de 001/002 sin cambiar sus expectativas

**Scale/Scope**: ~20 clientes de demo, hasta ~1000; un solo proceso, sin autenticación

### Justificación de dependencias nuevas (Principio I)

| Dependencia | Problema que resuelve | Por qué la biblioteca estándar no basta |
|-------------|-----------------------|------------------------------------------|
| `sqlalchemy>=2.0` | Mapeo de clientes a tablas, restricciones PRIMARY KEY/UNIQUE declarativas, transacciones por solicitud y traducción uniforme de `IntegrityError` | `sqlite3` alcanzaría para SQLite puro, pero pedido explícito del alcance (SQLAlchemy) y permite cambiar de motor detrás del adapter sin reescribir consultas; se evita SQL escrito a mano repetido por operación |

`uuid` y `sqlite3` vienen con Python. No se agrega Alembic: las migraciones de esquema sobre
bases existentes están fuera de alcance (spec, Assumptions); el esquema se crea con
`metadata.create_all`. El frontend no suma dependencias: el formateo del CUIL es una función
de pocas líneas.

## Constitution Check

*GATE: debe pasar antes de Phase 0. Re-evaluado tras el diseño de Phase 1.*

| # | Principio | Cumple | Cómo |
|---|-----------|--------|------|
| I | Simplicidad | Sí | Una sola dependencia nueva, justificada arriba; UUID con la biblioteca estándar; sin Alembic ni capa de servicios extra; frontend sin bibliotecas nuevas |
| II | Separación | Sí | `scoring.py` solo copia `cuil` al resultado como hace con `name`; no lo usa en el cálculo ni importa nada nuevo. La persistencia vive en `data/`, el CUIL en un módulo puro sin I/O. El frontend solo formatea lo que devuelve la API |
| III | Config externa | Sí | Sin pesos/umbrales nuevos; la ruta de la base sale de variable de entorno |
| IV | Adapter | Sí | `SqlClientRepository` implementa `ClientRepository` (+ `ClientStore` para escritura); `LocalJsonClientRepository` se conserva |
| V | Validación en el límite | Sí | `ClientData`/`SeedClient` Pydantic con `Cuil` y `ClientMetrics`; el `client_id` lo genera el servicio, no se recibe; lo guardado es confiable |
| VI | Reglas únicas | Sí | Rangos siguen en `METRIC_RANGES`; dígito verificador solo en `cuil.py`; formato de presentación del CUIL solo en `display.ts` (no valida dígito) |
| VII | Pruebas | Sí | Casos normales, límite e inválidos de métricas y de CUIL; duplicados; UUID generado; idempotencia; reinicios; `cuil` en cartera/score; pruebas de frontend del CUIL |
| VIII | API documentada | Sí | Endpoints con modelos y respuestas 404/409/422 declaradas; `cuil` documentado en `StoredClientScoreResult`; 503 declarado; ver [contracts](contracts/http-api-changes.md) |
| IX | Privacidad | Sí | CUIL sintéticos (`20` + `9000000n` + dígito calculado), también en los fixtures del frontend; regla de generación determinista y documentada |
| X | Incremental | Sí | Historias P1 → P2, cada una demostrable ([quickstart](quickstart.md)); US6 (frontend) se demuestra sola sobre US1/US2 |

Sin violaciones; no se requiere Complexity Tracking.

**Re-evaluación tras Phase 1 e implementación**: el diseño mantiene los diez principios.
Durante la implementación se reforzó II: `scoring.py` no se modifica y el CUIL se agrega en la
capa API (`StoredClientScoreResult`). `test_contract_compat.py` verifica que score, nivel y
sub-scores son idénticos a los de la fuente JSON. Única expectativa previa ajustada (decisión de
la usuaria, 2026-10-19): en `EXPECTED_ENDPOINTS` de `tests/contract/test_http_api.py`, los
modelos de respuesta de `GET /portfolio` y `GET /clients/{id}/score` pasan a ser las subclases
`Stored*`, para que `cuil` quede documentado en OpenAPI (FR-024 frente a SC-009).

## Project Structure

### Documentation (this feature)

```text
specs/003-client-persistence-crud/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api-changes.md
│   └── ui-cuil.md
├── checklists/requirements.md
└── tasks.md             # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
src/health_score/
├── cuil.py                  # NUEVO: normalizar, validar y tipo Pydantic `Cuil` (regla única)
├── models.py                # + cuil opcional en Client e InvalidClient; + ClientData,
│                            #   SeedClient, ClientRecord, StoredClientScoreResult,
│                            #   StoredPortfolioResult (RawClient y ClientScoreResult intactos)
├── data/
│   ├── repository.py        # ClientRepository intacto; + ClientStore, ClientConflictError
│   ├── local_json.py        # ignora la clave `cuil` del archivo compartido con la carga inicial
│   ├── sql.py               # NUEVO: tablas, engine, SqlClientRepository (genera el UUID)
│   ├── seed.py              # NUEVO: carga inicial idempotente desde data/clients.json
│   └── __init__.py          # exporta lo nuevo
└── api/app.py               # + endpoints /clients, handler 409, HEALTH_SCORE_DB, seed en arranque

data/
├── clients.json             # + "cuil" sintético por cliente
└── health_score.db          # generado en ejecución; en .gitignore

frontend/src/
├── api/types.ts             # ClientScoreResult.cuil?: string | null
├── lib/display.ts           # + formatCuil, matchesCuil (único lugar)
├── lib/display.test.ts      # + formateo y búsqueda del CUIL
├── test/fixtures.ts         # + cuil sintético; un cliente sin cuil
├── pages/portfolio/ClientsTable.tsx          # columna CUIL + búsqueda por CUIL
├── pages/portfolio/PortfolioPage.test.tsx    # + columna y búsqueda
├── pages/categories/ClientCard.tsx           # CUIL junto al identificador
├── pages/categories/CategoriesPage.test.tsx  # + CUIL en tarjetas
├── pages/client-detail/ClientDetailSheet.tsx # CUIL en el encabezado
├── pages/client-detail/ClientDetailSheet.test.tsx
└── pages/new-client/NewClientPage.test.tsx   # + no se muestra CUIL

tests/
├── unit/
│   ├── test_cuil.py         # válidos, formato, dígito verificador, resto 1, normalización
│   ├── test_client_models.py
│   ├── test_scoring.py      # + score idéntico con y sin cuil; cuil copiado al resultado
│   └── test_sql_repository.py   # CRUD, UUID, UNIQUE, atomicidad, seed idempotente
└── integration/
    ├── test_clients_api.py      # CRUD HTTP, 404/409/422, client_id en el cuerpo → 422
    ├── test_persistence_restart.py  # reinicio con la misma base, seed no repuebla
    └── test_contract_compat.py  # endpoints existentes: campos previos intactos + `cuil`

pyproject.toml               # + dependencia sqlalchemy>=2.0
.gitignore                   # + data/*.db
README.md                    # documenta HEALTH_SCORE_DB, los endpoints nuevos y el UUID
```

**Structure Decision**: se mantiene el proyecto existente (`src/health_score` + `frontend/`).
La persistencia es un adapter nuevo dentro de `data/`; el CUIL en el frontend se resuelve en
`lib/display.ts` y en los tres componentes que muestran clientes. No se crean paquetes ni
capas adicionales.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
