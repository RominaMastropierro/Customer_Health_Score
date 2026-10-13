---

description: "Task list for 002-health-score-dashboard"
---

# Tasks: Pantallas del Dashboard de Salud de Clientes

**Input**: Design documents from `/specs/002-health-score-dashboard/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: se incluyen. La constitución (Principio VII) exige pytest para los cambios del backend y una suite que pase completa. El plan (research D11) define tests de Vitest para el cliente de la API y las pantallas. En cada historia, escribir los tests primero y verificar que fallan.

**Organization**: tareas agrupadas por historia de usuario. Los cambios de backend C1–C3 se ubican en la historia que los necesita primero: C1 en US1, C2 y C3 en US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (otro archivo, sin dependencias pendientes).
- **[Story]**: historia a la que pertenece (US1–US5).

## Path Conventions

- Backend existente: `src/health_score/`, `tests/` en la raíz.
- Frontend nuevo: `frontend/` en la raíz, código en `frontend/src/`, tests junto a cada módulo (`*.test.ts(x)`).
- Gestor de paquetes: **npm**. Todos los comandos `npm`/`npx` se ejecutan dentro de `frontend/`.

## Reglas transversales (aplican a todas las tareas de frontend)

- La UI **no** calcula score, nivel, sub-scores ni conteos por nivel. Solo hace la aritmética de presentación que enumera research D8.
- No hay datos simulados en el código de la app (FR-005). Los datos ficticios solo aparecen en `frontend/src/test/fixtures.ts`.
- No se escriben rangos de métricas (0–100, 0–10) en el frontend: salen de `GET /metrics` (research D3).
- Los estilos se hacen solo con utilidades de Tailwind y componentes de `@/components/ui` (shadcn); los íconos, con `lucide-react`.
- Todos los textos van en español y se toman del prototipo `docs/front_desing_assets/B2B SaaS Dashboard Design/src/App.tsx` cuando existen.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: crear el proyecto `frontend/` con el stack aprobado.

- [X] T001 Crear `frontend/package.json` (`"name": "health-score-dashboard"`, `"private": true`, `"type": "module"`, scripts `dev: vite`, `build: tsc -b && vite build`, `preview: vite preview`, `test: vitest run`, `test:watch: vitest`). Instalar con `npm install react@^19 react-dom@^19 recharts lucide-react radix-ui class-variance-authority clsx tailwind-merge tw-animate-css`. Instalar las de desarrollo con `npm install -D vite@^8 @vitejs/plugin-react typescript@~5.7 @types/react@^19 @types/react-dom@^19 @types/node tailwindcss@^4 @tailwindcss/vite@^4 vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`.
- [X] T002 Crear `frontend/vite.config.ts`:
  - plugins `react()` y `tailwindcss()`;
  - alias `@` → `./src`;
  - `server.proxy` y `preview.proxy` con `"/api": { target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") }` (research D5);
  - bloque `test: { environment: "jsdom", globals: true, setupFiles: "./src/test/setup.ts" }`, con `/// <reference types="vitest/config" />`.
- [X] T003 [P] Crear `frontend/tsconfig.json` (`strict: true`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`, `baseUrl: "."`, `paths: { "@/*": ["./src/*"] }`, `types: ["vitest/globals", "@testing-library/jest-dom"]`) y `frontend/src/vite-env.d.ts` con `/// <reference types="vite/client" />`.
- [X] T004 [P] Crear `frontend/index.html` con `<html lang="es">`, `<title>pulse health</title>`, `<div id="root">` y el script `/src/main.tsx`. Copiar el favicon de `docs/front_desing_assets/B2B SaaS Dashboard Design/public/favicon.svg` a `frontend/public/favicon.svg`.
- [X] T005 Inicializar shadcn/ui:
  - crear `frontend/components.json` (style `new-york`, `tsx: true`, `tailwind.css: "src/index.css"`, `tailwind.baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`, aliases `components: "@/components"`, `ui: "@/components/ui"`, `utils: "@/lib/utils"`, `lib: "@/lib"`, `hooks: "@/hooks"`);
  - crear `frontend/src/lib/utils.ts` con `cn(...inputs)` = `twMerge(clsx(inputs))`.
- [X] T006 Agregar los componentes de shadcn con `npx shadcn@latest add button card badge input table select sheet slider toggle-group tooltip collapsible progress skeleton alert separator`. Quedan en `frontend/src/components/ui/`. *(Implementado: por la red lenta se escribió a mano el código fuente de esos componentes, en la variante new-york para Tailwind v4 con `radix-ui`, en lugar de usar el CLI.)*
- [X] T007 [P] Agregar `frontend/node_modules/` y `frontend/dist/` a `.gitignore` en la raíz.
- [X] T008 [P] Crear `frontend/src/test/setup.ts`:
  - `import "@testing-library/jest-dom/vitest"`;
  - stubs de `ResizeObserver` y `window.matchMedia`, que necesitan Recharts y Radix en jsdom;
  - `afterEach` que restaura `globalThis.fetch` y `location.hash = ""`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tema, cliente de API, navegación y componentes compartidos que usan todas las historias.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [X] T009 Escribir `frontend/src/index.css`:
  - empieza con `@import "tailwindcss";` y `@import "tw-animate-css";`, seguidos de `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));`;
  - copiar **literalmente** los tokens de `:root` y de `:root[data-theme="dark"]` de `docs/front_desing_assets/B2B SaaS Dashboard Design/src/index.css` (líneas 3–58: `--bg`, `--surface`, `--surface-subtle`, `--surface-hover`, `--text`, `--muted`, `--faint`, `--border`, `--border-strong`, `--brand`, `--brand-strong`, `--brand-soft`, `--top`, `--top-soft`, `--stable`, `--stable-soft`, `--risk`, `--risk-soft`, `--invalid`, `--invalid-soft`, `--shadow`, radios);
  - mapear a esos tokens las variables de shadcn: `--background: var(--bg)`, `--foreground: var(--text)`, `--card: var(--surface)`, `--card-foreground: var(--text)`, `--popover: var(--surface)`, `--popover-foreground: var(--text)`, `--primary: var(--brand)`, `--primary-foreground: #fff`, `--secondary: var(--surface-subtle)`, `--secondary-foreground: var(--text)`, `--muted: var(--surface-subtle)`, `--muted-foreground: var(--muted)`, `--accent: var(--surface-hover)`, `--accent-foreground: var(--text)`, `--destructive: var(--risk)`, `--border: var(--border)`, `--input: var(--border-strong)`, `--ring: var(--brand)`, `--radius: 12px`. Renombrar `--muted` y `--border` del prototipo a `--text-muted` y `--line` para que no choquen con los de shadcn;
  - agregar `@theme inline` que exponga `--color-background`, `--color-foreground`, `--color-card`, `--color-primary`, `--color-muted-foreground`, `--color-border` y demás colores de shadcn, más `--color-top`, `--color-top-soft`, `--color-stable`, `--color-stable-soft`, `--color-risk`, `--color-risk-soft`, `--color-invalid`, `--color-invalid-soft`, `--color-brand-soft` y `--font-sans` (Inter, ui-sans-serif, -apple-system, "Segoe UI", sans-serif);
  - `@layer base` con `body { @apply bg-background text-foreground font-sans antialiased; }`.
- [X] T010 [P] Crear `frontend/src/api/types.ts` con los tipos de [data-model.md §2](data-model.md) **literalmente**:
  - `MetricName = "usage" | "support_tickets" | "nps" | "days_to_renewal"`;
  - `ClientMetrics`;
  - `SubScores` con `{ usage, support_tickets, nps, renewal: number }`;
  - `HealthLevel = "Top" | "Estable" | "En riesgo"`;
  - `ScoreResult`;
  - `FieldError`;
  - `ClientScoreResult` con `{ client_id: string | null; name: string | null; metrics: Record<string, unknown> | null; result: ScoreResult | null; errors: FieldError[] | null }`;
  - `PortfolioResult` con `summary: { total: number; by_level: Record<HealthLevel, number>; invalid: number }`;
  - `ScoringConfig`;
  - `MetricRange` con `{ name: MetricName; min: number; max: number | null; message: string }`.
- [X] T011 Crear `frontend/src/api/client.ts`:
  - `class ApiError extends Error { status: number; fieldErrors?: Partial<Record<MetricName, string>>; formErrors?: string[] }`;
  - `request<T>(path, init?)`, que hace `fetch("/api" + path, …)` y parsea JSON;
  - si la respuesta no es ok:
    - 422: recorrer `detail[]`. Si `loc[0] === "body"` y `loc[1]` es uno de los cuatro `MetricName`, guardar `fieldErrors[loc[1]] = msg`; si no, agregar `msg` a `formErrors`;
    - 404: `ApiError(404, detail)`;
    - otro estado: `ApiError(status)`;
  - un error de red se convierte en `ApiError(0)`; un `AbortError` se vuelve a lanzar tal cual;
  - exportar `getPortfolio(signal)` → `GET /portfolio`, `getClientScore(id, signal)` → `GET /clients/${encodeURIComponent(id)}/score`, `postScore(metrics, signal)` → `POST /score` con cuerpo JSON de exactamente las cuatro métricas, `getConfig(signal)` → `GET /config` y `getMetrics(signal)` → `GET /metrics`.
- [X] T012 [P] Crear `frontend/src/test/fixtures.ts`:
  - `portfolioFixture`, un `PortfolioResult` con el formato de [contracts/http-api-changes.md C1](contracts/http-api-changes.md). Usa los nombres ficticios de `data/clients.json` ("Acme Ficticia", "Globex Demo", "Initech Inventada", "Umbrella Ejemplo", …), tiene al menos un cliente por nivel y uno inválido con `metrics.usage = 120` y `errors`, y su `summary` es coherente;
  - `configFixture`: la configuración por defecto (25/25/25/25, top 75, at_risk 50, ticket_cap 10, horizon 180);
  - `metricsFixture`: el ejemplo de C3;
  - `stubFetch(routes: Record<string, { status: number; body: unknown } | (() => Promise<never>)>)`, con claves como `"GET /api/portfolio"`, que reemplaza `globalThis.fetch` y registra las llamadas.
- [X] T013 [P] Escribir `frontend/src/api/client.test.ts`:
  - 422 con `loc ["body","nps"]` → `fieldErrors.nps`;
  - 422 con `loc ["body"]` → `formErrors`;
  - 404 → `status 404`;
  - fallo de red → `status 0`;
  - `postScore` envía solo las 4 claves;
  - `getClientScore("A/B")` codifica el id.
- [X] T014 Crear `frontend/src/api/useApi.ts`: `useApi<T>(loader: (signal: AbortSignal) => Promise<T>, deps: unknown[])`.
  - Devuelve `{ state: RemoteState<T>, reload }`, con `RemoteState<T> = { status: "loading" } | { status: "error"; error: ApiError } | { status: "success"; data: T }`.
  - Crea un `AbortController` por ejecución y aborta al desmontar o al cambiar `deps`.
  - Ignora los `AbortError`, para que una respuesta tardía no aparezca en otra pantalla (spec, edge cases).
- [X] T015 [P] Crear `frontend/src/lib/display.ts` (solo presentación, research D8):
  - `DisplayGroup = HealthLevel | "Inválido"`, `DISPLAY_GROUPS = ["Top", "Estable", "En riesgo", "Inválido"]`;
  - `groupOf(r: ClientScoreResult)` = `r.result?.level ?? "Inválido"`;
  - `groupCount(summary, g)`: `summary.by_level[g]`, o `summary.invalid` para "Inválido";
  - `percent(count, total)`: 0 si `total === 0`;
  - `GROUP_TONE`: clases de Tailwind por grupo (`bg-top`, `bg-top-soft`, `text-top`, etc.);
  - `METRIC_VIEWS`: la tabla MetricView de data-model §2, con el mapeo `days_to_renewal` ↔ `renewal` y las etiquetas "Uso", "Tickets", "NPS", "Renovación";
  - `formatMetric(name, value, context: "table" | "detail")`: `"—"` si `value` es `undefined` o `null`; `String(value)` si no es número; si es número, aplica el formato de la tabla (`{v}%`, `{v}`, `{v}` / `{v}/10`, `{v} d` / `{v} días`);
  - `weakestMetric(sub_scores)`: la clave con el menor valor;
  - `displayName(r)` = `r.name ?? r.client_id ?? "—"`;
  - `initials(text)`: dos primeros caracteres en mayúscula.
- [X] T016 [P] Escribir `frontend/src/lib/display.test.ts`: cubre `groupOf`, `groupCount` (incluido "Inválido"), `percent` con total 0, `formatMetric` con 120 / `"abc"` / `undefined`, `weakestMetric` e `initials` de un id cuando no hay nombre.
- [X] T017 [P] Crear `frontend/src/lib/useHashRoute.ts` con `Route = { page: "cartera" | "categorias" | "nuevo" | "configuracion"; clientId?: string }`.
  - `parseHash(hash)`: `#/cartera/<id>` → `{ page: "cartera", clientId: decodeURIComponent(id) }`; vacío o desconocido → `{ page: "cartera" }`.
  - `toHash(route)`.
  - `useHashRoute()` devuelve `{ route, navigate(route, { replace? }) }` y escucha `hashchange`. Si `replace` es true usa `history.replaceState` y dispara el evento a mano.
  - Tests en `frontend/src/lib/useHashRoute.test.ts`.
- [X] T018 [P] Crear `frontend/src/lib/useTheme.ts` (research D10): lee `localStorage["theme"]` dentro de `try/catch`, o `prefers-color-scheme` si no hay valor. Aplica `document.documentElement.dataset.theme` y expone `{ theme, toggle }`.
- [X] T019 [P] Crear `frontend/src/components/StatePanel.tsx` y `frontend/src/components/PageHeader.tsx`.
  - `StatePanel` acepta `type: "loading" | "error" | "empty"`, `retry?`, `title?` y `description?`. Usa `Card` y `Skeleton`. Por defecto copia los textos del prototipo: "Cargando datos" / "Estamos preparando la información."; "No pudimos cargar los datos" / "Revisa tu conexión e inténtalo de nuevo." + botón "Reintentar"; "Aún no hay clientes" / "Calcula un score para empezar a construir tu cartera.". Usa `role="status"` para carga y `role="alert"` para error.
  - `PageHeader` acepta `eyebrow`, `title`, `description` y `action?`, con la jerarquía del prototipo.
- [X] T020 [P] Crear los componentes de nivel y score en `frontend/src/components/`:
  - `LevelBadge.tsx`: `Badge` con punto de color y texto del grupo, sobre `GROUP_TONE` (FR-025: el texto siempre visible).
  - `ScoreRing.tsx`: Recharts `RadialBarChart` de 112 px, dominio 0–100, color del grupo, con el `score` en el centro y el texto "de 100". Recibe `score` y `group`.
  - `SubScoreBars.tsx`: recibe `sub_scores` y renderiza un `Progress` de shadcn por `METRIC_VIEWS`, con etiqueta y el valor **tal como llega**, `aria-label` con la métrica, y el título "Desglose del score".
- [X] T021 Crear `frontend/src/components/AppHeader.tsx` y `frontend/src/components/MobileNav.tsx` (contracts/ui-routes.md, sección Navegación).
  - `AppHeader`: marca "pulse health" con las tres barras del prototipo, que lleva a `#/cartera`. Enlaces "Cartera" (`LayoutGrid`), "Por categoría" (`Columns2`) y "Nuevo cliente" (`Plus`), con indicador activo, ocultos por debajo de `md`. Botón de ícono `Settings` hacia `#/configuracion` con `aria-label="Configuración"`. Botón de tema `Moon`/`Sun` con `aria-label` "Activar modo oscuro" / "Activar modo claro".
  - `MobileNav`: fija abajo, visible solo por debajo de `md`, con "Cartera", "Categorías" y "Nuevo".
- [X] T022 Crear `frontend/src/main.tsx` (monta `<App/>` e importa `./index.css`) y `frontend/src/App.tsx`.
  - Usa `useTheme` y `useHashRoute`.
  - La cartera se carga **una sola vez** a nivel App, con `useApi(getPortfolio, [])`, y se comparte entre Cartera y Por categoría (research D7).
  - Contenedor `main` con `mx-auto w-[min(1440px,92vw)] pt-12 pb-24`.
  - Por ahora, un placeholder por ruta, que reemplazan las historias.
  - Envuelve todo en `TooltipProvider`.

**Checkpoint**: `npm run dev` muestra el shell con navegación, tema y rutas. `npm test` pasa las pruebas de T013, T016 y T017.

---

## Phase 3: User Story 1 - Ver la salud de toda la cartera (Priority: P1) 🎯 MVP

**Goal**: pantalla Cartera con KPIs, distribución y tabla con búsqueda, filtro y orden, incluidas las métricas originales (C1).

**Independent Test**: con la API y `data/clients.json`, abrir `#/cartera`. Los KPIs coinciden con `summary`, la tabla muestra todos los clientes con sus métricas originales y funcionan búsqueda, filtro y orden ([quickstart.md](quickstart.md), escenarios 1–3).

### Tests for User Story 1 ⚠️

- [X] T023 [P] [US1] En `tests/unit/test_portfolio.py`, agregar tests de C1:
  - cliente válido → `score_portfolio(...).results[i].metrics == {"usage": .., "support_tickets": .., "nps": .., "days_to_renewal": ..}` (las cuatro, enteras);
  - registro con `usage: 120` → `metrics["usage"] == 120` y `result is None`;
  - registro con `"usage": "abc"` → `metrics["usage"] == "abc"`;
  - registro sin clave `metrics` → `metrics is None`;
  - registro con `"metrics": [1, 2]` → `metrics is None`;
  - `score`, `level`, `sub_scores` y `errors` sin cambios respecto de los valores actuales.
- [X] T024 [P] [US1] En `tests/contract/test_http_api.py`:
  - agregar `"metrics"` a cada elemento de `PORTFOLIO_RESPONSE`, igual al ejemplo C1 de [contracts/http-api-changes.md](contracts/http-api-changes.md);
  - en `test_openapi_schemas_use_data_model_field_names`, cambiar el set de `ClientScoreResult` a `{"client_id", "name", "metrics", "result", "errors"}`;
  - agregar `test_stored_portfolio_includes_metrics`: cada `results[i]` tiene la clave `metrics`;
  - agregar `test_stored_invalid_client_keeps_original_metrics`: `GET /clients/C-003/score` devuelve `metrics.nps == 11` y `result is None` (C-003 es el registro inválido de `tests/conftest.py`).
- [X] T025 [P] [US1] Revisar `tests/integration/test_interface_parity.py`. La paridad de cartera debe comparar el `model_dump(mode="json")` completo de la biblioteca con el JSON de la API, campo `metrics` incluido. Si hoy compara campos sueltos, ampliarla.

### Implementation for User Story 1

- [X] T026 [US1] En `src/health_score/models.py`:
  - agregar a `InvalidClient` el campo `metrics: dict[str, Any] | None = None`;
  - agregar a `ClientScoreResult` el campo `metrics: Annotated[dict[str, Any] | None, Field(description="Métricas tal como se recibieron; en un cliente inválido pueden estar fuera de rango o no ser numéricas")]`, obligatorio en el objeto, que puede ser `null`, ubicado entre `name` y `result`;
  - en `validate_client_record`: cuando falla la estructura, `metrics=raw.get("metrics") if isinstance(raw, dict) and isinstance(raw.get("metrics"), dict) else None`; cuando fallan las métricas, `metrics=record.metrics`;
  - no tocar la invariante `_exactly_one_outcome`.
- [X] T027 [US1] En `src/health_score/scoring.py` `score_client_input`: si es inválido, pasar `metrics=client.metrics`; si es válido, `metrics=client.metrics.model_dump()`. No agregar imports, porque `tests/unit/test_architecture.py` debe seguir pasando. Correr `pytest`: T023–T025 deben pasar.
- [X] T028 [P] [US1] Incorporar C1 a la documentación de la spec 001:
  - en `specs/001-customer-health-scoring/contracts/http-api.md`, agregar `metrics` al ejemplo de `POST /portfolio/score` y a la descripción de `GET /portfolio` y `GET /clients/{client_id}/score`;
  - en `specs/001-customer-health-scoring/data-model.md`, agregar la fila `metrics` a `ClientScoreResult` e `InvalidClient`, con la regla de data-model 002 §1.
- [X] T029 [P] [US1] Crear `frontend/src/pages/portfolio/KpiCards.tsx` (FR-007).
  - Recibe `summary`.
  - Una tarjeta "Total clientes" (ícono `Users`, valor `summary.total`, texto "Cartera activa").
  - Una tarjeta por cada `DISPLAY_GROUPS`, con `groupCount`, "`percent(...).toFixed(0)`% del total" y la línea de color del grupo.
  - Grid de 5 columnas en `lg`, 2 en `sm` y 1 en móvil.
- [X] T030 [P] [US1] Crear `frontend/src/pages/portfolio/DistributionChart.tsx` (FR-008), en una `Card` titulada "Distribución de salud" / "Clientes por categoría".
  - Recharts `PieChart` con un `Pie` de `innerRadius` (dona), un sector por grupo con conteo > 0, color `var(--color-<tone>)`, y el centro con `summary.total` + "clientes".
  - Leyenda propia con punto, nombre, conteo y `percent().toFixed(1)`% para los 4 grupos.
  - Barra apilada de 100 % con un segmento por grupo.
  - Contenedor con `role="img"` y `aria-label="Distribución de clientes por categoría"`.
  - Si `total === 0`, `StatePanel type="empty"`.
- [X] T031 [P] [US1] Crear `frontend/src/pages/portfolio/ClientsTable.tsx` (FR-009–FR-012).
  - Props: `results`, `onOpen(clientId)` y el estado controlado `query`, `group` ("Todas" | DisplayGroup) y `ascending`, para que el padre lo conserve (FR-020).
  - Encabezado: "Todos los clientes", "{n} resultados", `Input` con ícono `Search` y placeholder "Buscar cliente" (busca en `name` + `client_id`, sin distinguir mayúsculas), `Select` con `aria-label="Filtrar por categoría"` y opciones "Todas" + `DISPLAY_GROUPS`, y botón "Score ↓/↑".
  - Filtrado y orden con `useMemo`. La búsqueda pasa por `useDeferredValue` (research D12). Los inválidos van siempre al final del orden.
  - Columnas de `Table`: Cliente (nombre o id en negrita + id debajo), Score (`result.score` o "—"), Estado (`LevelBadge`; si hay `errors`, un ícono `AlertTriangle` con `Tooltip` que une los `message` con " · "), Uso, Tickets, NPS, Renovación (`formatMetric(..., "table")` sobre `metrics`), y un `ChevronRight` con texto sr-only "Detalle".
  - Las filas con `client_id` tienen `tabIndex=0` y abren con clic o Enter.
  - La tabla va dentro de un contenedor `overflow-x-auto`.
  - Sin coincidencias, estado vacío "Sin resultados" / "Prueba con otra búsqueda o filtro." (distinto del de cartera vacía).
- [X] T032 [US1] Crear `frontend/src/pages/portfolio/PortfolioPage.tsx` (US1).
  - Props: `state: RemoteState<PortfolioResult>`, `reload` y `onOpenClient`.
  - loading → `StatePanel loading`; error → `StatePanel error retry={reload}`; `summary.total === 0` → `PageHeader` + `KpiCards` en 0 + `StatePanel empty`.
  - success → `PageHeader` con eyebrow "Vista general", título "Cartera de clientes", descripción "Supervisa la salud de tu cartera y detecta cuentas que necesitan atención." y como acción un botón secundario con punto verde y "Actualizado {hh:mm}", que llama a `reload` y muestra la hora de la última carga exitosa. Debajo, `KpiCards`, y en el grid del dashboard `DistributionChart` (1/3) + `ClientsTable` (2/3), apilados en móvil.
  - Los estados `query`, `group` y `ascending` viven aquí.
- [X] T033 [US1] En `frontend/src/App.tsx`, renderizar `PortfolioPage` para `route.page === "cartera"` con el estado de cartera compartido. `onOpenClient(id)` → `navigate({ page: "cartera", clientId: id })`.
- [X] T034 [P] [US1] Escribir `frontend/src/pages/portfolio/PortfolioPage.test.tsx` con `stubFetch` y `portfolioFixture`:
  - los KPIs muestran exactamente los números de `summary`;
  - la tabla muestra score y nivel del fixture, sin recalcular (cambiar el score en el fixture cambia lo mostrado);
  - el inválido muestra "—", "Inválido" y "120%";
  - buscar "globex" deja una fila;
  - el filtro "En riesgo" + orden ascendente da el orden esperado;
  - un 500 muestra "No pudimos cargar los datos" y "Reintentar" vuelve a llamar;
  - `total: 0` muestra "Aún no hay clientes";
  - Enter sobre una fila cambia el hash a `#/cartera/<id>`.

**Checkpoint**: la US1 se puede demostrar sola (MVP), y `pytest` y `npm test` pasan.

---

## Phase 4: User Story 2 - Calcular el score de un cliente nuevo (Priority: P1)

**Goal**: pantalla Nuevo cliente con formulario y resultado. Los rangos llegan de `GET /metrics` (C3) y los errores, en español (C2).

**Independent Test**: [quickstart.md](quickstart.md), escenarios 7–8: con 90/0/9/300 el resultado es idéntico a `POST /score`; tickets "2.5" muestra un error en español bajo el campo.

### Tests for User Story 2 ⚠️

- [X] T035 [P] [US2] En `tests/contract/test_http_api.py`, tests de C2:
  - `test_score_rejects_nps_out_of_range` también comprueba `detail[0]["msg"] == "debe ser un entero entre 0 y 10"` y `detail[0]["type"] == "less_than_equal"` (la forma no cambia);
  - nuevo `test_score_422_messages_in_spanish`, parametrizado sobre los cuerpos de `test_score_rejects_invalid_bodies`, con el `msg` esperado para cada `loc`:
    - decimal → `["body","support_tickets"]`: "debe ser un entero mayor o igual a 0";
    - string → `["body","usage"]`: "debe ser un entero entre 0 y 100";
    - missing → `["body","nps"]`: "campo obligatorio";
    - extra → `["body","churn"]`: "campo no permitido";
  - cada item conserva las claves `loc`, `msg` y `type`.
- [X] T036 [P] [US2] En `tests/contract/test_http_api.py`, tests de C3:
  - `test_metrics_endpoint_matches_metric_ranges`: `GET /metrics` → 200 y una lista igual a `[{"name": m.value, "min": lo, "max": hi, "message": range_message(m)} for m, (lo, hi) in METRIC_RANGES.items()]`, en el orden de `Metric`;
  - `test_openapi_declares_metrics_endpoint`: `/metrics` `get` existe, tiene `summary` y su schema 200 es un array cuyo `items.$ref` termina en `MetricRange`.

### Implementation for User Story 2

- [X] T037 [US2] En `src/health_score/models.py`:
  - agregar `class MetricRange(_Frozen)` con `name: Metric`, `min: int`, `max: int | None` y `message: str`, con descripciones en español;
  - agregar `metric_ranges() -> list[MetricRange]`, construido desde `METRIC_RANGES` y `range_message`, en el orden de `Metric`;
  - agregar `validation_message(loc: tuple, error_type: str, default: str) -> str`. Si `error_type` está en `_STRUCTURE_MESSAGES` devuelve ese texto. Si no, y `len(loc) == 2` y `loc[0] == "body"` y `loc[1]` es un valor de `Metric`, devuelve `range_message(Metric(loc[1]))`. En otro caso devuelve `default`.
  - No agregar números literales: el test de arquitectura no lo permite.
- [X] T038 [US2] En `src/health_score/api/app.py` (dentro de `create_app`):
  - agregar `@app.get("/metrics", response_model=list[MetricRange], tags=["configuración"], summary="Ver las métricas y sus rangos", description="Rangos válidos de cada métrica de entrada, definidos en un único lugar del motor. Las interfaces los usan para sus controles sin redefinirlos.")`, que devuelve `metric_ranges()`;
  - registrar `@app.exception_handler(RequestValidationError)`, que devuelve `JSONResponse(status_code=422, content={"detail": jsonable_encoder([{**e, "msg": validation_message(tuple(e["loc"]), e["type"], e["msg"])} for e in exc.errors()])})`;
  - correr `pytest`: T035 y T036 deben pasar, y el resto de la suite sigue en verde.
- [X] T039 [P] [US2] Documentación:
  - incorporar C2 y C3 a `specs/001-customer-health-scoring/contracts/http-api.md` (sección "Formato de error" con mensajes en español; nueva sección `GET /metrics`) y `MetricRange` a `specs/001-customer-health-scoring/data-model.md`;
  - agregar la fila `GET /metrics` a la tabla de endpoints de `README.md`.
- [X] T040 [P] [US2] Crear `frontend/src/pages/new-client/ScoreForm.tsx`. Props: `ranges: MetricRange[]`, `value: ScoreFormState`, `onChange`, `onSubmit` y `submitting`. Es una `Card` "Datos del cliente" / "Todos los indicadores son obligatorios." con el paso "01". Contiene:
  - `Input` "Nombre", con hint "Opcional" y placeholder "Ej. Acme Ficticia";
  - "Uso del producto": `Slider` con `min`/`max` tomados de `ranges` para `usage`, el valor `{v}%` en el label y las etiquetas de los extremos desde `ranges`;
  - "Tickets de soporte" (hint "Últimos 30 días") y "Días hasta renovación": `Input type="number" step=1` con `min` desde `ranges`;
  - "NPS": `ToggleGroup type="single"` con un ítem por entero entre `min` y `max` de `nps` según `ranges`, con `{v}/10` en el label (el 10 es `max` de `ranges`);
  - errores: debajo de cada campo `fieldErrors[name]` con ícono `AlertTriangle`, `aria-invalid` y `aria-describedby`; `formErrors` en un `Alert` arriba;
  - botón "Calcular score", que muestra un spinner y "Calculando" mientras se envía, deshabilitado (FR-016);
  - el texto "Los datos no se guardarán automáticamente." (FR-017);
  - antes de enviar, un campo vacío o no numérico se marca con "Introduce un número entero" y el envío se bloquea (edge case). Cualquier otra validación queda en manos del servidor.
  - Ningún número de rango escrito en el código.
- [X] T041 [P] [US2] Crear `frontend/src/pages/new-client/ScoreResultPanel.tsx` (`aria-live="polite"`).
  - Sin resultado: anillo vacío con "—", "Tu resultado aparecerá aquí", "Completa los datos y calcula el score para ver la salud del cliente.".
  - Mientras carga: `StatePanel loading`.
  - Con resultado: eyebrow "Resultado", título = nombre ingresado o "Cliente nuevo", `LevelBadge`, `ScoreRing`, el texto "Score global calculado según la configuración actual." y `SubScoreBars`.
  - Al final, un `Button` secundario deshabilitado "Guardar en cartera" con el subtexto "Disponible próximamente" (FR-017).
- [X] T042 [US2] Crear `frontend/src/pages/new-client/NewClientPage.tsx` con `PageHeader` (eyebrow "Evaluación individual", título "Nuevo cliente", descripción "Introduce las señales de salud para calcular un score actualizado.").
  - Carga `useApi(getMetrics)`. En loading o error muestra `StatePanel`, con reintento.
  - El estado inicial del formulario está vacío: sin valores de ejemplo (FR-005).
  - Implementa las transiciones de `ScoreFormState` de [data-model.md](data-model.md): al enviar llama a `postScore` (solo las 4 métricas, con `Number()`) y con 200 guarda `result`.
  - Con `ApiError` 422 asigna `fieldErrors`/`formErrors`; con otro error, `Alert` "No pudimos calcular el score. Inténtalo de nuevo.". En ambos casos se conservan los valores.
  - Al editar un campo se borra su error.
  - Al desmontar aborta el envío en curso.
  - Layout de 2 columnas en `lg` (formulario | resultado), apiladas en móvil.
- [X] T043 [US2] En `frontend/src/App.tsx`, renderizar `NewClientPage` para `route.page === "nuevo"`.
- [X] T044 [P] [US2] Escribir `frontend/src/pages/new-client/NewClientPage.test.tsx`:
  - los controles toman los límites de `metricsFixture` (cambiar `nps.max` a 5 en el stub deja 6 opciones);
  - enviar 90/0/9/300 hace `POST /api/score` con exactamente `{usage: 90, support_tickets: 0, nps: 9, days_to_renewal: 300}`;
  - el score, nivel y sub-scores del stub se muestran tal cual;
  - un 422 con `loc ["body","support_tickets"]` muestra su `msg` bajo "Tickets de soporte" y no muestra score;
  - el botón queda deshabilitado mientras la promesa está pendiente;
  - el nombre titula el resultado y no viaja en el body.

**Checkpoint**: US1 y US2 funcionan de forma independiente.

---

## Phase 5: User Story 3 - Ver el detalle de un cliente de la cartera (Priority: P2)

**Goal**: panel lateral con score, nivel, sub-scores, métricas originales y errores, que se abre desde la tabla o por URL.

**Independent Test**: [quickstart.md](quickstart.md), escenarios 4–5.

### Tests for User Story 3 ⚠️

- [X] T045 [P] [US3] Escribir `frontend/src/pages/client-detail/ClientDetailSheet.test.tsx`:
  - con el hash `#/cartera/C-001`, llama a `GET /api/clients/C-001/score` y muestra el score, nivel y sub-scores del stub y "Señales de salud" con las métricas;
  - para un inválido no hay anillo, aparece "Errores del registro" con cada `field` y `message`, y las métricas originales ("120%");
  - un 404 muestra "Cliente no encontrado" y "Volver a la cartera";
  - Escape cierra el panel y vuelve a `#/cartera`, conservando la búsqueda escrita en la tabla.

### Implementation for User Story 3

- [X] T046 [US3] Crear `frontend/src/pages/client-detail/ClientDetailSheet.tsx` (FR-018–FR-020).
  - Props: `clientId` y `onClose`.
  - `Sheet` de shadcn (`side="right"`, ancho `sm:max-w-md`, título accesible "Detalle del cliente").
  - Carga `useApi((s) => getClientScore(clientId, s), [clientId])`. Mientras carga: `StatePanel loading`.
  - 404: ícono `AlertTriangle`, "Cliente no encontrado", "Este cliente ya no está disponible." y botón "Volver a la cartera". Otro error: `StatePanel error` con reintento.
  - Con datos: eyebrow "Detalle del cliente", avatar con `initials`, nombre, id y `LevelBadge`.
  - Si hay `result`: `ScoreRing` + "Calculado con la configuración y señales más recientes.".
  - "Señales de salud": grid de 4 con `formatMetric(..., "detail")` sobre `metrics`.
  - Si hay `result`: `SubScoreBars`. Si hay `errors`: caja "Errores del registro" con un renglón `field` en negrita + `message` por error.
- [X] T047 [US3] Conectar el panel en `frontend/src/App.tsx`.
  - Si `route.page === "cartera" && route.clientId`, renderizar `ClientDetailSheet` **encima** de `PortfolioPage`, sin desmontarla, para conservar búsqueda, filtro y orden (FR-020, research D6).
  - `onClose`: si la apertura vino de la tabla (guardar un flag en `App` al llamar a `onOpenClient`), `history.back()`; si se entró directo por URL, `navigate({ page: "cartera" }, { replace: true })`.

**Checkpoint**: US1, US2 y US3 funcionan.

---

## Phase 6: User Story 4 - Ver clientes agrupados por categoría (Priority: P2)

**Goal**: vista con una columna colapsable por grupo y tarjetas con la métrica más débil.

**Independent Test**: [quickstart.md](quickstart.md), escenario 6. Los conteos son iguales a los de Cartera porque comparten la misma carga.

### Tests for User Story 4 ⚠️

- [X] T048 [P] [US4] Escribir `frontend/src/pages/categories/CategoriesPage.test.tsx` con `portfolioFixture`:
  - hay 4 columnas con conteos iguales a `groupCount(summary, g)` y `percent().toFixed(1)`%;
  - cada cliente aparece en una sola columna;
  - la tarjeta válida muestra "Métrica más débil" con la etiqueta y el valor del menor sub-score;
  - la tarjeta inválida muestra "{n} errores de validación";
  - una columna sin clientes muestra "Sin clientes en esta categoría";
  - el botón de columna alterna `aria-expanded`.

### Implementation for User Story 4

- [X] T049 [P] [US4] Crear `frontend/src/pages/categories/ClientCard.tsx`.
  - Avatar con `initials(displayName)`, nombre, id y score en grande (o "—").
  - Si es válido: "Métrica más débil", con la etiqueta de `METRIC_VIEWS` y el valor de `weakestMetric(result.sub_scores)`.
  - Si es inválido: ícono `AlertTriangle` + "{errors.length} errores de validación".
- [X] T050 [P] [US4] Crear `frontend/src/pages/categories/CategoryColumn.tsx`.
  - `Collapsible` con un botón de encabezado: punto de color, nombre del grupo, conteo, porcentaje con 1 decimal e indicador "−" / "+", con `aria-expanded`.
  - Contenido: lista de `ClientCard`, o "Sin clientes en esta categoría".
  - Borde superior con el color del grupo.
- [X] T051 [US4] Crear `frontend/src/pages/categories/CategoriesPage.tsx` y conectarlo en `frontend/src/App.tsx` para `route.page === "categorias"`, con el estado de cartera compartido.
  - `PageHeader`: eyebrow "Segmentación", título "Clientes por categoría", descripción "Prioriza el trabajo del equipo según el nivel de salud de cada cuenta.".
  - Estados loading, error y vacío iguales a Cartera.
  - Grid de 4 columnas en `xl`, 2 en `md` y 1 en móvil. Todas abiertas al inicio.
  - Los clientes se agrupan con `groupOf`, manteniendo el orden de la API.

**Checkpoint**: US1–US4 funcionan.

---

## Phase 7: User Story 5 - Consultar la configuración activa (Priority: P3)

**Goal**: vista de solo lectura de pesos, umbrales y normalización.

**Independent Test**: [quickstart.md](quickstart.md), escenario 9 y sección 4 (configuración alternativa).

### Tests for User Story 5 ⚠️

- [X] T052 [P] [US5] Escribir `frontend/src/pages/config/ConfigPage.test.tsx`:
  - con `configFixture` muestra "25 %" para cada métrica, Top "75", En riesgo "50", "10 tickets" y "180 días";
  - con pesos `{usage: 2, support_tickets: 1, nps: 1, renewal: 0}` muestra 50 %, 25 %, 25 % y 0 %;
  - no hay `input`, `button[type=submit]` ni controles editables.

### Implementation for User Story 5

- [X] T053 [US5] Crear `frontend/src/pages/config/ConfigPage.tsx` (FR-023) y conectarlo en `frontend/src/App.tsx` para `route.page === "configuracion"`.
  - `PageHeader`: eyebrow "Modelo de salud", título "Configuración activa", descripción "Pesos y umbrales con los que se calculan los scores. Se editan en el archivo de configuración del servicio.".
  - Carga `useApi(getConfig)` con sus estados de carga y error.
  - `Card` "Pesos": por cada `METRIC_VIEWS`, la etiqueta, el peso como porcentaje (peso / suma de pesos × 100, redondeado a 1 decimal, research D8) y un `Progress` de solo lectura.
  - `Card` "Umbrales": "Top: score ≥ {top}", "Estable: entre {at_risk} y {top − 1}" y "En riesgo: score < {at_risk}", con `LevelBadge`. Son textos que muestran los valores de la API; la clasificación la sigue haciendo el servidor.
  - `Card` "Normalización": "Tope de tickets: {ticket_cap}" y "Horizonte de renovación: {renewal_horizon_days} días".
  - Sin controles de edición.

**Checkpoint**: las 5 historias funcionan de forma independiente.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T054 [P] En `README.md`, agregar la sección "Frontend": requisitos (Node 20+), `cd frontend`, `npm install`, `npm run dev` (proxy a la API, variable `VITE_API_TARGET`), `npm test` y `npm run build`. Enlazar `specs/002-health-score-dashboard/quickstart.md`.
- [X] T055 [P] Crear `scripts/make_fake_portfolio.py`. Usa solo stdlib (`json`, `random` con semilla fija y `argparse`) y genera N clientes ficticios (`client_id` "F-0001"…, nombre "Cliente Ficticio N", métricas aleatorias dentro de rangos válidos más un 2 % de registros inválidos). Se ejecuta como `python scripts/make_fake_portfolio.py 1000 > tmp/clients_1000.json`, para medir SC-004 ([quickstart.md](quickstart.md), §5). Está fuera de `src/`, así que no lo alcanza el test de arquitectura.
- [X] T056 Revisión de accesibilidad en `frontend/src/` (FR-025):
  - foco visible (`focus-visible:ring-2 ring-ring`) en filas, botones y enlaces;
  - todos los botones de ícono tienen `aria-label`;
  - los niveles siempre muestran texto;
  - la navegación activa usa `aria-current="page"`;
  - recorrer todas las pantallas solo con teclado.
- [ ] T057 Revisión responsive a 360 px, 768 px y 1440 px (SC-006): sin scroll horizontal de página, la tabla desplaza dentro de su contenedor, `MobileNav` visible solo en móvil y `main` con `pb` suficiente para no quedar tapado por `MobileNav`.
- [X] T058 Guardas del frontend:
  - en `frontend/src/lib/display.test.ts`, agregar un test que lee con `import.meta.glob("/src/pages/**/*.tsx", { as: "raw", eager: true })` los archivos de `src/pages` y falla si encuentra `min={0}`, `max={100}`, `max={10}` o `length: 11` (rangos hardcodeados, Principio VI);
  - verificar con grep que no queden datos de ejemplo (`Acme`, `Globex`, etc.) fuera de `src/test/` (FR-005).
- [X] T059 Correr la suite completa: `pytest` en la raíz, y `npm test` y `npm run build` en `frontend/`. Todo debe pasar sin errores de TypeScript.
- [ ] T060 Ejecutar los escenarios 1–13 y las secciones 4–5 de [quickstart.md](quickstart.md) con la API y el frontend levantados, y anotar cualquier desvío.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T001 va antes que T002–T008; T005 antes que T006.
- **Foundational (Phase 2)**: depende de Setup y bloquea todas las historias. T010 va antes que T011; T011 antes que T013 y T014; T015 antes que T016, T019 y T020; T017 y T018 antes que T021 y T022.
- **US1 (Phase 3)**: depende de Foundational. El backend (T023–T028) no depende del frontend y puede empezar apenas se aprueba el plan, incluso en paralelo con las fases 1 y 2.
- **US2 (Phase 4)**: depende de Foundational. El backend (T035–T039) es independiente de US1, aunque T037 y T038 tocan los mismos archivos que T026 (`models.py`): hacerlos después de T026 para evitar conflictos.
- **US3 (Phase 5)**: depende de US1, porque el panel se abre desde la tabla y usa `metrics` de C1. También se puede probar entrando directo por URL.
- **US4 (Phase 6)**: depende de Foundational y de C1 (T026–T027) para `metrics`. Reutiliza la carga compartida de App, no la pantalla de US1.
- **US5 (Phase 7)**: depende solo de Foundational (`GET /config` ya existe).
- **Polish (Phase 8)**: depende de las historias que se quieran entregar.

### User Story Dependencies

```text
Setup → Foundational ─┬─► US1 (P1, MVP) ──► US3 (P2)
                      ├─► US2 (P1)
                      ├─► US4 (P2)  [necesita C1: T026–T027]
                      └─► US5 (P3)
Backend C1 (T023–T028) ──► US1, US3, US4
Backend C2/C3 (T035–T039) ──► US2
```

### Within Each User Story

- Los tests se escriben primero y deben fallar.
- Backend: modelos → scoring → API → documentación de la spec 001.
- Frontend: componentes de la página → página → conexión en `App.tsx` → test de la página en verde.

### Parallel Opportunities

- Setup: T003, T004, T007 y T008 en paralelo después de T001.
- Foundational: T010, T012, T015, T017, T018 y T019 en paralelo; luego T013, T016 y T020.
- Backend C1 (T023–T025) en paralelo con toda la Phase 2 del frontend.
- US1: T029, T030 y T031 en paralelo; T028 en paralelo con el frontend.
- US2: T035 y T036 en paralelo; T040 y T041 en paralelo.
- Con Foundational y C1 terminados, US2, US4 y US5 pueden avanzar en paralelo con US1.

---

## Parallel Example: User Story 1

```bash
# Tests de backend C1, en paralelo:
Task: "T023 tests de metrics en tests/unit/test_portfolio.py"
Task: "T024 contrato C1 en tests/contract/test_http_api.py"
Task: "T025 paridad en tests/integration/test_interface_parity.py"

# Componentes de la pantalla Cartera, en paralelo:
Task: "T029 KpiCards en frontend/src/pages/portfolio/KpiCards.tsx"
Task: "T030 DistributionChart en frontend/src/pages/portfolio/DistributionChart.tsx"
Task: "T031 ClientsTable en frontend/src/pages/portfolio/ClientsTable.tsx"
```

## Parallel Example: User Story 2

```bash
Task: "T035 contrato C2 (mensajes 422) en tests/contract/test_http_api.py"
Task: "T036 contrato C3 (GET /metrics) en tests/contract/test_http_api.py"   # mismo archivo que T035: coordinar o hacer en serie
Task: "T040 ScoreForm en frontend/src/pages/new-client/ScoreForm.tsx"
Task: "T041 ScoreResultPanel en frontend/src/pages/new-client/ScoreResultPanel.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) + Phase 2 (Foundational).
2. Phase 3 (US1), incluido el backend C1.
3. **Validar**: quickstart, escenarios 1–3, con `pytest` y `npm test` en verde.
4. Demo: la cartera completa con datos reales de la API.

### Incremental Delivery

1. Setup + Foundational → shell navegable.
2. US1 → MVP de cartera.
3. US2 → evaluación de clientes nuevos (backend C2 + C3).
4. US3 → detalle explicable.
5. US4 → vista por categoría.
6. US5 → transparencia de la configuración.
7. Polish → accesibilidad, responsive, rendimiento y validación completa.

---

## Notes

- [P] = otro archivo y sin dependencias pendientes. Las tareas que tocan `tests/contract/test_http_api.py`, `src/health_score/models.py` o `frontend/src/App.tsx` se hacen en serie aunque estén en historias distintas.
- El prototipo `docs/front_desing_assets/...` es solo referencia: no se importa ni se copian sus datos `mockClients`, `mockConfig` ni su fórmula `mockApi`.
- Hacer commit al terminar cada tarea o grupo lógico; validar cada checkpoint antes de seguir.
