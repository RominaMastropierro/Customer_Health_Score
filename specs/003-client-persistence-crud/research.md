# Research: Persistencia y CRUD de Clientes

Sin `NEEDS CLARIFICATION` pendientes. Cada decisión indica qué requisito resuelve.

## R1. Persistencia: SQLite + SQLAlchemy 2.x

- **Decisión**: SQLAlchemy 2.x (estilo declarativo tipado) sobre SQLite; una sesión por solicitud
  vía dependencia de FastAPI; `check_same_thread=False` porque los endpoints síncronos corren
  en un pool de hilos.
- **Rationale**: pedido del alcance; restricciones UNIQUE declarativas (FR-031); misma API
  para pruebas con base en memoria (`StaticPool`) o archivo temporal.
- **Alternativas**: `sqlite3` directo (sin dependencia, pero SQL manual por operación);
  SQLModel (otra dependencia que duplica Pydantic/SQLAlchemy).

## R2. Dónde vive el CUIL: modelo de CRUD separado, no en `Client`

- **Decisión**: `Client`, `RawClient`, `ClientScoreResult` y `PortfolioResult` no cambian.
  Se agregan `ClientRecord` (salida CRUD), `ClientCreate` y `ClientUpdate` (entradas).
  `ClientStore.get_record/list_records` devuelven `ClientRecord`; `list_clients/get_client`
  (Protocol existente) devuelven `Client` sin CUIL para el scoring.
- **Rationale**: `RawClient` es `extra="forbid"`; agregar `cuil` ahí cambiaría el contrato de
  `POST /portfolio/score` (FR-020) y arrastraría el CUIL al scoring puro (Principio II).
  FR-034 permite no incluir el CUIL en las respuestas de score/cartera.
- **Alternativas**: agregar `cuil` opcional a `Client` y a los resultados (cambio aditivo
  pero ensucia el scoring y el frontend recibe datos que no usa).

## R3. Regla del CUIL en un único módulo

- **Decisión**: `health_score/cuil.py` con:
  - `normalize_cuil(value) -> str`: acepta `str` de 11 dígitos o `XX-XXXXXXXX-X` (regex
    `^\d{11}$|^\d{2}-\d{8}-\d$`), devuelve 11 dígitos; cualquier otra cosa (incluidos `int`,
    `None`, espacios) → error de formato.
  - `check_digit(first10) -> int | None`: pesos `(5,4,3,2,7,6,5,4,3,2)`, `r = suma % 11`;
    `r == 0 → 0`, `r == 1 → None` (no existe), otro → `11 - r`.
  - Tipo `Cuil = Annotated[str, BeforeValidator(...)]` que lanza `PydanticCustomError` con tipos
    `cuil_format` y `cuil_check_digit` y mensajes en español ya listos.
- **Rationale**: Principio VI (una sola definición); mensajes que distinguen formato de
  dígito (FR-032); al ser `PydanticCustomError`, el handler 422 existente los devuelve tal cual
  sin tocar `validation_message`.
- **Alternativas**: validar en el repositorio (viola Principio V: validar en el límite).
- **Nota**: el caso `resto == 1` se rechaza (FR-030); en la práctica real el CUIT cambia de
  prefijo, pero aquí solo se valida el número recibido.

## R4. Unicidad y conflictos (409)

- **Decisión**: `client_id` es PRIMARY KEY; `cuil` tiene `UNIQUE`. En `create/update` el
  repositorio ejecuta INSERT/UPDATE y captura `IntegrityError`; en ese caso hace rollback y
  consulta cuál campo colisiona para producir `ClientConflictError(field)`. No hay
  verificación previa "check-then-insert" como mecanismo principal, solo la restricción.
- **Rationale**: correcto bajo concurrencia (FR-031, edge case de solicitudes simultáneas);
  422 antes que 409 ocurre solo porque la validación Pydantic precede al repositorio.
- **Mensajes 409** (`{"detail": "..."}` como el 404): `Ya existe un cliente con el
  identificador 'C-001'` / `El CUIL '20900000015' ya está registrado en otro cliente`. Si
  colisionan ambos se informa el identificador primero.
- **Update con el propio CUIL**: el UPDATE sobre la misma fila no viola UNIQUE → no hay conflicto.

## R5. Atomicidad (FR-013)

