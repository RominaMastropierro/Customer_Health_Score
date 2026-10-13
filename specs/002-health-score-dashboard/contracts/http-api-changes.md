# Contract: cambios a la API HTTP de la spec 001

Este documento es un **delta** sobre
[001/contracts/http-api.md](../../001-customer-health-scoring/contracts/http-api.md). Al
implementarlo, también hay que actualizar ese contrato, su `data-model.md` y sus tests de
contrato. Todo cambio es aditivo: ningún cliente actual de la API deja de funcionar.

## C1. Campo `metrics` en `ClientScoreResult`

Afecta a `GET /portfolio`, `GET /clients/{client_id}/score` y `POST /portfolio/score`.

```json
{
  "results": [
    {
      "client_id": "C-001",
      "name": "Acme Ficticia",
      "metrics": { "usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300 },
      "result": { "score": 95, "level": "Top", "sub_scores": { "usage": 90.0, "support_tickets": 100.0, "nps": 90.0, "renewal": 100.0 } },
      "errors": null
    },
    {
      "client_id": "C-002",
      "name": null,
      "metrics": { "usage": 120, "support_tickets": 1, "nps": 8, "days_to_renewal": 60 },
      "result": null,
      "errors": [ { "field": "metrics.usage", "message": "debe ser un entero entre 0 y 100" } ]
    }
  ],
  "summary": { "total": 2, "by_level": { "Top": 1, "Estable": 0, "En riesgo": 0 }, "invalid": 1 }
}
```

Reglas:

- `metrics` siempre está presente en el objeto (puede ser `null`).
- En un cliente válido, `metrics` tiene exactamente las cuatro claves, con valores enteros.
- En un cliente inválido, `metrics` repite el objeto recibido sin transformarlo. Es `null`
  si el registro no tenía `metrics` o no era un objeto.
- `score`, `level`, `sub_scores`, `errors` y `summary` no cambian para ninguna entrada.

Tests de contrato requeridos: el ejemplo de arriba; un registro sin `metrics` → `null`; un
registro con `"usage": "abc"` → `"abc"`; paridad biblioteca/API con el campo nuevo.

## C2. Mensajes de validación en español (422)

Afecta a todas las rutas con cuerpo. **El formato no cambia**: sigue siendo
`{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}`. Solo cambia el texto de `msg`:

| Caso | `msg` |
|------|-------|
| `loc == ["body", <métrica>]` y `type` distinto de `missing` / `extra_forbidden` | `range_message(<métrica>)`, p. ej. "debe ser un entero entre 0 y 10" |
| `type == "missing"` | "campo obligatorio" |
| `type == "extra_forbidden"` | "campo no permitido" |
| otro | mensaje de Pydantic sin cambios |

Ejemplo, `POST /score` con `{"usage": 60, "support_tickets": 3, "nps": 11, "days_to_renewal": 90}`:

```json
{ "detail": [ { "loc": ["body", "nps"], "msg": "debe ser un entero entre 0 y 10", "type": "less_than_equal" } ] }
```

## C3. `GET /metrics` (nuevo)

Devuelve las métricas de entrada y sus rangos, derivados de `METRIC_RANGES`.

**200**: `list[MetricRange]`

```json
[
  { "name": "usage", "min": 0, "max": 100, "message": "debe ser un entero entre 0 y 100" },
  { "name": "support_tickets", "min": 0, "max": null, "message": "debe ser un entero mayor o igual a 0" },
  { "name": "nps", "min": 0, "max": 10, "message": "debe ser un entero entre 0 y 10" },
  { "name": "days_to_renewal", "min": 0, "max": null, "message": "debe ser un entero mayor o igual a 0" }
]
```

Requisitos de OpenAPI: `response_model=list[MetricRange]`, tag `configuración`, resumen en
español.

Tests de contrato requeridos: la respuesta coincide con `METRIC_RANGES` para cada métrica y el
endpoint aparece en `/openapi.json`.
