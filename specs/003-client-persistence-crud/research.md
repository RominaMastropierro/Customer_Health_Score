# Research: Persistencia y CRUD de Clientes

Sin `NEEDS CLARIFICATION` pendientes. Cada decisión indica qué requisito resuelve.
Revisión 2026-10-19: cambian R2, R4, R6, R8 y R9; se agregan R11 (frontend) y R12 (UUID).

## R1. Persistencia: SQLite + SQLAlchemy 2.x

- **Decisión**: SQLAlchemy 2.x (estilo declarativo tipado) sobre SQLite; una sesión por solicitud
  vía dependencia de FastAPI; `check_same_thread=False` porque los endpoints síncronos corren
  en un pool de hilos.
- **Rationale**: pedido del alcance; restricciones UNIQUE declarativas (FR-031); misma API
  para pruebas con base en memoria (`StaticPool`) o archivo temporal.
- **Alternativas**: `sqlite3` directo (sin dependencia, pero SQL manual por operación);
  SQLModel (otra dependencia que duplica Pydantic/SQLAlchemy).

## R2. Dónde vive el CUIL: campo de identificación opcional en los modelos del resultado

- **Decisión** (revisada en la implementación): `Client` e `InvalidClient` suman
  `cuil: str | None = None`. `ClientScoreResult` y `PortfolioResult` **no cambian**: se crean
  `StoredClientScoreResult(ClientScoreResult)` con `cuil` y `StoredPortfolioResult(PortfolioResult)`
  con `results: list[StoredClientScoreResult]`, que son los modelos de respuesta de
  `GET /portfolio` y `GET /clients/{id}/score`. La API construye el resultado con
  `score_client_input` y le agrega el `cuil` del cliente: `scoring.py` no cambia. `RawClient` no
  cambia, así que `POST /portfolio/score` conserva su contrato exacto, **sin** la clave `cuil`.
  `POST /score` devuelve `ScoreResult` y no cambia.
- `SqlClientRepository.list_clients/get_client` devuelven `Client` con `cuil`; por eso
  `GET /portfolio` y `GET /clients/{id}/score` lo incluyen (FR-034).
- **Rationale**: FR-034 exige el campo en cartera y score de clientes persistidos. La primera
  versión (agregar `cuil` a `ClientScoreResult`) rompía dos pruebas de la 001 que comparan la
  respuesta completa de `POST /portfolio/score` y el conjunto exacto de campos del esquema
  `ClientScoreResult` (FR-021). Las subclases mantienen intacto ese contrato y documentan `cuil`
  en OpenAPI. Costo: en `EXPECTED_ENDPOINTS` los dos endpoints de la cartera almacenada declaran
  ahora `Stored*` (decisión de la usuaria del 2026-10-19).
- **Alternativas**: (a) dejar el CUIL fuera de los resultados (plan anterior; ya no cumple
  FR-034); (b) agregarlo en la capa API con `model_copy` tras puntuar (duplica la búsqueda del
  cliente y separa el dato de su origen); (c) omitir la clave cuando es `None` con un serializador
  propio (no evita el cambio del esquema `ClientScoreResult`).

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
  dígito (FR-032); al ser `PydanticCustomError`, el handler 422 existente devuelve su mensaje
  tal cual. `validation_message` sí se extiende, pero por otro motivo: los errores de métricas de
  `POST/PUT /clients` llegan con `loc` de 3 niveles (`["body", "metrics", <métrica>]`) y hoy
  solo se traducen los de 2 niveles (`POST /score`), así que saldrían en inglés (ver T031).
- **Alternativas**: validar en el repositorio (viola Principio V: validar en el límite).
- **Nota**: el caso `resto == 1` se rechaza (FR-030); en la práctica real el CUIT cambia de
  prefijo, pero aquí solo se valida el número recibido.

## R4. Unicidad y conflictos (409)

- **Decisión**: `client_id` es `UNIQUE NOT NULL` (clave lógica; la PK física es `position`, ver data-model); `cuil` tiene `UNIQUE`. En `create/update` el
  repositorio ejecuta INSERT/UPDATE y captura `IntegrityError`; en ese caso hace rollback y
  consulta cuál campo colisiona para producir `ClientConflictError(field)`. No hay
  verificación previa "check-then-insert" como mecanismo principal, solo la restricción.
- **Rationale**: correcto bajo concurrencia (FR-031, edge case de solicitudes simultáneas);
  422 antes que 409 ocurre solo porque la validación Pydantic precede al repositorio.
- **Mensajes 409** (`{"detail": "..."}` como el 404): `Ya existe un cliente con el
  identificador '<id>'` / `El CUIL '20900000015' ya está registrado en otro cliente`. Si
  colisionan ambos se informa el identificador primero.
- Con UUID v4 el conflicto de `client_id` en un alta es prácticamente imposible; no se
  reintenta con otro UUID: se responde 409 (US2-6) y la restricción garantiza la unicidad.
- **Update con el propio CUIL**: el UPDATE sobre la misma fila no viola UNIQUE → no hay conflicto.

## R5. Atomicidad (FR-013)

- **Decisión**: cada operación de escritura usa una transacción (`with session.begin()`); ante
  error se hace rollback. SQLite garantiza atomicidad del commit.

## R6. Carga inicial idempotente y "solo si nunca se inicializó" (FR-004/005/006)