- **Decisión**: cada operación de escritura usa una transacción (`with session.begin()`); ante
  error se hace rollback. SQLite garantiza atomicidad del commit.

## R6. Carga inicial idempotente y "solo si nunca se inicializó" (FR-004/005/006)

- **Decisión**: tabla `seed_state(id=1, done)`. Al arrancar (`app_from_env`): en una sola
  transacción, si no existe la fila → validar los registros del archivo con `ClientCreate`
  (mismas reglas que el alta), insertar con `INSERT ... ON CONFLICT DO NOTHING`
  (omite client_id o cuil ya existentes, lo reporta) y escribir `seed_state`. Si la fila existe
  → no hace nada aunque la cartera esté vacía.
- Archivo ausente o JSON inválido con base sin inicializar → excepción explícita; la
  transacción no confirma, el servicio no arranca (edge case). Registros inválidos individuales
  se omiten y se devuelven en un `SeedReport` (insertados / omitidos con motivo) que se registra
  en el log.
- `seed_clients(path)` también es invocable explícitamente (idempotente) para las pruebas de
  SC-004; en ese modo ignora `seed_state` y solo agrega faltantes sin modificar existentes.
- **Rationale**: transaccionalidad evita arranque con datos parciales; la marca persistida
  distingue "vacía por eliminaciones" de "nunca inicializada".

## R7. Archivo de datos compartido y compatibilidad con el adapter JSON

- **Decisión**: `data/clients.json` incorpora `"cuil"` en los 20 registros y sigue siendo la
  fuente de la carga inicial. `LocalJsonClientRepository` descarta la clave `cuil` antes de
  `validate_client_record` (una línea, con comentario del porqué), de modo que su comportamiento y
  las pruebas de 001/002 no cambian.
- **CUIL sintéticos (FR-033)**: `20` + cuerpo `90000001`, `90000002`, … en orden del archivo,
  salteando cuerpos con `r == 1` (el cuerpo 4), más dígito calculado. Resultado fijado en el
  archivo (valores: C-001 `20900000015`, C-002 `20900000023`, C-003 `20900000031`, C-004
  `20900000058`, C-005 `20900000066`, C-006 `20900000074`, C-007 `20900000082`, C-008
  `20900000090`, C-009 `20900000104`, C-010 `20900000112`, C-011 `20900000120`, C-012
  `20900000139`, C-013 `20900000147`, C-014 `20900000155`, C-015 `20900000163`, C-016
  `20900000171`, C-017 `20900000198`, C-018 `20900000201`, C-019 `20900000228`, C-020
  `20900000236`). Una prueba verifica unicidad, 11 dígitos y dígito verificador válido
  (SC-010).
- **Alternativas**: archivo de semilla separado (duplica los 20 clientes y sus métricas).

## R8. Dependencia de endpoints y estado de la app

- **Decisión**: `create_app(config, repository)` conserva su firma; `repository` pasa a poder
  ser un `ClientStore` (que además cumple `ClientRepository`). Los endpoints de escritura
  usan una dependencia `StoreDep` que lanza 501 si el repositorio no es escribible (caso de las
  pruebas existentes con `InMemoryClientRepository`), de modo que las pruebas de 001/002 siguen
  intactas.
- `app_from_env`: carga config, abre la base (`HEALTH_SCORE_DB`, default
  `data/health_score.db`), crea el esquema, ejecuta la carga inicial desde
  `HEALTH_SCORE_CLIENTS` (default `data/clients.json`), arma la app.

## R9. Semántica HTTP

- `POST /clients` → 201 con `ClientRecord`; `GET /clients` → 200 lista; `GET /clients/{id}` →
  200/404; `PUT /clients/{id}` → 200/404/409/422, reemplazo completo (cuerpo sin `client_id`:
  si lo trae se rechaza por `extra="forbid"`, 422 "campo no permitido"; US4-4);
  `DELETE /clients/{id}` → 204/404.
- `GET /clients/{id}` y `GET /clients/{id}/score` no colisionan (rutas distintas).
- Nombre del cliente: `str | None`, como en `Client`.

## R10. Rangos sin CHECK en la base

- **Decisión**: las columnas de métricas son `Integer NOT NULL` sin CHECK de rango.
- **Rationale**: los rangos están definidos solo en `METRIC_RANGES` (Principio VI);
  duplicarlos en el esquema sería una segunda definición. El límite de validación es Pydantic.
