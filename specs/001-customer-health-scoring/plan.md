# Implementation Plan: Motor de Scoring de Salud de Clientes

**Branch**: `001-customer-health-scoring` | **Date**: 2026-10-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-customer-health-scoring/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Motor que recibe cuatro métricas por cliente (uso %, tickets de 30 días, NPS, días hasta
renovación) y devuelve un score entero 0–100, un nivel (Top / Estable / En riesgo) y el
sub-score de cada métrica. El núcleo es un paquete Python de funciones puras, sin I/O, que
recibe métricas ya validadas y una configuración ya validada. Alrededor del núcleo hay tres
capas finas: carga y validación de la configuración JSON, un adapter de datos locales con
clientes ficticios, y una API FastAPI que expone el motor (cliente individual, cartera enviada
en la solicitud, cartera almacenada, configuración activa). Cualquier interfaz usa el mismo
núcleo y obtiene resultados idénticos.

## Technical Context

**Language/Version**: Python 3.12

**Primary Dependencies**: FastAPI, Pydantic v2, Uvicorn (servidor ASGI para ejecutar la API).
Solo para desarrollo: pytest y httpx (requerido por el `TestClient` de FastAPI).

**Storage**: archivos JSON locales: `config/scoring.json` (configuración) y
`data/clients.json` (cartera ficticia), leídos detrás de un adapter. Sin base de datos.

**Testing**: pytest (unit, contract, integration)

**Target Platform**: cualquier SO con Python 3.12 (desarrollo en Windows 11); servidor local

**Project Type**: biblioteca Python + web service (API HTTP)

**Performance Goals**: un cliente en < 1 s de punta a punta; cartera de 1.000 clientes en < 5 s
(SC-002, SC-003). El cálculo es aritmética simple, así que el margen es amplio.

**Constraints**: núcleo puro y determinista (sin fecha, sin red, sin estado global); pesos y
umbrales solo en JSON; solo datos ficticios.

**Scale/Scope**: carteras de hasta ~1.000 clientes por solicitud; una configuración activa.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra la constitución v2.0.0.

| # | Principio | Cumplimiento en este plan | Estado |
|---|-----------|---------------------------|--------|
| I | Simplicidad | Stdlib para el cálculo (`fractions`, `enum`, `json`). Dependencias justificadas abajo. Un solo paquete. | ✅ |
| II | Separación de responsabilidades | `scoring.py` contiene funciones puras y no importa la API, el adapter ni el sistema de archivos. La API y el adapter usan solo la interfaz pública del paquete. | ✅ |
| III | Configuración externa | Pesos, umbrales, tope de tickets y horizonte de renovación viven en `config/scoring.json`. Se validan al cargar; si son inválidos, se lanza `ConfigError` y no hay valores por defecto implícitos. | ✅ |
| IV | Acceso a datos desacoplado | El protocolo `ClientRepository` tiene una única implementación inicial, `LocalJsonClientRepository`. La API recibe el repositorio por inyección de dependencias. | ✅ |
| V | Validación en el límite | Modelos Pydantic estrictos para requests HTTP, archivo de clientes y configuración. El núcleo no revalida. | ✅ |
| VI | Reglas de negocio explícitas | Los rangos por métrica se definen una sola vez en `metrics.py` (`METRIC_RANGES`) y de ahí los usan los modelos y los tests. La asignación de nivel se define una vez en `classify()`. | ✅ |
| VII | Tests | Tests pytest de casos normales, de los extremos de cada rango y de valores inválidos (−1, 101, 11, decimales, strings, bool, faltantes), más tests de configuración y de contrato. | ✅ |
| VIII | API documentada | Cada endpoint declara `response_model`, los modelos de request y los códigos 404/422 en `responses=`. `/docs` y `/openapi.json` se generan automáticamente. | ✅ |
| IX | Privacidad | `data/clients.json` y los fixtures usan nombres y valores inventados. | ✅ |
| X | Incremental | Cada user story se puede demostrar por separado: US1 por `POST /score`, US2 cambiando el JSON, US3 por los endpoints de cartera, US4 por el test de paridad entre la biblioteca y la API. | ✅ |

**Dependencias justificadas (Principio I)**:

- **FastAPI**: lo exige la constitución para la API y genera OpenAPI (Principio VIII). La
  stdlib no ofrece un framework HTTP con documentación automática.
- **Pydantic v2**: lo exige la constitución para validar en el límite (Principio V).
- **Uvicorn**: FastAPI necesita un servidor ASGI para ejecutarse y la stdlib no incluye uno.
- **pytest** (dev): lo exige la constitución (Principio VII).
- **httpx** (dev): el `TestClient` de FastAPI lo necesita para los tests de contrato.

**Resultado del gate**: PASS, sin violaciones.

**Re-evaluación post-diseño (Phase 1)**: PASS. El diseño de [data-model.md](data-model.md) y
[contracts/](contracts/) no introdujo dependencias, valores de scoring hardcodeados ni
dependencias del núcleo hacia I/O. La evaluación de cartera valida cada cliente por separado
con Pydantic en el límite; ver research.md, decisión R5.

## Project Structure

### Documentation (this feature)

```text
specs/001-customer-health-scoring/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── python-api.md            # interfaz pública de la biblioteca
│   ├── http-api.md              # endpoints, requests, responses y errores
│   └── scoring-config.schema.json
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
pyproject.toml                    # dependencias y configuración de pytest
config/
└── scoring.json                  # configuración por defecto (FR-012)
data/
└── clients.json                  # cartera ficticia (Principio IX)
src/
└── health_score/
    ├── __init__.py               # interfaz pública: score_client, score_portfolio, load_config…
    ├── metrics.py                # Metric enum + METRIC_RANGES (única definición de rangos)
    ├── models.py                 # modelos Pydantic: ClientMetrics, ScoreResult, PortfolioResult…
    ├── config.py                 # ScoringConfig + load_config(path) + ConfigError
    ├── scoring.py                # funciones puras: sub_scores, compute_score, classify, score_*
    ├── data/
    │   ├── __init__.py
    │   ├── repository.py         # Protocol ClientRepository
    │   └── local_json.py         # LocalJsonClientRepository
    └── api/
        ├── __init__.py
        └── app.py                # FastAPI app, endpoints, inyección de config y repositorio
tests/
├── conftest.py                   # fixtures: config por defecto, clientes ficticios
├── unit/
│   ├── test_metrics_validation.py
│   ├── test_config.py
│   ├── test_scoring.py
│   └── test_portfolio.py
├── contract/
│   └── test_http_api.py          # respuestas y códigos según contracts/http-api.md
└── integration/
    ├── test_local_repository.py
    └── test_interface_parity.py  # biblioteca vs API → resultados idénticos (US4, SC-005)
```

**Structure Decision**: un solo proyecto con layout `src/`. El paquete `health_score` es la
biblioteca reutilizable. `health_score.api` y `health_score.data` son capas externas que
dependen del núcleo, nunca al revés. En esta feature no hay frontend (ver
[research.md](research.md), decisión R8). Una UI futura consumiría la API o la biblioteca sin
cambiar el núcleo.

## Complexity Tracking

Sin violaciones de la constitución. No aplica.
