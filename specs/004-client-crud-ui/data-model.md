# Data Model: CRUD de Clientes desde el Dashboard

El servicio y su almacenamiento no cambian (spec 003,
[data-model](../003-client-persistence-crud/data-model.md)). Este documento describe los tipos
y estados **del frontend**. Nada de esto se persiste en el navegador.

## Tipos del contrato HTTP (`frontend/src/api/types.ts`)

Se agregan, con los mismos nombres de campo que el OpenAPI:

| Tipo | Campos | Uso |
|------|--------|-----|
| `ClientData` | `cuil: string`, `name: string \| null`, `metrics: ClientMetrics` | Cuerpo de `POST /clients` y `PUT /clients/{id}`. **Sin** `client_id`. |
| `ClientRecord` | `client_id: string` + campos de `ClientData` | Respuesta de alta y edición. `cuil` llega sin guiones. |

`ClientScoreResult` (con `cuil?: string | null`) no cambia.

## Errores (`frontend/src/api/client.ts`)

`FormField = MetricName | "cuil" | "name"`

`ApiError` conserva su forma; cambia el tipo de una propiedad:

| Propiedad | Antes | Ahora |
|-----------|-------|-------|
| `status` | `number` | sin cambios (`0` = sin conexión) |
| `fieldErrors` | `Partial<Record<MetricName, string>>` | `Partial<Record<FormField, string>>` |
| `formErrors` | `string[]` | sin cambios |

Clasificación por código (research R2):

| Código | Resultado en el formulario |
|--------|----------------------------|
| 422 | `fieldErrors` por campo + `formErrors` para lo no asociable |
| 409 (`detail` menciona "CUIL") | `fieldErrors.cuil = detail` |
| 409 (otro) | `formErrors = [detail]` |
| 404 | estado "Cliente no encontrado" del detalle |
| 0, 503, otros | aviso general con reintento |

## Borrador de cliente (`ClientFormValues`)

Valores tal como se escriben; todos son texto.

| Campo | Tipo | Regla en el dashboard | Validación real |
|-------|------|-----------------------|-----------------|
| `cuil` | `string` | No vacío al guardar (no se aplica `trim` al enviar) | Servicio: formato, dígito verificador, unicidad |
| `name` | `string` | Ninguna; vacío o solo espacios se envía `null` | Servicio |
| `usage`, `support_tickets`, `nps`, `days_to_renewal` | `string` | No vacío y numérico (regla existente) | Servicio: entero y rango |

Conversión a `ClientData`: `cuil` sin cambios, `name.trim() || null`, métricas con `Number()`.

## Estados de la pantalla "Nuevo cliente"

| Estado | `result` | "Guardar en cartera" |
|--------|----------|----------------------|
| Sin calcular | `null` | no se muestra (panel vacío, como hoy) |
| Calculado, sin CUIT/CUIL | presente | deshabilitado: "Falta el CUIT/CUIL" |
| Calculado, formulario modificado | presente | deshabilitado: "Vuelve a calcular para guardar" |
| Listo para guardar | presente, `values == calculatedFrom`, CUIL no vacío | habilitado |
| Guardando | presente | deshabilitado: "Guardando" |
| Guardado | `null`, formulario vacío | — (aviso de confirmación en `App`) |
| Error al guardar | presente | habilitado otra vez; errores por campo o aviso general |

Transiciones: `Calcular` → Calculado/Listo; editar un campo → "formulario modificado";
`Guardar` → Guardando → Guardado | Error.

## Estados del detalle del cliente

```text
view ──Editar──▶ edit ──Guardar (200)──▶ view (recarga score)
  │               │  ├─Guardar (404)──▶ not-found
  │               │  ├─Guardar (409/422)─▶ edit (errores por campo)
  │               │  └─Cancelar / Descartar ─▶ view
  │               └─cerrar con cambios ─▶ diálogo "¿Descartar cambios?"
  └─Eliminar──▶ diálogo de eliminación ──Confirmar (204)──▶ cerrado, aviso en App
                                         ├─Confirmar (404)──▶ not-found
                                         ├─Confirmar (error)─▶ diálogo con aviso, reintento
                                         └─Cancelar ─▶ view
```

`dirty = values !== initialValues` (campo a campo; `cuil` se compara quitando guiones solo
para decidir si hubo cambios, nunca para enviarlo).

## Aviso de operación (`Notice`, estado en `App`)

| Campo | Tipo | Ejemplo |
|-------|------|---------|
| `text` | `string` | `Cliente guardado: Cliente Ficticio · 20-90000024-4` |
| `action` | `{ label: string; href: string } \| undefined` | `{ label: "Ver en la cartera", href: "#/cartera/<uuid>" }` |

Se limpia al cerrarlo, al cambiar de página o al llegar otro aviso.
