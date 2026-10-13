# Contract: API HTTP

La fuente de verdad en ejecución es el OpenAPI generado (`/openapi.json`, `/docs`). Este
documento fija lo que ese OpenAPI debe declarar. Todos los cuerpos son JSON y los modelos
están en [data-model.md](../data-model.md).

## Formato de error

**422** (validación), en el formato estándar de FastAPI y Pydantic:

```json
{ "detail": [ { "loc": ["body", "nps"], "msg": "debe ser un entero entre 0 y 10", "type": "less_than_equal" } ] }
```

La forma es la estándar; solo el texto de `msg` está en español (spec 002, C2):

| Caso | `msg` |
|------|-------|
| `loc == ["body", <métrica>]` | `range_message(<métrica>)`, p. ej. "debe ser un entero entre 0 y 10" |
| `type == "missing"` | "campo obligatorio" |
| `type == "extra_forbidden"` | "campo no permitido" |
| otro | mensaje de Pydantic sin cambios |

**404**:

```json
{ "detail": "Cliente 'C-999' no encontrado" }
```

## `POST /score`

Evalúa un cliente (US1).

Request: `ClientMetrics`

```json
{ "usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90 }
```

**200**: `ScoreResult`

```json
{
  "score": 63,
  "level": "Estable",
  "sub_scores": { "usage": 60.0, "support_tickets": 70.0, "nps": 70.0, "renewal": 50.0 }
}
```

**422**: alguna métrica falta, está fuera de rango, no es entera o viene un campo extra.

## `POST /portfolio/score`

Evalúa la cartera enviada en la solicitud (US3).

Request:

```json
{
  "clients": [
    { "client_id": "C-001", "name": "Acme Ficticia", "metrics": { "usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300 } },
    { "client_id": "C-002", "metrics": { "usage": 120, "support_tickets": 1, "nps": 8, "days_to_renewal": 60 } }
  ]
}
```

**200**: `PortfolioResult`. Los clientes inválidos **no** provocan un 422 (R5). Cada
resultado trae `metrics` con las métricas tal como se recibieron (spec 002, C1); en un cliente
inválido conserva el valor original (p. ej., `usage: 120`) y es `null` si el registro no tenía
un objeto `metrics`.

```json
{
  "results": [
    { "client_id": "C-001", "name": "Acme Ficticia", "metrics": { "usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300 }, "result": { "score": 95, "level": "Top", "sub_scores": { "usage": 90.0, "support_tickets": 100.0, "nps": 90.0, "renewal": 100.0 } }, "errors": null },
    { "client_id": "C-002", "name": null, "metrics": { "usage": 120, "support_tickets": 1, "nps": 8, "days_to_renewal": 60 }, "result": null, "errors": [ { "field": "metrics.usage", "message": "debe ser un entero entre 0 y 100" } ] }
  ],
  "summary": { "total": 2, "by_level": { "Top": 1, "Estable": 0, "En riesgo": 0 }, "invalid": 1 }
}
```

**422**: falla la estructura, por ejemplo si falta `clients`, si no es una lista, si a un
elemento le falta `client_id` o `metrics`, o si hay `client_id` duplicados.

## `GET /portfolio`

Evalúa la cartera almacenada, la que entrega el `ClientRepository` configurado.

**200**: `PortfolioResult`, con el mismo formato que `POST /portfolio/score`, campo `metrics`
incluido.

## `GET /clients/{client_id}/score`

Evalúa un cliente de la cartera almacenada.

- **200**: `ClientScoreResult`, con `metrics` como en `POST /portfolio/score`.
- **404**: el `client_id` no existe.

## `GET /config`

Devuelve la configuración activa (US2).

**200**: `ScoringConfig`

## `GET /metrics`

Devuelve las métricas de entrada y sus rangos, derivados de `METRIC_RANGES` (spec 002, C3).
Las interfaces lo usan para sus controles sin redefinir los rangos.

**200**: `list[MetricRange]`

```json
[
  { "name": "usage", "min": 0, "max": 100, "message": "debe ser un entero entre 0 y 100" },
  { "name": "support_tickets", "min": 0, "max": null, "message": "debe ser un entero mayor o igual a 0" },
  { "name": "nps", "min": 0, "max": 10, "message": "debe ser un entero entre 0 y 10" },
  { "name": "days_to_renewal", "min": 0, "max": null, "message": "debe ser un entero mayor o igual a 0" }
]
```

## Requisitos para el OpenAPI generado

- Cada endpoint declara `response_model` y sus respuestas de error: 422 en los POST y 404 en
  `GET /clients/{client_id}/score`.
- Los nombres y tipos de los campos coinciden con [data-model.md](../data-model.md).
