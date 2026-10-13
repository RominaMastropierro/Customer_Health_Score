# Contract: rutas y pantallas de la UI

La UI se sirve desde `frontend/` y llama a la API siempre por rutas relativas `/api/<ruta>`.
El proxy de Vite quita el prefijo `/api` y reenvía a `VITE_API_TARGET` (por defecto
`http://127.0.0.1:8000`); ver research D5.

## Rutas (hash)

| Hash | Pantalla | Llamadas a la API | Spec |
|------|----------|-------------------|------|
| `#/cartera` (y vacío o desconocido) | Cartera | `GET /portfolio` (compartida con Por categoría) | US1, FR-007–FR-012 |
| `#/cartera/<client_id>` | Cartera + panel de detalle | además `GET /clients/<client_id>/score` | US3, FR-018–FR-020 |
| `#/categorias` | Por categoría | `GET /portfolio` (la misma carga de arriba) | US4, FR-021–FR-022 |
| `#/nuevo` | Nuevo cliente | `GET /metrics` al abrir; `POST /score` al calcular | US2, FR-013–FR-017 |
| `#/configuracion` | Configuración (solo lectura) | `GET /config` | US5, FR-023 |

`<client_id>` va codificado con `encodeURIComponent`. Al cerrar el panel se vuelve a
`#/cartera` con `history.back()` si se llegó desde la tabla, o con `replace` si se entró
directamente por URL.

## Navegación

- Barra superior (≥ 768 px): marca "pulse health", enlaces Cartera, Por categoría y Nuevo
  cliente, ícono de configuración y botón de tema.
- Barra inferior (< 768 px): Cartera, Categorías y Nuevo (FR-002). La configuración queda
  accesible desde el ícono de la barra superior, que se mantiene compacta.

## Mapeo de respuestas a estados

| Respuesta | Estado en pantalla |
|-----------|--------------------|
| En curso | `StatePanel loading` (skeleton o spinner). Nunca datos de ejemplo (FR-005). |
| Red caída, 5xx o JSON inesperado | `StatePanel error` "No pudimos cargar los datos" + "Reintentar" |
| `GET /portfolio` con `summary.total == 0` | `StatePanel empty` "Aún no hay clientes"; KPIs en 0 |
| Búsqueda o filtro sin coincidencias | estado vacío de tabla "Sin resultados" |
| `GET /clients/{id}/score` 404 | panel "Cliente no encontrado" + "Volver a la cartera" |
| `POST /score` 422 | `detail[i].loc[1]` → campo, `detail[i].msg` → texto bajo el campo. Si `loc[1]` no es una métrica conocida, se muestra arriba del formulario |
| `POST /score` otro error | aviso general con los valores conservados |

## Textos fijos

Todos en español (FR-026), tomados del prototipo cuando existen: "Vista general", "Cartera de
clientes", "Total clientes", "Distribución de salud", "Todos los clientes", "Buscar cliente",
"Calcular score", "Calculando", "Desglose del score", "Métrica más débil", "Sin clientes en
esta categoría", "Los datos no se guardarán automáticamente.", "Guardar en cartera ·
Disponible próximamente" (deshabilitado, FR-017).
