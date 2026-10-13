# Data Model: Pantallas del Dashboard de Salud de Clientes

Esta feature no crea entidades de negocio nuevas. Tiene dos partes:

1. **Cambios aditivos** a los modelos de la spec 001
   ([001/data-model.md](../001-customer-health-scoring/data-model.md)).
2. **Modelos de vista** del frontend: tipos TypeScript que reflejan el contrato HTTP más los
   estados de pantalla. No contienen reglas de scoring.

## 1. Cambios en los modelos del backend (spec 001)

### InvalidClient (modificado)

| Campo | Tipo | Regla |
|-------|------|-------|
| `client_id` | str \| null | sin cambios |
| `name` | str \| null | sin cambios |
| `errors` | list[FieldError] | sin cambios |
| **`metrics`** | dict[str, Any] \| null | **nuevo**. Objeto `metrics` del registro tal como llegó; `null` si faltaba o no era un objeto. No se valida ni se transforma. |

### ClientScoreResult (modificado)

| Campo | Tipo | Regla |
|-------|------|-------|
| `client_id` | str \| null | sin cambios |
| `name` | str \| null | sin cambios |
| **`metrics`** | dict[str, Any] \| null | **nuevo**. Cliente válido: las cuatro métricas validadas (`usage`, `support_tickets`, `nps`, `days_to_renewal`). Cliente inválido: `InvalidClient.metrics`. |
| `result` | ScoreResult \| null | sin cambios |
| `errors` | list[FieldError] \| null | sin cambios |

La invariante "`result` o `errors`, nunca ambos" no cambia. `metrics` es independiente de
ella: puede venir en ambos casos.

### MetricRange (nuevo, solo de salida)

Lo devuelve `GET /metrics` y se deriva de `METRIC_RANGES`. No existe otra definición.

| Campo | Tipo | Regla |
|-------|------|-------|
| `name` | `"usage" \| "support_tickets" \| "nps" \| "days_to_renewal"` | valor de `Metric` |
| `min` | int | extremo inferior inclusivo |
| `max` | int \| null | extremo superior inclusivo; `null` = sin tope |
| `message` | str | `range_message(metric)`, p. ej. "debe ser un entero entre 0 y 10" |

El orden de la lista es el de la enumeración `Metric`.

## 2. Modelos de vista del frontend (`frontend/src/api/types.ts`)

Los tipos de contrato se escriben a mano, con los mismos nombres de campo que el OpenAPI:

```text
ClientMetrics      { usage, support_tickets, nps, days_to_renewal: number }
SubScores          { usage, support_tickets, nps, renewal: number }
HealthLevel        "Top" | "Estable" | "En riesgo"
ScoreResult        { score: number; level: HealthLevel; sub_scores: SubScores }
FieldError         { field: string; message: string }
ClientScoreResult  { client_id: string | null; name: string | null;
                     metrics: Record<string, unknown> | null;
                     result: ScoreResult | null; errors: FieldError[] | null }
PortfolioResult    { results: ClientScoreResult[];
                     summary: { total: number; by_level: Record<HealthLevel, number>; invalid: number } }
ScoringConfig      { weights: { usage, support_tickets, nps, renewal: number };
                     thresholds: { top: number; at_risk: number };
                     normalization: { ticket_cap: number; renewal_horizon_days: number } }
MetricRange        { name: MetricName; min: number; max: number | null; message: string }
```

### DisplayGroup (solo presentación)

`"Top" | "Estable" | "En riesgo" | "Inválido"`.

- Se obtiene así: `result?.level ?? "Inválido"`. "Inválido" no es un nivel del motor (spec,
  Key Entities).
- Su conteo sale de `summary.by_level[level]` para los tres niveles y de `summary.invalid`
  para "Inválido". Nunca se recuenta.
- Cada grupo tiene un token de color (`top`, `stable`, `risk`, `invalid`) y una etiqueta
  textual (FR-025).

### MetricView (solo presentación)

Une cada métrica con su sub-score, su etiqueta y su formato. Es el único lugar del frontend
donde `days_to_renewal` (métrica) se relaciona con `renewal` (sub-score):

| Métrica | Sub-score | Etiqueta | Formato del valor original |
|---------|-----------|----------|----------------------------|
| `usage` | `usage` | Uso | `{v}%` |
| `support_tickets` | `support_tickets` | Tickets | `{v}` |
| `nps` | `nps` | NPS | `{v}/10` en el detalle, `{v}` en la tabla |
| `days_to_renewal` | `renewal` | Renovación | `{v} d` en la tabla, `{v} días` en el detalle |

Los valores de un cliente inválido se muestran como llegan (`String(v)`), y como "—" si faltan
(spec, Assumptions).

### ScoreFormState (pantalla Nuevo cliente)

| Campo | Tipo | Regla |
|-------|------|-------|
| `name` | string | opcional; no se envía a la API (FR-014) |
| `usage`, `support_tickets`, `nps`, `days_to_renewal` | string | el valor editado tal cual. Se convierte a número solo al enviar; si está vacío o no es numérico, el campo se marca y el envío se bloquea (edge case) |
| `fieldErrors` | Partial<Record<MetricName, string>> | viene del 422 (`detail[].loc[1]` → `msg`) |
| `status` | `"idle" \| "submitting" \| "success" \| "error"` | `submitting` deshabilita el botón (FR-016) |
| `result` | ScoreResult \| null | se muestra sin transformar |

Transiciones: `idle → submitting → success | error(422 → fieldErrors; otro → mensaje general)`.
Al editar un campo se borra su error. En `error` se conservan los valores ingresados.

### RemoteState&lt;T&gt; (todas las pantallas)

`{ status: "loading" } | { status: "error"; error: ApiError } | { status: "success"; data: T }`.
Lo vacío no es un estado aparte: se deduce de `data` (p. ej., `summary.total === 0`).

### Route

`{ page: "cartera" | "categorias" | "nuevo" | "configuracion"; clientId?: string }`, derivada del
hash ([contracts/ui-routes.md](contracts/ui-routes.md)).
