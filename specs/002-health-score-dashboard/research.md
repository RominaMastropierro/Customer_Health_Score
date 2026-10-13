# Research: Pantallas del Dashboard de Salud de Clientes

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Cada decisión resuelve una incógnita del Technical Context o una tensión entre la spec, la
constitución v2.1.0 y el prototipo de referencia.

## D1. Cómo devolver las métricas originales (FR-012, Q1: A)

**Decision**: agregar a `ClientScoreResult` un campo `metrics: dict[str, Any] | None` con las
métricas **tal como se recibieron**. En un cliente válido es el `ClientMetrics` serializado; en
un cliente inválido es el objeto `metrics` crudo del registro (p. ej., `{"usage": 120, …}`), o
`null` si el registro no traía un objeto `metrics`. `InvalidClient` gana el mismo campo
opcional y `validate_client_record` lo completa. `score_client_input` solo lo copia.

**Rationale**: es aditivo; no cambia `score`, `level`, `sub_scores`, `errors` ni `summary`. Al
estar en `ClientScoreResult`, aparece en `GET /portfolio`, `GET /clients/{id}/score` y
`POST /portfolio/score` con un único cambio, y la biblioteca y la API siguen dando resultados
idénticos (SC-005 de la spec 001). El núcleo sigue siendo puro: copiar un valor no es I/O.

**Alternatives considered**:
- Campo `metrics: ClientMetrics | None` tipado: no puede representar los valores inválidos
  (uso 120, `"abc"`), que son justo los que la spec pide mostrar.
- Endpoint aparte `GET /clients/{id}/metrics`: obliga a N+1 llamadas para la tabla y la pantalla
  pide los valores en todas las filas.
- Devolver el registro crudo completo: expone campos que el contrato no conoce.

## D2. Mensajes de error en español para `POST /score` (FR-015)

**Decision**: registrar en la app FastAPI un handler de `RequestValidationError` que conserva
el formato estándar `{"detail": [{"loc", "msg", "type"}]}` y solo reescribe `msg`:
- si `loc` es `["body", <métrica>]` → `range_message(Metric(<métrica>))` (definido en
  `metrics.py`);
- si `type` es `missing` / `extra_forbidden` → "campo obligatorio" / "campo no permitido" (los
  mismos textos que `_STRUCTURE_MESSAGES`);
- en cualquier otro caso deja el `msg` de Pydantic.

**Rationale**: hoy el 422 de `/score` trae el texto en inglés de Pydantic. Si la UI tradujera
por `type` tendría que conocer los rangos para decir "entre 0 y 10", y eso duplica
`METRIC_RANGES` (Principio VI). Con este handler el mensaje sale del único lugar donde está
definido y la forma del contrato no cambia.

**Alternatives considered**:
- Traducir en el frontend: duplica rangos.
- Usar `POST /portfolio/score` con un id sintético: es un truco que mezcla dos casos de uso.
- Cambiar el 422 a `FieldError[]`: rompe el contrato documentado y sus tests.

## D3. Rangos de métricas para los controles de la UI (FR-006, Principio VI)

**Decision**: nuevo endpoint `GET /metrics` que devuelve, por métrica y en orden, `name`,
`min`, `max` (null si no hay tope) y `message` (`range_message`), generado a partir de
`METRIC_RANGES`. El formulario toma de ahí el máximo del deslizante de uso, las opciones del
selector de NPS y los `min` de los campos numéricos.

**Rationale**: un deslizante 0–100 o un selector 0–10 escritos en el frontend redefinirían
los rangos en un segundo lugar, cosa que la constitución prohíbe. El endpoint es trivial, se
documenta en OpenAPI y además sirve a cualquier otra interfaz.

**Alternatives considered**: hardcodear los rangos en la UI, que viola VI; generar un archivo
TS desde Python en el build, que agrega tooling para algo que una llamada GET resuelve.

## D4. Ubicación y stack del frontend

**Decision**: proyecto nuevo en `frontend/` en la raíz del repo, con Vite + React +
TypeScript + Tailwind CSS v4 + shadcn/ui + Recharts (stack fijado por la constitución). Se usan
las mismas versiones mayores que el prototipo: React 19, Vite 8, Tailwind 4 vía
`@tailwindcss/vite`. El gestor es **npm**, porque pnpm no está instalado en el entorno.

**Rationale**: separa claramente la UI del paquete Python (`src/health_score`), que no cambia
de estructura. Copiar las versiones del prototipo reduce sorpresas al portar el diseño.

**Alternatives considered**: servir la UI desde FastAPI con plantillas (contradice el stack
aprobado); reutilizar la carpeta del prototipo (es material de referencia y mezcla datos
simulados).

## D5. Comunicación UI ↔ API en desarrollo

**Decision**: el frontend llama siempre a rutas relativas `/api/...`. En `vite.config.ts`, la
opción `server.proxy` (y `preview.proxy`) reenvía `/api` a `http://127.0.0.1:8000` quitando el
prefijo. La URL destino se puede cambiar con la variable `VITE_API_TARGET`.

**Rationale**: sin CORS no hace falta tocar la API ni agregar middleware, y el mismo código
funciona detrás de cualquier proxy inverso en el futuro.

**Alternatives considered**: `CORSMiddleware` en FastAPI (es un cambio de backend que no pide la
spec); URL absoluta en el bundle (acopla el build a un host).

## D6. Navegación sin biblioteca de ruteo

**Decision**: navegación por hash con `hashchange` nativo: `#/cartera` (inicio),
`#/categorias`, `#/nuevo`, `#/configuracion` y `#/cartera/<client_id>` para el panel de
detalle. Un hook `useHashRoute` de unas 20 líneas.

