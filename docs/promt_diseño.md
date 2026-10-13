# Rol
Sos un diseñador senior de producto B2B SaaS. Diseñá una app web responsive (desktop primero,
usable a 375px) para equipos de Customer Success que evalúan la "salud" de su cartera de
clientes. Idioma de la interfaz: español (rioplatense neutro). Estilo: limpio, sobrio, tipo
dashboard (referencias: Linear, Stripe Dashboard). Incluí modo claro y oscuro.

# Contexto del dominio
Cada cliente tiene 4 métricas y la API devuelve un score de salud (0–100) y una CATEGORÍA (nivel):
- "Top" (score ≥ 75 por defecto) → color verde
- "Estable" (50–74) → color ámbar/azul neutro
- "En riesgo" (< 50) → color rojo
- "Inválido" (cliente con errores de datos, sin score) → gris
Los umbrales son configurables y se leen de GET /config (thresholds.top, thresholds.at_risk).
No los hardcodees en los textos: mostralos dinámicamente ("Top: score ≥ {top}").

# API de referencia (contrato existente: no inventes endpoints)
- POST /score → body ClientMetrics → 200 ScoreResult | 422 error de validación
- GET /portfolio → 200 PortfolioResult (cartera almacenada)
- GET /clients/{client_id}/score → 200 ClientScoreResult | 404 {"detail": "Cliente 'C-999' no encontrado"}
- GET /config → 200 ScoringConfig (pesos, umbrales, normalización)

Modelos:
- ClientMetrics (los 4 obligatorios, enteros estrictos, sin campos extra):
  - usage: 0–100 (% de uso del producto)
  - support_tickets: ≥ 0 (tickets en los últimos 30 días)
  - nps: 0–10 (NPS individual)
  - days_to_renewal: ≥ 0 (días hasta la renovación)
- Client: client_id (string, obligatorio, único), name (string opcional), metrics (ClientMetrics)
- ScoreResult: score (int 0–100), level ("Top" | "Estable" | "En riesgo"),
  sub_scores { usage, support_tickets, nps, renewal } (float 0–100, 2 decimales)
- ClientScoreResult: client_id, name, y O BIEN result (ScoreResult) O BIEN errors
  (lista de { field: "metrics.nps", message: "debe ser un entero entre 0 y 10" }), nunca ambos
- PortfolioResult: results[] (ClientScoreResult) + summary { total, by_level { "Top", "Estable",
  "En riesgo" }, invalid }. Invariante: Top + Estable + En riesgo + invalid = total
- Error 422: { "detail": [ { "loc": ["body","nps"], "msg": "...", "type": "..." } ] }

# Navegación
Sidebar con: "Cartera" (lista), "Por categoría", "Nuevo cliente", "Configuración" (solo
lectura, muestra pesos y umbrales). Header con título de sección y botón primario
"+ Nuevo cliente".

# Pantalla 1 — Nuevo cliente (formulario + evaluación)
- Campos: ID de cliente (obligatorio), Nombre (opcional), Uso del producto (%) con slider +
  input 0–100, Tickets de soporte (30 días) numérico ≥ 0, NPS con selector segmentado 0–10,
  Días hasta renovación numérico ≥ 0.
- Validación en el cliente que refleja el contrato: solo enteros, rangos indicados, mensajes
  inline debajo de cada campo. Mapear errores 422 del servidor al campo según detail[].loc.
- Botón "Calcular score" → llama a POST /score con solo las 4 métricas.
- Panel de resultado a la derecha (abajo en mobile): score grande (0–100) en un medidor
  radial, badge de categoría con su color, y desglose de sub_scores en 4 barras horizontales
  (Uso, Tickets, NPS, Renovación) para explicar el resultado.
- IMPORTANTE: la API actual NO persiste clientes. Diseñá un botón secundario "Guardar en
  cartera" en estado deshabilitado con el tooltip "Disponible próximamente". No simules
  que se guarda.
- Estados: vacío (sin cálculo aún), cargando, éxito, error 422, error de red.

# Pantalla 2 — Cartera (listado de clientes)
- Fuente: GET /portfolio.
- Fila de KPIs arriba: Total de clientes, Top, Estable, En riesgo, Inválidos (de summary).
- Tabla: ID, Nombre (o "—" si es null), Score (número + mini barra), Categoría (badge),
  Uso %, Tickets, NPS, Días a renovación. Para clientes inválidos: score "—", badge gris
  "Inválido" y un ícono de alerta que muestra los errors[] (field + message) en un tooltip o
  popover.
- Búsqueda por ID o nombre, filtro por categoría (chips multi-select), orden por score
  (por defecto ascendente, para priorizar los que están en riesgo).
- Clic en una fila → drawer lateral con el detalle (GET /clients/{id}/score): score,
  categoría, sub_scores en barras y errores si los hay. Diseñá el estado 404.
- Estados: cargando (skeleton), cartera vacía (todos los conteos en 0, con ilustración y CTA
  "Nuevo cliente"), error.

# Pantalla 3 — Clientes por categoría
- Fuente: GET /portfolio, agrupando results por result.level; los que tienen errors van al
  grupo "Inválidos".
- Layout: 4 columnas tipo kanban (Top, Estable, En riesgo, Inválidos) en desktop, o
  acordeones en mobile. Cada encabezado muestra el nombre de la categoría, el color, la
  cantidad y el % sobre el total.
- Cards de cliente: nombre/ID, score, la métrica más baja de sus sub_scores destacada
  ("Punto débil: NPS 30").
- Orden dentro de cada grupo: score ascendente.

# Componente — Gráfico de distribución de la cartera
- Ubicación: arriba de la Pantalla 3 y también como card en la Pantalla 2.
- Gráfico de dona (donut) con el % de cada categoría sobre el total de la cartera:
  % = by_level[nivel] / summary.total × 100 (y invalid / total para "Inválidos").
- Centro de la dona: total de clientes. Leyenda al lado con categoría, cantidad y %
  (1 decimal). Los porcentajes deben sumar 100%.
- Ocultar el segmento "Inválidos" si invalid = 0. Si total = 0, mostrar un estado vacío
  en vez de una dona.
- Alternativa accesible: barra apilada 100% horizontal debajo, más tooltip al pasar el
  cursor sobre cada segmento.
- Colores consistentes con los badges en toda la app. No depender solo del color: incluir
  etiquetas de texto.

# Requisitos transversales
- Accesibilidad WCAG AA: contraste, foco visible, labels en todos los inputs.
- Datos de ejemplo SIEMPRE ficticios (ej.: "Acme Ficticia", "C-001"), nunca empresas reales.
- Componentes reutilizables: Badge de categoría, ScoreGauge, SubScoreBars, KpiCard,
  DistributionDonut, ClientTable, ClientDrawer.
- Datos mock para el prototipo: 20 clientes (≈ 6 Top, 8 Estable, 5 En riesgo, 1 inválido
  con error en "metrics.usage": "debe ser un entero entre 0 y 100").

# Entregables
Las 3 pantallas + el componente del gráfico, cada uno con sus estados (vacío, cargando,
error, con datos), en desktop y mobile, más una hoja de estilos con tokens (colores por
categoría, tipografía, espaciado).
