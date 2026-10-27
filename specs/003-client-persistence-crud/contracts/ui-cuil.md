# Contrato de UI: CUIL en el dashboard (US6)

Fuente del dato: `cuil` de `StoredClientScoreResult`, en `GET /portfolio` y `GET /clients/{id}/score`
([http-api-changes.md](http-api-changes.md)). El frontend no valida ni calcula nada del CUIL.

## Formato de presentación (`formatCuil`, único lugar: `frontend/src/lib/display.ts`)

| Valor recibido | Se muestra |
|----------------|------------|
| `"20900000015"` | `20-90000001-5` |
| `"123"` (no son 11 dígitos) | `123` (tal cual) |
| `null` / campo ausente | `—` |

## Búsqueda (`matchesCuil`)

Se quitan los guiones de lo escrito; si queda un texto no vacío de solo dígitos, coincide con
los clientes cuyo CUIL lo contiene. Se suma a la búsqueda por nombre e identificador.

| Búsqueda | Coincide con C-001 (`20900000015`) |
|----------|------------------------------------|
| `20900000015` | sí |
| `20-90000001-5` | sí |
| `90000001` | sí (parcial) |
| `acme` | sí, por nombre (no por CUIL) |
| `20900000023` | no |

## Dónde se muestra

| Pantalla | Ubicación | Sin CUIL |
|----------|-----------|----------|
| Cartera, tabla | Columna "CUIL" después de "Cliente", texto monoespaciado sin cortes | `—` |
| Por categoría, tarjeta | Junto al identificador | `—` |
| Detalle del cliente | Encabezado, junto al identificador | `—` |
| Nuevo cliente, resultado | No se muestra ni se reserva espacio | — |

El identificador (`C-001` o UUID) sigue siendo la clave de navegación (`#/cliente/{id}`).