**Rationale**: son cuatro vistas y un panel. El hash da botón "atrás", enlaces compartibles y
detalle abrible por URL sin agregar `react-router` (Principio I). Abrir el panel cambiando solo
el hash conserva búsqueda, filtro y orden de la cartera (FR-020), porque la página no se
desmonta.

**Alternatives considered**: `react-router` (dependencia innecesaria para este tamaño); estado
en memoria como el prototipo (se pierden "atrás" y los enlaces).

## D7. Obtención de datos y estados

**Decision**: `fetch` nativo envuelto en `api/client.ts`, que tipa las respuestas y convierte
los errores en `ApiError { status, fieldErrors? }`. Un hook `useApi(loader)` expone
`{status: "loading" | "error" | "success", data, reload}` y cancela con `AbortController` al
desmontar o al cambiar de dependencia (edge case "respuesta tardía en otra pantalla"). La
cartera se carga una vez en `App` y la comparten "Cartera" y "Por categoría", así los conteos
coinciden siempre (US4-AS1).

**Rationale**: tres GET y un POST no justifican TanStack Query ni SWR.

**Alternatives considered**: TanStack Query (cache e invalidación que no se usan).

## D8. Qué cálculos puede hacer la UI (FR-004)

**Decision**: la UI **no** calcula score, nivel, sub-scores ni conteos por nivel. Solo hace
cálculos de presentación sobre valores devueltos por la API:
- porcentaje de cada grupo = conteo del `summary` / `summary.total`;
- grupo "Inválido" = resultado con `result === null`, que es justo la definición del contrato;
- métrica más débil = la clave con el menor valor en `sub_scores`;
- peso como porcentaje = peso / suma de pesos de `GET /config`;
- búsqueda, filtro y orden de la tabla.

**Rationale**: cumple el Principio II y la restricción del frontend ("MUST NOT reimplementar
lógica de scoring") y deja explícito qué aritmética es solo de presentación.

## D9. Mapeo visual del prototipo a shadcn/ui y Recharts

**Decision**:

| Prototipo | Implementación |
|-----------|----------------|
| Tokens CSS (`--brand`, `--top`, `--stable`, `--risk`, `--invalid` y sus `-soft`, claro/oscuro) | Variables CSS en `index.css` + `@theme inline` de Tailwind v4, más las variables que espera shadcn (`--background`, `--primary`, …) asignadas a esos tokens |
| `.badge` por nivel | `Badge` de shadcn con variantes `top/stable/risk/invalid` |
| Donut con `conic-gradient` y barra apilada | Recharts `PieChart` (`innerRadius`) + leyenda propia; barra apilada con `BarChart` horizontal apilado |
| `ScoreRing` SVG | Recharts `RadialBarChart` con el score en el centro |
| `MetricBar` | `Progress` de shadcn con etiqueta |
| Tabla con búsqueda, select y orden | `Table`, `Input`, `Select` y `Button` de shadcn |
| Drawer lateral | `Sheet` de shadcn (Escape, clic fuera y foco atrapado de serie) |
| Columnas colapsables | `Collapsible` de shadcn |
| Deslizante de uso / segmentos NPS | `Slider` / `ToggleGroup` de shadcn |
| Tooltip de errores | `Tooltip` de shadcn |
| Íconos SVG propios | `lucide-react` (dependencia estándar de shadcn) |
| Estados carga/error/vacío | componente `StatePanel` sobre `Card` + `Skeleton`/`Alert` |

Se respetan del prototipo los textos, la marca "pulse health", la jerarquía (eyebrow, título,
descripción), la barra superior y la navegación móvil inferior.

**Rationale**: la constitución pide componentes shadcn y Recharts antes que piezas propias.
Los gráficos y el anillo del prototipo están hechos con CSS/SVG a mano, así que se reemplazan
por Recharts.

## D10. Modo oscuro

**Decision**: atributo `data-theme` en `<html>`, igual que el prototipo, y la variante `dark`
de Tailwind atada a ese atributo
(`@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`). La preferencia se
guarda en `localStorage` dentro de `try/catch`; si no hay valor guardado se usa
`prefers-color-scheme`.

## D11. Pruebas del frontend

**Decision**: Vitest + React Testing Library + jsdom, con `fetch` simulado por un stub en
memoria. Se cubren:
- `api/client.ts`: el mapeo de 422 a errores por campo y el 404;
- que cada pantalla renderice lo que devuelve la API, sin recalcular nada (FR-004, SC-001);
- los estados de carga, error y vacío;
- la navegación por teclado de la tabla.

La paridad con el backend se cubre en pytest con tests de contrato de los cambios D1 a D3.

**Rationale**: el Principio VII exige pytest para las reglas de negocio, que siguen en Python.
La UI no tiene reglas propias, pero sí mapeos de contrato que conviene proteger. Vitest es el
runner nativo de Vite y no necesita configuración aparte.

**Alternatives considered**: sin tests de UI (deja sin cubrir FR-015 y SC-001); Playwright
(E2E pesado para esta etapa; la validación de punta a punta va manual en
[quickstart.md](quickstart.md)).

## D12. Rendimiento con 1.000 clientes (SC-004)

**Decision**: tabla sin virtualización. El filtrado y el orden se hacen con `useMemo`, y la
búsqueda pasa por `useDeferredValue` para que escribir no se trabe.

**Rationale**: 1.000 filas simples renderizan bien en React 19. Virtualizar agrega una
dependencia; se reconsidera solo si la medición de SC-004 falla.
