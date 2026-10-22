# Quickstart: validar la persistencia, el CRUD y el CUIL

## Prerrequisitos

```powershell
pip install -e ".[dev]"
pytest                      # toda la suite (001, 002 y 003) en verde
cd frontend; npm install; npm test; cd ..
```

Para empezar desde cero, borrar `data/health_score.db` si existe.

## 1. Carga inicial y paridad con el comportamiento anterior (US1)

```powershell
uvicorn health_score.api.app:app_from_env --factory --reload
```

1. `GET /portfolio`: 20 clientes con los mismos scores y niveles que antes; `summary.total = 20`;
   cada resultado trae además `cuil` (C-001 → `20900000015`).
2. `GET /clients`: 20 registros con `client_id` (`C-001` … `C-020`), `cuil` (11 dígitos),
   `name` y `metrics`.
3. `POST /portfolio/score` con la cartera de ejemplo de la spec 001: exactamente los mismos
   resultados que antes, sin la clave `cuil`.
4. Reiniciar el servicio: la cantidad sigue siendo 20 y no hay duplicados.

## 2. Crear y consultar con CUIL (US2)

1. `POST /clients` con el cuerpo `ClientData` de [contracts](contracts/http-api-changes.md) →
   201 con un `client_id` UUID (36 caracteres) y cabecera `Location`.
2. `GET /clients/{uuid}` → mismo `cuil`; `GET /portfolio` incluye el cliente con su score y
   `cuil`; `GET /clients/{uuid}/score` también trae el `cuil`.
3. Repetir el mismo `POST` → 409 por CUIL.
4. Mismo cuerpo con `"client_id": "C-999"` agregado → 422 "campo no permitido".
5. Dos `POST` válidos con CUIL distintos → dos UUID distintos.

## 3. Validaciones (US3)

1. `cuil` `"20900000016"` → 422 "dígito verificador".
2. `cuil` `"2090000001"`, `"2090000001A"`, `20900000015` (número) → 422 "formato".
3. `usage: 101` junto con un CUIL inválido → 422 con ambos campos.
4. `cuil` `"20-90000001-5"` en un alta nueva → 409 (es el CUIL de C-001) y, con un CUIL libre
   pero con guiones, 201 con `cuil` guardado sin guiones.

## 4. Actualizar y eliminar (US4, US5)

1. `PUT /clients/{uuid}` con otro CUIL válido libre → 200; con el CUIL de C-001 → 409; con su
   propio CUIL → 200; con `client_id` en el cuerpo → 422.
2. `PUT /clients/C-999` → 404.
3. `DELETE /clients/{uuid}` → 204; `GET /clients/{uuid}` → 404; crear otro con el mismo CUIL
   → 201 con un UUID nuevo.
4. Eliminar los 20 clientes y reiniciar: la cartera queda vacía (no se vuelve a cargar).

## 5. CUIL en el dashboard (US6)

```powershell
cd frontend; npm run dev
```

1. Cartera: columna "CUIL" con `20-90000001-5` en C-001 y el resto con guiones.
2. Buscar `20900000015`, `20-90000001-5` y `90000001` → solo C-001; buscar `acme` sigue
   funcionando por nombre.
3. Por categoría: cada tarjeta muestra el CUIL junto al identificador.
4. Abrir el detalle de C-001: el encabezado muestra `20-90000001-5`.
5. Nuevo cliente: calcular un score → no aparece CUIL ni etiqueta vacía.
6. Apuntar el dashboard a un servicio sin `cuil` (p. ej. pruebas con fixture sin el campo):
   se muestra `—` y nada se rompe.

## 6. Pruebas automatizadas

```powershell
pytest tests/unit/test_cuil.py tests/unit/test_sql_repository.py tests/unit/test_scoring.py
pytest tests/integration/test_clients_api.py tests/integration/test_persistence_restart.py tests/integration/test_contract_compat.py
cd frontend; npm test
```

Deben cubrir CUIL válido (con y sin guiones), formato incorrecto, dígito verificador inválido
(todos los dígitos 0–9 distintos del correcto), resto 1, duplicados en alta y edición, UUID
generado (formato, unicidad, `client_id` en el cuerpo → 422), score idéntico con y sin CUIL,
`cuil` presente en cartera y score, idempotencia de la carga inicial, persistencia entre
reinicios, compatibilidad de contrato y, en el frontend, formateo, columna, tarjetas, detalle,
búsqueda y ausencia en "Nuevo cliente".

## 7. Documentación OpenAPI

`http://127.0.0.1:8000/docs`: `POST/GET/PUT/DELETE /clients…` con esquemas y respuestas
404, 409, 422 y 503; `StoredClientScoreResult` muestra el campo `cuil`; `ClientData` no tiene `client_id`.
