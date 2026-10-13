# Data Model: Motor de Scoring de Salud de Clientes

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Todas las entidades son valores inmutables y no hay persistencia de resultados. Los nombres
de campos están en inglés, igual que en los contratos. Los valores visibles para el negocio
(niveles) están en español.

## Metric (enum) y METRIC_RANGES

Definición única de los rangos (Principio VI). Ambos extremos son inclusivos. `None` indica
que no hay límite superior.

| Metric | Campo | Mín | Máx | Unidad |
|--------|-------|-----|-----|--------|
| `USAGE` | `usage` | 0 | 100 | % de uso del producto |
| `SUPPORT_TICKETS` | `support_tickets` | 0 | — | tickets en los últimos 30 días |
| `NPS` | `nps` | 0 | 10 | puntaje NPS individual |
| `RENEWAL` | `days_to_renewal` | 0 | — | días hasta la renovación |

## ClientMetrics

Las cuatro métricas de un cliente. Es un modelo Pydantic estricto (R6).

| Campo | Tipo | Regla |
|-------|------|-------|
| `usage` | int estricto | 0–100 |
| `support_tickets` | int estricto | ≥ 0 |
| `nps` | int estricto | 0–10 |
| `days_to_renewal` | int estricto | ≥ 0 |

Los cuatro campos son obligatorios. Se rechazan los decimales, los strings, los booleanos, el
`null` y cualquier campo extra.

## Client

Cliente de la cartera.

| Campo | Tipo | Regla |
|-------|------|-------|
| `client_id` | str | no vacío, único dentro de la cartera |
| `name` | str \| null | opcional, siempre ficticio |
| `metrics` | ClientMetrics | obligatorio |

## ScoringConfig

Se carga desde JSON y se valida al cargar (Principio III). El esquema formal está en
[contracts/scoring-config.schema.json](contracts/scoring-config.schema.json).

| Campo | Tipo | Regla | Default (FR-012) |
|-------|------|-------|------------------|
| `weights.usage` | número | ≥ 0 | 25 |
| `weights.support_tickets` | número | ≥ 0 | 25 |
| `weights.nps` | número | ≥ 0 | 25 |
| `weights.renewal` | número | ≥ 0 | 25 |
| `thresholds.top` | int | 0–100 | 75 |
| `thresholds.at_risk` | int | 0–100, < `top` | 50 |
| `normalization.ticket_cap` | int | > 0 | 10 |
| `normalization.renewal_horizon_days` | int | > 0 | 180 |

Reglas entre campos: Σ pesos > 0 y `at_risk < top`. Si falta un campo, sobra uno o alguna
regla falla, se lanza `ConfigError` con la ruta del campo y el motivo.

## HealthLevel (enum)

`"Top"` | `"Estable"` | `"En riesgo"`. Se asigna según R4.

## SubScores

| Campo | Tipo | Regla |
|-------|------|-------|
| `usage` | float | 0–100, 2 decimales |
| `support_tickets` | float | 0–100, 2 decimales |
| `nps` | float | 0–100, 2 decimales |
| `renewal` | float | 0–100, 2 decimales |

## ScoreResult

Resultado de evaluar un cliente válido.

| Campo | Tipo | Regla |
|-------|------|-------|
| `score` | int | 0–100 |
| `level` | HealthLevel | según los umbrales |
| `sub_scores` | SubScores | aporte explicable de cada métrica (FR-009) |

## ClientScoreResult

Elemento del resultado de una cartera. Tiene **o** `result` **o** `errors`, nunca ambos.

| Campo | Tipo | Regla |
|-------|------|-------|
| `client_id` | str | |
| `name` | str \| null | |
| `metrics` | dict \| null | agregado por la spec 002 (C1). Cliente válido: las cuatro métricas validadas. Cliente inválido: el objeto `metrics` tal como llegó, sin transformar; `null` si faltaba o no era un objeto. No afecta `result` ni `errors` |
| `result` | ScoreResult \| null | presente si el cliente es válido |
| `errors` | list[FieldError] \| null | presente si el cliente es inválido |

Un registro inválido (`InvalidClient`, interno) guarda su `client_id`, `name`, `errors` y
el mismo `metrics` crudo, para poder devolverlo en este resultado.

## FieldError

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `field` | str | `"metrics.nps"` |
| `message` | str | `"debe ser un entero entre 0 y 10"` |

## PortfolioResult

| Campo | Tipo | Regla |
|-------|------|-------|
| `results` | list[ClientScoreResult] | mismo orden que la entrada |
| `summary.total` | int | = cantidad de clientes recibidos |
| `summary.by_level` | `{"Top": int, "Estable": int, "En riesgo": int}` | las tres claves siempre presentes |
| `summary.invalid` | int | clientes con errores |

Invariante: `Top + Estable + En riesgo + invalid = total`. Una cartera vacía da todos los
conteos en 0.

## MetricRange

Agregado por la spec 002 (C3). Salida de `GET /metrics`, derivada de `METRIC_RANGES`.

| Campo | Tipo | Regla |
|-------|------|-------|
| `name` | Metric | valor de la enumeración |
| `min` | int | extremo inferior inclusivo |
| `max` | int \| null | extremo superior inclusivo; `null` = sin tope |
| `message` | str | `range_message(metric)` |

## Relaciones

```text
ScoringConfig ──┐
                ├─► score_client() ─► ScoreResult
ClientMetrics ──┘

Client[] + ScoringConfig ─► score_portfolio() ─► PortfolioResult
ClientRepository ─► Client[] (o errores de validación por registro)
```

No hay transiciones de estado: cada evaluación es independiente y no se almacena.
