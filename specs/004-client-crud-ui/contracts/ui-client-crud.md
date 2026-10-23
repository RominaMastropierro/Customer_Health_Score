# Contrato de UI: CRUD de clientes en el dashboard

Endpoints consumidos (sin cambios, spec 003): ver
[http-api-changes.md](../../003-client-persistence-crud/contracts/http-api-changes.md).

| Acción | Solicitud | Éxito |
|--------|-----------|-------|
| Guardar en cartera | `POST /api/clients` con `ClientData` | 201 `ClientRecord` |
| Guardar edición | `PUT /api/clients/{client_id}` con `ClientData` | 200 `ClientRecord` |
| Eliminar | `DELETE /api/clients/{client_id}` | 204 sin cuerpo |
| Refrescar tras cualquiera | `GET /api/portfolio` (+ `GET /api/clients/{id}/score` tras editar) | 200 |

Ejemplo de cuerpo enviado desde "Nuevo cliente" con el CUIT escrito con guiones:

```json
{
  "cuil": "20-90000024-4",
  "name": "Cliente Ficticio",
  "metrics": {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}
}
```

## Rótulo

`CUIL_LABEL = "CUIT/CUIL"`, único lugar: `frontend/src/lib/display.ts`.

| Lugar | Antes | Ahora |
|-------|-------|-------|
| Tabla de la cartera, cabecera | `CUIL` | `CUIT/CUIL` |
| Buscador, `title` | `Buscar por nombre, ID o CUIL` | `Buscar por nombre, ID o CUIT/CUIL` |
| Tarjeta por categoría, valor | sin rótulo | `aria-label="CUIT/CUIL 20-90000001-5"` |
| Detalle, valor del encabezado | sin rótulo | `aria-label="CUIT/CUIL 20-90000001-5"` |
| Formularios de alta y edición | — | campo `CUIT/CUIL` |

## Campo "CUIT/CUIL"

| Atributo | Valor |
|----------|-------|
| Posición | primer campo, antes de "Nombre" |
| Rótulo / ayuda | `CUIT/CUIL` / `Con o sin guiones` |
| Control | `Input type="text" inputMode="numeric" autoComplete="off"` |
| Placeholder | `XX-XXXXXXXX-X` |
| Valor | texto tal cual se escribe: sin reformateo, sin `trim`, conserva ceros |
| Error | debajo del campo, `aria-invalid` + `aria-describedby="cuil-error"` |

## "Nuevo cliente" → "Guardar en cartera"

| Condición | Botón | Texto secundario |
|-----------|-------|------------------|
| CUIT/CUIL vacío | deshabilitado | `Falta el CUIT/CUIL` |
| Formulario cambió desde el cálculo | deshabilitado | `Vuelve a calcular para guardar` |
| Listo | habilitado | — |
| Guardando | deshabilitado | `Guardando` (con spinner) |

Confirmación: `Cliente guardado: <nombre o "Cliente nuevo"> · <CUIT/CUIL con guiones>`, acción
`Ver en la cartera` → `#/cartera/{client_id}`. El formulario queda vacío.

## Detalle del cliente

| Elemento | Modo lectura | Modo edición |
|----------|--------------|--------------|
| Botones | `Editar`, `Eliminar` | `Guardar cambios` (deshabilitado sin cambios), `Cancelar` |
| Identificador | visible | visible, no editable |
| Campos | — | `ClientFields` precargado (CUIT/CUIL con guiones) |

Confirmación tras editar: `Cambios guardados: <nombre>`.

## Diálogos (AlertDialog de shadcn)

| Diálogo | Título | Descripción | Botones |
|---------|--------|-------------|---------|
| Eliminar | `¿Eliminar cliente?` | `<nombre> · CUIT/CUIL <con guiones>. Esta acción no se puede deshacer.` | `Cancelar`, `Eliminar cliente` (destructivo; `Eliminando` mientras corre) |
| Descartar | `¿Descartar cambios?` | `Los cambios sin guardar se perderán.` | `Seguir editando`, `Descartar` |

Cancelar: botón, Escape o clic fuera. Al cerrar, el foco vuelve al botón que abrió el diálogo.
Confirmación tras eliminar: `Cliente eliminado: <nombre>`.

## Mensajes de error

| Caso | Dónde | Texto |
|------|-------|-------|
| CUIT/CUIL vacío al guardar | alta: texto secundario del botón deshabilitado; edición: campo CUIT/CUIL | `Falta el CUIT/CUIL` (no llama al servicio) |
| Métrica vacía o no numérica | campo | `Introduce un número entero` (existente) |
| 422 de un campo | campo | `msg` del servicio, sin cambios |
| 409 CUIL duplicado | campo CUIT/CUIL | `detail` del servicio |
| 422/409 no asociable | aviso del formulario | mensaje del servicio |
| 404 al editar/eliminar | detalle | estado `Cliente no encontrado` + `Volver a la cartera` |
| Sin conexión / 503 / otro | aviso general | `No pudimos guardar los cambios. Inténtalo de nuevo.` (alta y edición) / `No pudimos eliminar el cliente. Inténtalo de nuevo.` |

## Accesos

| Lugar | Elemento |
|-------|----------|
| Cartera, encabezado | enlace-botón `Nuevo cliente` → `#/nuevo` |
| Cartera vacía | el mismo enlace dentro del estado vacío |
