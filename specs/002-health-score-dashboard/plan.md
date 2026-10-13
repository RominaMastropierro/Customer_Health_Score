# Implementation Plan: Pantallas del Dashboard de Salud de Clientes

**Branch**: `002-health-score-dashboard` | **Date**: 2026-10-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-health-score-dashboard/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Frontend web que reproduce el prototipo `docs/front_desing_assets/B2B SaaS Dashboard Design`
(Cartera, Por categoría, Nuevo cliente, panel de detalle) más una vista de configuración de
solo lectura. Todos los datos salen de la API FastAPI de la spec 001 y la UI no calcula
scores ni niveles.

El trabajo se hace en dos fases:

- **Fase A (backend, aditiva)**: la API de la spec 001 pasa a devolver las métricas
  originales de cada cliente (decisión Q1: A), traduce al español los mensajes de 422 y expone
  `GET /metrics` con los rangos. Así la UI no duplica rangos ni reglas.
- **Fase B (frontend)**: proyecto `frontend/` con Vite + React + TypeScript + Tailwind v4 +
  shadcn/ui + Recharts. Navegación por hash, `fetch` nativo y proxy de Vite hacia la API.

## Technical Context

**Language/Version**: Python 3.12+ (backend, sin cambios de versión); TypeScript 5.7 + React 19 (frontend)

