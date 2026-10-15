# Quickstart: validar la persistencia y el CRUD de clientes

## Prerrequisitos

```powershell
pip install -e ".[dev]"
pytest                      # toda la suite (001, 002 y 003) en verde
```

Para empezar desde cero, borrar `data/health_score.db` si existe.

## 1. Carga inicial y paridad con el comportamiento anterior (US1)

```powershell
uvicorn health_score.api.app:app --reload
```

1. `GET /portfolio`: 20 clientes con los mismos scores y niveles que antes; `summary.total = 20`.
2. `GET /clients`: 20 registros con `client_id`, `cuil` (11 dígitos), `name` y `metrics`.
3. Reiniciar el servicio: la cantidad sigue siendo 20 y no hay duplicados.
4. Abrir el dashboard (`cd frontend; npm run dev`): las pantallas funcionan sin cambios.

## 2. Crear y consultar con CUIL (US2)

1. `POST /clients` con el cuerpo de ejemplo de [contracts](contracts/http-api-changes.md) → 201.
2. `GET /clients/C-021` → mismo `cuil`; `GET /portfolio` incluye el cliente con su score.
3. Repetir el mismo `POST` → 409 por `client_id`.
4. `POST` con otro `client_id` y el mismo `cuil` (probar también `20-90000002-3`) → 409 por CUIL.

## 3. Validaciones (US3)

1. `cuil` `"20900000016"` → 422 "dígito verificador".
2. `cuil` `"2090000001"`, `"2090000001A"`, `20900000015` (número) → 422 "formato".
3. `usage: 101` junto con un CUIL inválido → 422 con ambos campos.
4. `cuil` `"20-90000001-5"` en un alta nueva con otro id → 409 (es el CUIL de C-001) y, con un
   CUIL libre pero con guiones, 201 con `cuil` guardado sin guiones.

## 4. Actualizar y eliminar (US4, US5)

1. `PUT /clients/C-021` con otro CUIL válido libre → 200; con el CUIL de C-001 → 409; con su
   propio CUIL → 200; con `client_id` en el cuerpo → 422.
2. `PUT /clients/C-999` → 404.
3. `DELETE /clients/C-021` → 204; `GET /clients/C-021` → 404; recrearlo con el mismo CUIL → 201.
4. Eliminar los 20 clientes y reiniciar: la cartera queda vacía (no se vuelve a cargar).

## 5. Pruebas automatizadas

```powershell
pytest tests/unit/test_cuil.py tests/unit/test_sql_repository.py
pytest tests/integration/test_clients_api.py tests/integration/test_persistence_restart.py tests/integration/test_contract_compat.py
```

Deben cubrir CUIL válido (con y sin guiones), formato incorrecto, dígito verificador inválido
(todos los dígitos 0–9 distintos del correcto), resto 1, duplicados en alta y edición,
idempotencia de la carga inicial, persistencia entre reinicios y compatibilidad de contrato.

## 6. Documentación OpenAPI

`http://127.0.0.1:8000/docs`: `POST/GET/PUT/DELETE /clients…` con esquemas y respuestas
404, 409 y 422.
