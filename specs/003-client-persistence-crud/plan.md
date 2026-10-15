# Implementation Plan: Persistencia y CRUD de Clientes

**Branch**: `003-client-persistence-crud` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-client-persistence-crud/spec.md`

## Summary

Reemplazar la lectura directa de `data/clients.json` por una cartera persistida en SQLite, con
CRUD de clientes (incluido el campo `cuil`, único y validado con el dígito verificador
oficial), carga inicial idempotente de los 20 clientes ficticios y pruebas automatizadas.
El scoring, el frontend y los contratos de los endpoints existentes no cambian.

Enfoque técnico (detalle en [research.md](research.md)):

- Nueva implementación del adapter, `SqlClientRepository` (SQLAlchemy 2.x + `sqlite3` de la
  biblioteca estándar), que cumple el `ClientRepository` existente y agrega las operaciones de
  escritura en un Protocol nuevo, `ClientStore`. El scoring sigue recibiendo `Client` sin
  `cuil`; el CUIL vive en un modelo de CRUD aparte (`ClientRecord`), así las respuestas de
  cartera y score no cambian (FR-020, FR-034).
- La regla del CUIL (normalización + formato + dígito verificador) vive en un único módulo
  puro, `health_score/cuil.py`, expuesto como tipo Pydantic `Cuil` (Principios V y VI).
- La unicidad de `client_id` y de `cuil` la garantizan restricciones PRIMARY KEY / UNIQUE de
  la base; el repositorio traduce la violación a `ClientConflictError` → HTTP 409.
- La carga inicial corre en el arranque, dentro de una transacción que también registra
  "base inicializada" (tabla `seed_state`), así no repuebla una cartera vaciada (FR-005).
- `data/clients.json` pasa a ser el archivo de la carga inicial y suma el `cuil` sintético de
  cada cliente (FR-033).

## Technical Context

**Language/Version**: Python >= 3.12 (sin cambios)

**Primary Dependencies**: FastAPI, Pydantic v2, uvicorn (existentes); **SQLAlchemy >= 2.0** (nueva, justificada abajo)

**Storage**: SQLite en archivo (`data/health_score.db`, configurable con `HEALTH_SCORE_DB`; ignorado por git); `sqlite:///:memory:` en pruebas

**Testing**: pytest + httpx (existentes); base temporal por prueba (`tmp_path`) o en memoria

**Target Platform**: servicio local / servidor Linux o Windows con Python

**Project Type**: web-service (backend `src/health_score` + frontend `frontend/` sin cambios)

**Performance Goals**: cartera de 1000 clientes en < 2 s (SC-008)

**Constraints**: scoring puro e intacto; contratos existentes sin cambios; solo datos ficticios; una escritura es atómica

**Scale/Scope**: ~20 clientes de demo, hasta ~1000; un solo proceso, sin autenticación

### Justificación de dependencias nuevas (Principio I)

| Dependencia | Problema que resuelve | Por qué la biblioteca estándar no basta |
|-------------|-----------------------|------------------------------------------|
| `sqlalchemy>=2.0` | Mapeo de `Client` a tablas, restricciones PRIMARY KEY/UNIQUE declarativas, transacciones por solicitud y traducción uniforme de `IntegrityError` | `sqlite3` alcanzaría para SQLite puro, pero pedido explícito del alcance (SQLAlchemy) y permite cambiar de motor detrás del adapter sin reescribir consultas; se evita SQL escrito a mano repetido por operación |

SQLite no es una dependencia: el módulo `sqlite3` viene con Python. No se agrega Alembic:
las migraciones de esquema sobre bases existentes están fuera de alcance (spec, Assumptions);
el esquema se crea con `metadata.create_all`.

## Constitution Check

*GATE: debe pasar antes de Phase 0. Re-evaluado tras el diseño de Phase 1.*

| # | Principio | Cumple | Cómo |
|---|-----------|--------|------|
| I | Simplicidad | Sí | Una sola dependencia nueva, justificada arriba; sin Alembic ni capa de servicios extra |
| II | Separación | Sí | `scoring.py` no se toca; la persistencia vive en `data/`, el CUIL en un módulo puro sin I/O |
| III | Config externa | Sí | Sin pesos/umbrales nuevos; la ruta de la base sale de variable de entorno |
| IV | Adapter | Sí | `SqlClientRepository` implementa `ClientRepository` (+ `ClientStore` para escritura); `LocalJsonClientRepository` se conserva |
| V | Validación en el límite | Sí | `ClientCreate`/`ClientUpdate` Pydantic con `Cuil` y `ClientMetrics`; lo guardado es confiable |
| VI | Reglas únicas | Sí | Rangos siguen en `METRIC_RANGES` (la base no duplica CHECKs de rango); dígito verificador solo en `cuil.py` |
| VII | Pruebas | Sí | Casos normales, límite e inválidos de métricas y de CUIL; duplicados; idempotencia; persistencia entre reinicios |
| VIII | API documentada | Sí | Endpoints con modelos y respuestas 404/409/422 declaradas; ver [contracts](contracts/http-api-changes.md) |
| IX | Privacidad | Sí | CUIL sintéticos (`20` + `9000000n` + dígito calculado); prueba que ningún dato de `data/` es real no es verificable, por eso la regla de generación es determinista y documentada |
| X | Incremental | Sí | Historias P1 → P2, cada una demostrable ([quickstart](quickstart.md)) |

Sin violaciones; no se requiere Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-client-persistence-crud/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http-api-changes.md
├── checklists/requirements.md
└── tasks.md             # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
src/health_score/
├── cuil.py                  # NUEVO: normalizar, validar y tipo Pydantic `Cuil` (regla única)
├── models.py                # + ClientRecord, ClientCreate, ClientUpdate (Client/RawClient intactos)
├── data/
│   ├── repository.py        # ClientRepository intacto; + ClientStore, ClientConflictError
│   ├── local_json.py        # ignora la clave `cuil` del archivo compartido con la carga inicial
│   ├── sql.py               # NUEVO: tablas, engine, SqlClientRepository
│   ├── seed.py              # NUEVO: carga inicial idempotente desde data/clients.json
│   └── __init__.py          # exporta lo nuevo
└── api/app.py               # + endpoints /clients, handler 409, HEALTH_SCORE_DB, seed en arranque

data/
├── clients.json             # + "cuil" sintético por cliente
└── health_score.db          # generado en ejecución; en .gitignore

tests/
├── unit/
│   ├── test_cuil.py         # válidos, formato, dígito verificador, resto 1, normalización
│   ├── test_client_models.py
│   └── test_sql_repository.py   # CRUD, UNIQUE, atomicidad, seed idempotente
└── integration/
    ├── test_clients_api.py      # CRUD HTTP, 404/409/422, orden 422 antes que 409
    ├── test_persistence_restart.py  # reinicio con la misma base, seed no repuebla
    └── test_contract_compat.py  # /portfolio, /clients/{id}/score, POST /score sin cambios

pyproject.toml               # + dependencia sqlalchemy>=2.0
.gitignore                   # + data/*.db
README.md                    # documenta HEALTH_SCORE_DB y los endpoints nuevos
```

**Structure Decision**: se mantiene el proyecto único existente (`src/health_score` +
`frontend/`). La persistencia es un adapter nuevo dentro de `data/`; no se crean paquetes ni
capas adicionales.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
