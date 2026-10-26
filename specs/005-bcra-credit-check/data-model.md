# Data Model: Consulta de Situación Crediticia en el BCRA

Nada se persiste (FR-024): todas las entidades viven solo durante una solicitud (servicio) o
mientras la persona está en "Nuevo cliente" (dashboard).

## 1. Servicio: entrada

### `CreditStatusRequest` (cuerpo de `POST /credit-status`)

| Campo | Tipo | Regla |
|-------|------|-------|
| `cuil` | `Cuil` (`health_score/cuil.py`) | 11 dígitos o `XX-XXXXXXXX-X`, dígito verificador válido; se normaliza a 11 dígitos. Inválido → 422 |

`extra="forbid"`, como el resto de los cuerpos de la API.

## 2. Servicio: respuesta del BCRA (validación en el límite, R4)

Todos con `extra="ignore"`. Los nombres de campo son los del manual del BCRA.

### `BcraDebtResponse`
| Campo | Tipo |
|-------|------|
| `status` | `int` |
| `results` | `BcraResults` |

### `BcraResults`
| Campo | Tipo |
|-------|------|
| `identificacion` | `int` |
| `denominacion` | `str \| None` |
| `periodos` | `list[BcraPeriod]` |

### `BcraPeriod`
| Campo | Tipo | Regla |
|-------|------|-------|
| `periodo` | `str` | `AAAAMM` (regex `^\d{6}$`); otro valor → BCRA no disponible |
| `entidades` | `list[BcraEntity]` | |

### `BcraEntity`
| Campo | Tipo | Nota |
|-------|------|------|
| `entidad` | `str` | |
| `situacion` | `int \| None` | Fuera de 1–5 se acepta pero no cuenta para el tono |
| `monto` | `float \| None` | Miles de pesos; `None` no suma al total |
| `diasAtrasoPago` | `int \| None` | 0 = "no aplicable" |
| `refinanciaciones`, `recategorizacionOblig`, `situacionJuridica`, `irrecDisposicionTecnica`, `enRevision`, `procesoJud` | `bool` (default `False`) | Marcas especiales |
| `fechaSit1` | `str \| None` | Se pasa al modelo; el código no lo usa |

### `BcraLookup` (lo que devuelve la interfaz `BcraSource`)

Unión etiquetada:

- `Found(raw: dict, parsed: BcraDebtResponse)`: `raw` es el JSON tal como llegó, y se envía
  completo al modelo.
- `NotFound`: un 404 del BCRA, o una respuesta sin períodos o sin entidades en el más reciente.
- `Unavailable`: un error HTTP distinto de 404, falla de conexión, demora de más de 10 s, o un
  JSON inválido o con otra estructura.

## 3. Servicio: datos calculados (R8, sin IA)

### `CreditFacts`

Se calculan sobre el período más reciente (el `periodo` mayor).

| Campo | Tipo | Cálculo |
|-------|------|---------|
| `period_label` | `str` | `"202407"` → `"julio 2024"` |
| `worst_situation` | `int \| None` | Máximo de `situacion` entre las entidades con valor 1–5 |
| `worst_entity` | `str \| None` | Primera entidad con esa situación |
| `entity_count` | `int` | Cantidad de entidades del período |
| `total_pesos` | `str` | `sum(monto) * 1000`, formateado `"$ 59.000"`; montos `None` se omiten |
| `max_days_late` | `int` | Máximo de `diasAtrasoPago`; 0 si no hay |
| `tone` | `"positive" \| "warning" \| "risk" \| None` | 1 → positive, 2 → warning, 3–5 → risk; `None` si no hay situación válida |

## 4. Servicio: salida

### `CreditStatus` (respuesta 200 de `POST /credit-status`)

| Campo | Tipo | Regla |
|-------|------|-------|
| `status` | `"with_debts" \| "no_data" \| "bcra_unavailable" \| "summary_unavailable"` | |
| `tone` | `"positive" \| "warning" \| "risk" \| null` | Solo con `with_debts`; `null` en los demás |
| `message` | `str` | Texto listo para mostrar: el del modelo (`with_debts`) o uno fijo |

Textos fijos (FR-020), definidos en un único lugar (`credit/service.py`):

| `status` | `message` |
|----------|-----------|
| `no_data` | "El BCRA no registra deudas informadas para este CUIT/CUIL." |
| `bcra_unavailable` | "No pudimos consultar la situación en el BCRA en este momento. Inténtalo de nuevo en unos minutos." |
| `summary_unavailable` | "No pudimos preparar el resumen de la situación en el BCRA. Inténtalo de nuevo en unos minutos." |

### Flujo de estados del servicio

```text
POST /credit-status
  └─ cuil inválido ──────────────────────────────▶ 422 (sin consultar)
  └─ BcraSource.lookup(digits)
       ├─ NotFound ──────────────────────────────▶ no_data
       ├─ Unavailable ───────────────────────────▶ bcra_unavailable
       └─ Found ─▶ CreditFacts ─▶ Summarizer.summarize(prompt, raw, facts)
                                   ├─ texto 1..1200 chars, end_turn ─▶ with_debts (+ tone)
                                   └─ error/timeout/refusal/vacío/largo ─▶ summary_unavailable
```

## 5. Dashboard

### `CuitValidation` (`lib/cuit.ts`)

`{ ok: true; digits: string } | { ok: false; message: string }`

### `CreditCheckState` (`useCreditCheck`)

```text
idle ──blur válido──▶ loading(digits) ──200──▶ done(digits, CreditStatus)
  ▲                       │                       │
  │                       └─fetch falla──▶ failed(digits)
  └──── cambio del campo / guardado / salir de la pantalla (reset, aborta) ◀──┘
```

- Si `check(d)` llega con el mismo `d` en `loading` o `done`, no se hace nada (FR-006, FR-007).
- `retry()` solo está disponible en `failed`, o en `done` con `status` `bcra_unavailable` o
  `summary_unavailable`. Vuelve a `loading` con el mismo `digits`.
- Cuando el estado es `failed` se muestra el aviso de no disponibilidad (US4, escenario 4).

### Tipo TS `CreditStatus` (`api/types.ts`)

Igual que la tabla de la §4. `CreditStatusKind` y `CreditTone` se definen como uniones de
literales.