**Primary Dependencies**: backend sin dependencias nuevas (FastAPI, Pydantic v2, Uvicorn).
Frontend: Vite 8, React 19, Tailwind CSS 4 (`@tailwindcss/vite`), shadcn/ui (Radix UI,
`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) y Recharts. Ver la
justificación abajo.

**Storage**: N/A en el frontend; la preferencia de tema va en `localStorage`. El backend sigue
con `config/scoring.json` y `data/clients.json`.

**Testing**: pytest (backend: contrato de C1–C3, paridad) y Vitest + React Testing Library +
jsdom (frontend: cliente de API y pantallas)

**Target Platform**: navegadores modernos (Chrome, Edge, Firefox, Safari actuales), de 360 px
de ancho en adelante; API local en `127.0.0.1:8000`

**Project Type**: aplicación web (frontend SPA + web service existente)

**Performance Goals**: Cartera con 1.000 clientes visible en < 3 s; búsqueda o filtro en
< 0,5 s (SC-004); score de un cliente nuevo en < 1 min de interacción (SC-003)

**Constraints**:
- cero lógica de scoring en la UI (FR-004, Principio II);
- cero datos simulados en la UI (FR-005);
- rangos solo desde `GET /metrics` (Principio VI);
- textos en español;
- accesibilidad por teclado;
- solo utilidades de Tailwind para estilos.

**Scale/Scope**: 4 vistas + 1 panel; ~1.000 clientes por cartera; 5 endpoints consumidos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra la constitución v2.1.0.

| # | Principio | Cumplimiento en este plan | Estado |
|---|-----------|---------------------------|--------|
| I | Simplicidad | Sin router, sin librería de fetching, sin virtualización (research D6, D7, D12). Las dependencias del frontend son las del stack aprobado más las justificadas abajo. Backend sin dependencias nuevas. | ✅ |
| II | Separación de responsabilidades | El núcleo `scoring.py` solo copia `metrics` al resultado (función pura). La UI consume únicamente la API y su aritmética es solo de presentación, enumerada en research D8. | ✅ |
| III | Configuración externa | Sin cambios: pesos y umbrales siguen en `config/scoring.json`. La UI los muestra en solo lectura desde `GET /config` y no tiene valores propios. | ✅ |
| IV | Acceso a datos desacoplado | El repositorio no cambia de interfaz; `LocalJsonClientRepository` sigue siendo la única fuente. La UI no sabe de dónde vienen los datos. | ✅ |
| V | Validación en el límite | El servidor sigue validando todo con Pydantic. Los límites de los controles de la UI son solo ayuda (FR-006) y salen del servidor. | ✅ |
| VI | Reglas de negocio explícitas | Los rangos solo están en `METRIC_RANGES`; los mensajes, en `range_message`. Ambos llegan a la UI por API (C2, C3). La regla "inválido = `result` null" es la del contrato. | ✅ |
| VII | Calidad y pruebas | pytest cubre C1–C3 y la paridad biblioteca/API; la suite completa debe pasar. Las reglas de scoring no cambian, así que los tests normales, límite e inválidos existentes se mantienen. | ✅ |
| VIII | API documentada | `GET /metrics` con `response_model`. El campo `metrics` queda en el esquema OpenAPI de `ClientScoreResult`. Los 422 conservan su forma documentada. | ✅ |
| IX | Privacidad | La UI no trae datos propios; los fixtures de Vitest usan los mismos nombres ficticios de `data/clients.json`. | ✅ |
| X | Incremental | Fase A demostrable en `/docs`. Luego, US1 → US3 → US4 → US2 → US5, cada una demostrable por su ruta ([quickstart.md](quickstart.md)). | ✅ |
| Frontend | Stack aprobado | Vite, React, Tailwind, shadcn/ui y Recharts. Componentes de shadcn antes que propios (mapeo en research D9). Sin hojas de estilo ad hoc: `index.css` contiene solo `@import`, tokens de tema y `@theme`. | ✅ |

**Dependencias justificadas (Principio I)**:

| Dependencia | Problema que resuelve | Por qué no basta lo existente |
|-------------|-----------------------|-------------------------------|
| `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `typescript` | Framework y build | Stack fijado por la constitución |
| `tailwindcss`, `@tailwindcss/vite` | Estilos | Stack fijado por la constitución |
| `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` | Componentes de shadcn/ui (Sheet, Select, Slider, Tooltip…) y sus variantes | shadcn/ui copia componentes que dependen de estos paquetes; es el stack fijado |
| `lucide-react` | Íconos | Es la biblioteca de íconos de shadcn/ui; reemplaza los SVG a mano del prototipo |
| `recharts` | Donut de distribución, barra apilada y anillo de score | Stack fijado para toda visualización |
| `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` (dev) | Tests de UI: mapeo de 422, estados, "no recalcula" | pytest no ejecuta React; Vitest es el runner nativo de Vite (research D11) |

No se agregan: `react-router` (D6), TanStack Query/SWR (D7), librerías de virtualización
(D12), `CORSMiddleware` (D5).

**Resultado del gate**: PASS, sin violaciones.

**Re-evaluación post-diseño (Phase 1)**: PASS.

- [data-model.md](data-model.md) agrega solo un campo de pasaje (`metrics`) y un modelo de
  salida derivado de `METRIC_RANGES`. Ninguno introduce reglas nuevas ni valores
  hardcodeados.
- [contracts/http-api-changes.md](contracts/http-api-changes.md) mantiene la forma de todos
  los contratos existentes.
- [contracts/ui-routes.md](contracts/ui-routes.md) consume solo endpoints documentados.

## Project Structure

### Documentation (this feature)

```text
specs/002-health-score-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0: decisiones D1–D12
├── data-model.md        # Phase 1: cambios de modelos + modelos de vista
├── quickstart.md        # Phase 1: validación de punta a punta
├── contracts/
│   ├── http-api-changes.md   # delta sobre la API de la spec 001 (C1–C3)
│   └── ui-routes.md          # rutas, llamadas y mapeo respuesta → estado
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks; NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Fase A: backend existente (solo se modifican estos archivos)
src/health_score/
├── models.py                  # + metrics en InvalidClient y ClientScoreResult; + MetricRange,
│                              #   metric_ranges() y validation_message() (derivados de METRIC_RANGES)
├── scoring.py                 # score_client_input copia metrics
└── api/app.py                 # + GET /metrics; + handler 422 con mensajes en español
tests/
├── contract/test_http_api.py  # + tests C1, C2, C3 y OpenAPI
├── unit/test_portfolio.py     # + metrics en resultados válidos e inválidos
└── integration/test_interface_parity.py   # paridad con el campo nuevo
specs/001-customer-health-scoring/
├── contracts/http-api.md      # incorporar C1–C3
└── data-model.md              # incorporar metrics y MetricRange

# Fase B: frontend nuevo
frontend/
├── package.json
├── index.html                 # lang="es", título "pulse health"
├── vite.config.ts             # react + tailwind + alias @ + proxy /api (D5) + test (Vitest)
├── tsconfig.json
├── components.json            # configuración de shadcn/ui
└── src/
    ├── main.tsx
    ├── App.tsx                # shell: AppHeader, MobileNav, rutas, carga compartida de cartera
    ├── index.css              # @import tailwindcss, tokens claro/oscuro del prototipo, @theme
    ├── api/
    │   ├── types.ts           # tipos del contrato (data-model §2)
    │   ├── client.ts          # getPortfolio, getClientScore, postScore, getConfig, getMetrics; ApiError
    │   └── useApi.ts          # RemoteState + AbortController
    ├── lib/
    │   ├── utils.ts           # cn()
    │   ├── display.ts         # DisplayGroup, MetricView, formatos (data-model §2)
    │   ├── useHashRoute.ts    # navegación por hash (D6)
    │   └── useTheme.ts        # claro/oscuro (D10)
    ├── components/
    │   ├── ui/                # componentes generados por shadcn/ui
    │   ├── AppHeader.tsx  MobileNav.tsx  PageHeader.tsx  StatePanel.tsx
    │   ├── LevelBadge.tsx  ScoreRing.tsx  SubScoreBars.tsx
    └── pages/
        ├── portfolio/         # PortfolioPage, KpiCards, DistributionChart, ClientsTable
        ├── client-detail/     # ClientDetailSheet
        ├── categories/        # CategoriesPage, CategoryColumn, ClientCard
        ├── new-client/        # NewClientPage, ScoreForm, ScoreResultPanel
        └── config/            # ConfigPage
    (tests junto a cada módulo: *.test.ts / *.test.tsx)
```

**Structure Decision**: aplicación web con backend y frontend como proyectos hermanos. El
backend sigue en `src/health_score` con layout `src/`, sin reorganizarse, para no tocar la
spec 001 más allá del delta acordado. El frontend vive en `frontend/` con su propio
`package.json`. El prototipo en `docs/front_desing_assets/` queda solo como referencia y no se
importa desde `frontend/`.

## Complexity Tracking

Sin violaciones de la constitución. No aplica.