- **Decisión**: tabla `seed_state(id=1, done)`. Al arrancar (`app_from_env`): en una sola
  transacción, si no existe la fila → validar los registros del archivo con `SeedClient`
  (mismas reglas que el alta, más el `client_id` del archivo), insertar con
  `INSERT ... ON CONFLICT DO NOTHING` (omite client_id o cuil ya existentes, lo reporta) y
  escribir `seed_state`. Si la fila existe → no hace nada aunque la cartera esté vacía.
- La carga inicial **no** genera UUID: conserva `C-001` … `C-020` (FR-003, SC-001).
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
  las pruebas de 001/002 no cambian; sus clientes tienen `cuil = None`. El servicio ya no usa
  este adapter, solo se conserva como implementación de `ClientRepository`.
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

- `POST /clients` → 201 con `ClientRecord` (incluye el `client_id` generado) y cabecera
  `Location: /clients/{client_id}`; el cuerpo es `ClientData` (sin `client_id`: si lo trae se
  rechaza por `extra="forbid"`, 422 "campo no permitido").
- `GET /clients` → 200 lista; `GET /clients/{id}` → 200/404.
- `PUT /clients/{id}` → 200/404/409/422, reemplazo completo con el mismo `ClientData` (un
  `client_id` en el cuerpo → 422; US4-4).
- `DELETE /clients/{id}` → 204/404.
- `GET /clients/{id}` y `GET /clients/{id}/score` no colisionan (rutas distintas).
- Nombre del cliente: `str | None`, como en `Client`.

## R10. Rangos sin CHECK en la base

- **Decisión**: las columnas de métricas son `Integer NOT NULL` sin CHECK de rango.
- **Rationale**: los rangos están definidos solo en `METRIC_RANGES` (Principio VI);
  duplicarlos en el esquema sería una segunda definición. El límite de validación es Pydantic.

## R11. CUIL en el dashboard (FR-035 a FR-039)

- **Decisión**: en `frontend/src/lib/display.ts` (el módulo de "solo presentación"):
  - `formatCuil(value: string | null | undefined): string` → `"—"` si es nulo/ausente;
    `XX-XXXXXXXX-X` si son exactamente 11 dígitos (`/^\d{11}$/`); si no, el valor tal cual.
  - `matchesCuil(cuil, query): boolean` → quita los guiones de la búsqueda; si queda un texto
    no vacío de solo dígitos, compara por inclusión contra el CUIL recibido (11 dígitos). Así
    `20-90000001-5`, `20900000015` y `9000000` coinciden con el mismo cliente.
- `ClientScoreResult.cuil?: string | null` en `api/types.ts` (opcional y anulable, FR-039).
- **Pantallas**:
  - `ClientsTable`: columna "CUIL" después de "Cliente" (la primera columna no cambia, así la
    prueba que lee `cell[0]` sigue igual); el filtro suma `matchesCuil` a la búsqueda por
    nombre e identificador. Texto en `font-mono whitespace-nowrap` para que no se trunque.
  - `ClientCard`: `formatCuil` junto al `client_id`.
  - `ClientDetailSheet`: `formatCuil` en el encabezado, junto al `client_id`.
  - `NewClientPage` / `ScoreResultPanel`: sin cambios; `POST /score` no devuelve identidad, así
    que no hay CUIL que mostrar ni etiqueta vacía (US6-5).
- **Rationale**: un único lugar de formateo (FR-036, Principio VI); el valor recibido no se
  modifica ni se reenvía. Copiar el texto mostrado entrega la forma con guiones (US6-7). La
  búsqueda por dígitos evita que una búsqueda por nombre (`acme`) dispare coincidencias de CUIL.
- **Alternativas**: formatear en la API (FR-029 exige devolver 11 dígitos); máscara de input
  con una biblioteca (no hay entrada de CUIL en esta feature).
- **Pruebas**: `display.test.ts` (11 dígitos, longitud inesperada, nulo, búsqueda con y sin
  guiones, parcial, texto no numérico) y pruebas de pantalla para tabla, tarjetas, detalle y
  ausencia en "Nuevo cliente". Los fixtures usan CUIL sintéticos de R7 y uno sin `cuil`.

## R12. Identificador generado con UUID (clarificación 2026-10-19)

- **Decisión**: `SqlClientRepository.create(data: ClientData)` genera
  `client_id = str(uuid.uuid4())` (texto canónico de 36 caracteres en minúsculas) justo antes
  del INSERT, y lo devuelve en el `ClientRecord`. La generación vive solo ahí; la API y la
  carga inicial no generan ids.
- **Rationale**: pedido explícito (biblioteca nativa `uuid`, antes de persistir); evita un
  contador compartido y las carreras de un correlativo `C-NNN`; no reutiliza ids eliminados.
  Es una entrada que no proviene del exterior, así que no requiere validación de límite.
- **Compatibilidad**: la columna `client_id` sigue siendo `TEXT`; conviven `C-001` … `C-020` y
  UUID. Las rutas `/clients/{client_id}` y el frontend (navegación por `client_id`) funcionan
  igual porque el UUID solo tiene caracteres seguros para URL.
- **Alternativas**: UUID en la capa API (separaría la generación del INSERT que la usa);
  `uuid7` (requiere Python 3.14 o una dependencia; el orden por tiempo no hace falta porque el
  listado usa `position`); id provisto por quien crea (descartado por la clarificación).
