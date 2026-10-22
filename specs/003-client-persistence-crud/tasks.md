
---

description: "Task list for 003-client-persistence-crud"
---

# Tasks: Persistencia y CRUD de Clientes

**Input**: Design documents from `/specs/003-client-persistence-crud/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: se incluyen. La spec los pide (FR-025, FR-039) y la constitución (Principio VII) exige pytest para reglas y validaciones y una suite que pase completa. En cada historia, escribir los tests primero y verificar que fallan.

**Organization**: tareas agrupadas por historia de usuario (US1–US6 de la spec). El módulo del CUIL, los modelos y el esquema de la base son fundacionales porque los usan todas las historias.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (otro archivo, sin dependencias pendientes).
- **[Story]**: historia a la que pertenece (US1–US6).

## Path Conventions

- Backend: `src/health_score/`, tests en `tests/unit/`, `tests/integration/`, `tests/contract/`.
- Frontend: `frontend/src/`, tests junto a cada módulo (`*.test.ts(x)`); comandos `npm` dentro de `frontend/`.

## Reglas transversales

- `scoring.py` no se modifica salvo la copia de `cuil` en `score_client_input` (T012); no lee el CUIL en el cálculo.
- Los rangos de métricas siguen solo en `METRIC_RANGES`; la base no tiene CHECK de rango (research R10).
- La regla del CUIL (normalización, formato, dígito verificador) existe solo en `src/health_score/cuil.py`. El formato de presentación existe solo en `frontend/src/lib/display.ts`.
- El `client_id` de los clientes nuevos se genera solo en `SqlClientRepository.create` con `str(uuid.uuid4())` (research R12).
- Las pruebas existentes de 001 y 002 (`tests/contract/test_http_api.py`, `tests/integration/*`, `frontend/src/**/*.test.ts(x)`) no cambian sus expectativas (FR-021, SC-009).
- Mensajes al usuario en español. Solo datos ficticios: CUIL sintéticos de research R7.
- Comentarios solo para explicar el porqué (Principio I).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencia nueva y archivos de entorno.

- [X] T001 Agregar `"sqlalchemy>=2.0"` a `dependencies` en `pyproject.toml` y reinstalar con `pip install -e ".[dev]"`.
- [X] T002 [P] Agregar `data/*.db` a `.gitignore` (la base `data/health_score.db` se genera en ejecución).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: regla del CUIL, modelos, interfaces del adapter, esquema SQLite y datos de la carga inicial. Nada de esto expone endpoints todavía.

**⚠️ CRITICAL**: ninguna historia puede empezar antes de terminar esta fase.

### Tests fundacionales (escribir primero, deben fallar)

- [X] T003 [P] Crear `tests/unit/test_cuil.py`:
  - `normalize_cuil` acepta `"20900000015"` y `"20-90000001-5"` → `"20900000015"`;
  - rechaza con tipo `cuil_format`: `"2090000001"` (10), `"209000000150"` (12), `"2090000001A"`, `" 20900000015"`, `"20900000015 "`, `"20-9000000-15"`, `"2-09000001-55"`, `""`, `None` y el entero `20900000015`;
  - `check_digit("2090000001") == 5`, `check_digit("2090000002") == 3`, y `check_digit` devuelve `None` para el cuerpo `"2090000004"` (resto 1);
  - para `"2090000001"`, cada dígito final 0–9 distinto de 5 se rechaza con tipo `cuil_check_digit`;
  - un CUIL con cuerpo de resto 1 se rechaza con `cuil_check_digit` sea cual sea el último dígito;
  - un CUIL que empieza con `0` y tiene dígito correcto se acepta y conserva el `0` (texto);
  - mensajes exactos: `"el CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)"` y `"el dígito verificador del CUIL no es válido"`.
- [X] T004 [P] Crear `tests/unit/test_client_models.py`:
  - `ClientData` (frozen, `extra="forbid"`): válido con `cuil`, `name` opcional y `metrics`; rechaza `client_id` (`extra_forbidden`), falta de `cuil` (`missing`) y métricas fuera de rango con los mismos tipos que `ClientMetrics`; informa juntos un CUIL inválido y `usage: 101`;
  - `SeedClient` exige `client_id` no vacío además de los campos de `ClientData`;
  - `ClientRecord` serializa `cuil` como texto de 11 dígitos;
  - `Client` e `InvalidClient` aceptan `cuil` opcional con default `None`; `ClientScoreResult` no tiene `cuil` y `StoredClientScoreResult`/`StoredPortfolioResult` sí (revisión de implementación); `RawClient` sigue rechazando `cuil` (`extra_forbidden`), así `POST /portfolio/score` no cambia su entrada.
- [X] T005 [P] ~~Agregar a `tests/unit/test_scoring.py`~~ **Revisado durante la implementación**: `scoring.py` no cambia (ver T012), así que estos casos se cubren en `tests/unit/test_client_models.py` (`ClientScoreResult` sin `cuil`, `StoredClientScoreResult`/`StoredPortfolioResult` con `cuil`) y en T020 (score idéntico con y sin CUIL).
- [X] T006 [P] Agregar a `tests/unit/test_architecture.py` una prueba que verifique que `src/health_score/cuil.py` no importa ninguno de los módulos de `FORBIDDEN_IN_CORE` (es un módulo puro, como `scoring.py`).
- [X] T007 [P] Agregar a `tests/integration/test_local_repository.py`: con `data/clients.json` (que ahora trae `cuil`), `LocalJsonClientRepository` sigue devolviendo 20 `Client` válidos `C-001` … `C-020`, con `cuil is None` (descarta la clave, research R7).

### Implementación fundacional

- [X] T008 Crear `src/health_score/cuil.py` (sin I/O, research R3):
  - constantes `CUIL_PATTERN = re.compile(r"^\d{11}$|^\d{2}-\d{8}-\d$")` y `WEIGHTS = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)`;
  - `check_digit(first10: str) -> int | None`: `r = sum(int(d) * w for d, w in zip(first10, WEIGHTS)) % 11`; `r == 0 → 0`, `r == 1 → None`, otro → `11 - r`;
  - `normalize_cuil(value: object) -> str`: si no es `str` o no coincide con `CUIL_PATTERN` → `PydanticCustomError("cuil_format", "el CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)")`; quita los guiones; si `check_digit(d[:10])` es `None` o distinto de `int(d[10])` → `PydanticCustomError("cuil_check_digit", "el dígito verificador del CUIL no es válido")`; devuelve los 11 dígitos;
  - `Cuil = Annotated[str, BeforeValidator(normalize_cuil), Field(description="CUIT/CUIL: 11 dígitos, con o sin guiones (XX-XXXXXXXX-X); se devuelve sin guiones", examples=["20900000015"])]`.
  Hace pasar T003 y T006.
- [X] T009 Modificar `src/health_score/models.py` (data-model "Modelos Pydantic"):
  - agregar `cuil: str | None = None` a `Client` y a `InvalidClient` (después de `client_id`);
  - **revisado**: `ClientScoreResult` y `PortfolioResult` no cambian, porque `tests/contract/test_http_api.py` compara su contrato exacto (FR-021). Se crean `StoredClientScoreResult(ClientScoreResult)` con `cuil: str | None = None` y `StoredPortfolioResult(PortfolioResult)` con `results: list[StoredClientScoreResult]`, que usan solo `GET /portfolio` y `GET /clients/{client_id}/score`;
  - crear `ClientData(_Frozen)`: `cuil: Cuil`, `name: ClientName = None`, `metrics: ClientMetrics`, con `json_schema_extra` de ejemplo `{"cuil": "20900000244", "name": "Cliente Ficticio", "metrics": {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}}`;
  - crear `SeedClient(ClientData)` con `client_id: ClientId` adicional;
  - crear `ClientRecord(_Frozen)`: `client_id: ClientId`, `cuil: Annotated[str, Field(description="CUIL, 11 dígitos sin guiones")]`, `name: ClientName = None`, `metrics: ClientMetrics`;
  - no tocar `RawClient`, `ClientMetrics`, `ScoreResult`, `PortfolioResult`.
  Hace pasar T004.
- [X] T010 Modificar `ClientId` en `src/health_score/models.py`: cambiar `examples=["C-001"]` por `examples=["C-001", "3f2b8c1e-9a4d-4e7b-8c21-5d6f0a9b1c2d"]` y la descripción a "Identificador único del cliente: el original en la carga inicial o un UUID generado por el servicio".
- [X] T011 Exportar `ClientData` y `ClientRecord` en `src/health_score/__init__.py` (`__all__` en orden alfabético).
- [X] T012 **Revisado**: `src/health_score/scoring.py` no se modifica. El `cuil` se agrega al resultado en la capa API al construir `StoredClientScoreResult` (T024), a partir del `cuil` del `Client`/`InvalidClient`.
- [X] T013 En `src/health_score/data/local_json.py`, antes de `validate_client_record`, descartar la clave `cuil` de cada registro que sea `dict` (`{k: v for k, v in record.items() if k != "cuil"}`), con un comentario que explique el porqué: el archivo es compartido con la carga inicial y `RawClient` no acepta `cuil`. Hace pasar T007.
- [X] T014 En `src/health_score/data/repository.py` agregar:
  - `class ClientConflictError(Exception)` con atributos `field: Literal["client_id", "cuil"]` y `value: str`, y `message` en español: `f"Ya existe un cliente con el identificador '{value}'"` o `f"El CUIL '{value}' ya está registrado en otro cliente"`;
  - `class ClientStore(ClientRepository, Protocol)` con `list_records() -> list[ClientRecord]`, `get_record(client_id: str) -> ClientRecord | None`, `create(data: ClientData) -> ClientRecord`, `update(client_id: str, data: ClientData) -> ClientRecord | None`, `delete(client_id: str) -> bool`.
  `ClientRepository` no cambia.
- [X] T015 Crear `src/health_score/data/sql.py` con el esquema (data-model "Tablas"):
  - `class Base(DeclarativeBase)`;
  - tabla `clients`: `position` INTEGER PRIMARY KEY autoincremental (orden de inserción), `client_id` TEXT NOT NULL UNIQUE, `cuil` TEXT NOT NULL UNIQUE, `name` TEXT NULL, `usage`/`support_tickets`/`nps`/`days_to_renewal` INTEGER NOT NULL sin CHECK de rango. Nota: SQLite solo autoincrementa un `INTEGER PRIMARY KEY`, por eso `position` es la PK y `client_id` lleva UNIQUE NOT NULL (la unicidad que pide data-model se mantiene);
  - tabla `seed_state`: `id` INTEGER PRIMARY KEY (siempre `1`), `done` BOOLEAN NOT NULL;
  - `make_engine(url: str) -> Engine` con `connect_args={"check_same_thread": False}` y, si `url` es `sqlite://` o `sqlite:///:memory:`, `poolclass=StaticPool` (research R1);
  - `init_schema(engine)` → `Base.metadata.create_all(engine)`.
- [X] T016 Asignar los CUIL sintéticos de research R7 en `data/clients.json`: agregar `"cuil"` después de `"client_id"` en los 20 registros, en orden: C-001 `20900000015`, C-002 `20900000023`, C-003 `20900000031`, C-004 `20900000058`, C-005 `20900000066`, C-006 `20900000074`, C-007 `20900000082`, C-008 `20900000090`, C-009 `20900000104`, C-010 `20900000112`, C-011 `20900000120`, C-012 `20900000139`, C-013 `20900000147`, C-014 `20900000155`, C-015 `20900000163`, C-016 `20900000171`, C-017 `20900000198`, C-018 `20900000201`, C-019 `20900000228`, C-020 `20900000236`. No cambiar ids, nombres ni métricas.
- [X] T017 [P] Crear `tests/unit/test_seed_data.py` (SC-010, FR-033): los 20 `cuil` de `data/clients.json` son distintos, pasan `normalize_cuil` sin cambios y coinciden con la regla `"20" + cuerpo + check_digit`, con cuerpos `90000001`, `90000002`, `90000003`, `90000005`, … (salteando los de resto 1) en el orden del archivo.

**Checkpoint**: `pytest` pasa completo (incluidas las pruebas de 001/002); todavía no hay endpoints nuevos.

---

## Phase 3: User Story 1 - La cartera sale de datos persistidos y mantiene su comportamiento (Priority: P1) 🎯 MVP

**Goal**: el servicio lee la cartera de SQLite, se carga solo la primera vez con los 20 clientes y sobrevive a los reinicios con los mismos scores.

**Independent Test**: con la base vacía, iniciar el servicio y comparar `GET /portfolio` con el resultado del archivo de datos; reiniciar y verificar que no cambia (quickstart §1).

### Tests for User Story 1 ⚠️

- [X] T018 [P] [US1] Crear `tests/unit/test_sql_repository.py` (lectura y carga inicial), con una fixture `store` sobre `make_engine("sqlite://")` + `init_schema`:
  - `seed_clients(engine, Path("data/clients.json"))` inserta 20 clientes; `list_clients()` devuelve 20 `Client` en el orden del archivo, cada uno con su `cuil`; `get_client("C-001").cuil == "20900000015"`; `get_client("c-001") is None` (comparación exacta);
  - ejecutar `seed_clients` 5 veces deja exactamente los mismos 20 registros (SC-004);
  - si un cliente existente fue modificado, `seed_clients` no lo pisa;
  - un archivo con un registro inválido (p. ej. `nps: 11` o CUIL con dígito incorrecto) inserta los válidos y el `SeedReport` lista el omitido con su motivo; un registro con `client_id` o `cuil` ya existente se omite y se reporta;
  - `run_initial_seed(engine, path)` con `seed_state` vacío carga y escribe la marca; tras borrar todos los clientes, volver a llamarlo no repuebla (FR-005);
  - archivo inexistente o JSON que no es una lista con base sin inicializar → lanza excepción y no deja ni clientes ni `seed_state` (transacción sin confirmar).
- [X] T019 [P] [US1] Crear `tests/integration/test_persistence_restart.py`: con `tmp_path / "test.db"` y `monkeypatch` de `HEALTH_SCORE_DB`, `HEALTH_SCORE_CLIENTS=data/clients.json` y `HEALTH_SCORE_CONFIG=config/scoring.json`:
  - `app_from_env()` con base nueva → `GET /portfolio` tiene `summary.total == 20`;
  - crear una segunda app con la misma base → sigue en 20, sin duplicados (SC-003);
  - un `HEALTH_SCORE_CLIENTS` inexistente con base nueva hace fallar `app_from_env()` con una excepción explícita;
  - importar el módulo no tiene efectos sobre la base: con `monkeypatch.chdir(tmp_path)`, `HEALTH_SCORE_DB` apuntando a `tmp_path / "import.db"`, quitar `health_score.api.app` de `sys.modules` y volver a importarlo con `importlib.import_module`; verificar que `import.db` no existe y que el módulo no tiene el atributo `app` (`not hasattr(module, "app")`);
  - almacenamiento dañado al arrancar (caso límite de la spec): escribir bytes que no son SQLite (`b"no es una base"`) en `tmp_path / "corrupta.db"` y apuntar `HEALTH_SCORE_DB` ahí → `app_from_env()` lanza `StorageError` con un mensaje en español que incluye la ruta; no arranca con datos parciales;
  - almacenamiento no disponible en ejecución: con una app ya creada sobre una base en `tmp_path`, ejecutar `DROP TABLE clients` con el engine y llamar a `GET /portfolio` y `GET /clients` → 503 `{"detail": "La cartera no está disponible en este momento"}`, sin resultados parciales.
- [X] T020 [P] [US1] Crear `tests/integration/test_contract_compat.py` (FR-019/020, SC-001): una app con `LocalJsonClientRepository("data/clients.json")` y otra con `SqlClientRepository` cargado con el mismo archivo devuelven en `GET /portfolio` los mismos `summary` y, por cliente, los mismos `client_id`, `name`, `metrics`, `result` y `errors`; la de SQL además trae `cuil` de 11 dígitos en cada resultado y en `GET /clients/C-001/score` (`"20900000015"`). `POST /portfolio/score` con la cartera de ejemplo devuelve exactamente los campos previos, sin la clave `cuil`; un cliente con `cuil` en ese cuerpo → 422 `campo no permitido`. `POST /score` devuelve exactamente las claves `score`, `level`, `sub_scores`.

### Implementation for User Story 1

- [X] T021 [US1] En `src/health_score/data/sql.py` implementar `SqlClientRepository(engine)` (lectura): `list_clients()` ordena por `position` y devuelve `Client(client_id, cuil, name, metrics=ClientMetrics(...))`; `get_client(client_id)` busca por igualdad exacta; `list_records()` / `get_record()` devuelven `ClientRecord`. Una sesión por llamada con `Session(engine)`. Hace pasar la parte de lectura de T018.
- [X] T022 [US1] Crear `src/health_score/data/seed.py` (research R6):
  - `@dataclass SeedReport` con `inserted: list[str]` y `skipped: list[tuple[str, str]]` (id o posición, motivo en español);
  - `load_seed_records(path) -> list` que lee el JSON y lanza `ValueError(f"{path} debe contener una lista de clientes")` si no es una lista (archivo inexistente → `FileNotFoundError` sin capturar);
  - `seed_clients(engine, path) -> SeedReport`: valida cada registro con `SeedClient.model_validate` (los inválidos van a `skipped` con los mensajes de error), inserta los válidos en una transacción con `sqlite_insert(...).on_conflict_do_nothing()` y registra como omitidos los que no insertaron ("ya existe el identificador o el CUIL"); no modifica existentes;
  - `run_initial_seed(engine, path) -> SeedReport | None`: en una sola transacción, si existe la fila `seed_state(id=1)` devuelve `None`; si no, carga los registros (las excepciones de archivo se propagan y la transacción no confirma), inserta como `seed_clients` y escribe `seed_state(id=1, done=True)`.
  Hace pasar T018.
- [X] T023 [US1] Exportar `SqlClientRepository`, `ClientStore`, `ClientConflictError`, `make_engine`, `init_schema`, `seed_clients`, `run_initial_seed` y `SeedReport` en `src/health_score/data/__init__.py`.
- [X] T024 [US1] Modificar `app_from_env()` en `src/health_score/api/app.py` (research R8): agregar `DB_ENV = "HEALTH_SCORE_DB"` y `DEFAULT_DB_PATH = "data/health_score.db"`; cargar config; `engine = make_engine(f"sqlite:///{path}")`; `init_schema(engine)`; `report = run_initial_seed(engine, clients_path)` y, si no es `None`, registrar con `logging.getLogger(__name__)` los insertados y omitidos; armar `create_app(config, SqlClientRepository(engine))`. `create_app` conserva su firma. **Eliminar la línea `app = app_from_env()` del final del módulo**: importar `health_score.api.app` no debe abrir la base ni ejecutar la carga inicial (si no, cada `pytest` escribiría `data/health_score.db`, porque `tests/conftest.py` importa el módulo). El servicio se levanta como factory: `uvicorn health_score.api.app:app_from_env --factory --reload` (ya documentado en `README.md` y en los quickstart de 002 y 003). Errores de almacenamiento (caso límite "almacenamiento no disponible o dañado"):
  - en `src/health_score/data/sql.py` definir `class StorageError(Exception)` y exportarla en `src/health_score/data/__init__.py`; en `app_from_env`, envolver `init_schema` y `run_initial_seed` para que un `sqlalchemy.exc.DatabaseError` se relance como `StorageError(f"No se pudo abrir la base de datos '{path}': {exc}")` (el servicio no arranca);
  - en `create_app`, registrar `@app.exception_handler(SQLAlchemyError)` → `JSONResponse(503, {"detail": "La cartera no está disponible en este momento"})` y registrar la excepción con `logging`; los 409 siguen saliendo por `ClientConflictError`, porque el repositorio traduce `IntegrityError` antes de que llegue al handler;
  - declarar `503` en `responses` de `GET /portfolio` y `GET /clients/{client_id}/score` (Principio VIII); los endpoints de `/clients` lo declaran al crearse (T029, T035, T040).
  Hace pasar T019 y T020.
- [X] T025 [US1] Actualizar `README.md`: en la tabla de variables de entorno agregar `HEALTH_SCORE_DB` (`data/health_score.db`, archivo SQLite de la cartera) y cambiar la descripción de `HEALTH_SCORE_CLIENTS` a "Archivo de la carga inicial (se usa solo cuando la base nunca fue inicializada)"; explicar que para volver a cargar desde cero hay que borrar `data/health_score.db`; ajustar la nota de prueba de 1000 clientes para que use una base nueva con `HEALTH_SCORE_DB` y `HEALTH_SCORE_CLIENTS` apuntando al archivo generado.

**Checkpoint**: el dashboard de la spec 002 funciona sin cambios contra el servicio persistido; `pytest` pasa completo.

---

## Phase 4: User Story 2 - Crear y consultar clientes (Priority: P1)

**Goal**: `POST /clients` (con UUID generado), `GET /clients` y `GET /clients/{client_id}`, y el cliente creado aparece en la cartera.

**Independent Test**: quickstart §2.

### Tests for User Story 2 ⚠️

- [X] T026 [P] [US2] Agregar a `tests/unit/test_sql_repository.py`:
  - `create(ClientData(...))` devuelve un `ClientRecord` cuyo `client_id` cumple `uuid.UUID(client_id).version == 4` y `str(uuid.UUID(client_id)) == client_id` (36 caracteres, minúsculas); dos `create` dan ids distintos;
  - el cliente creado aparece al final de `list_clients()` con su `cuil`;
  - `create` con un `cuil` ya existente lanza `ClientConflictError(field="cuil")` y no inserta nada;
  - con `monkeypatch` de `uuid.uuid4` en `health_score.data.sql` devolviendo el UUID de un cliente ya creado, `create` lanza `ClientConflictError(field="client_id")` (US2-6);
  - si colisionan `client_id` y `cuil` a la vez, se informa `client_id`.
- [X] T027 [P] [US2] Crear `tests/integration/test_clients_api.py` con una fixture `api` (`TestClient(create_app(default_config, store))` sobre una base en memoria con `seed_clients` del archivo) y casos de alta y consulta:
  - `POST /clients` con el `ClientData` del contrato → 201, cuerpo `ClientRecord` con `client_id` UUID v4, `cuil == "20900000244"`, cabecera `Location == f"/clients/{client_id}"`;
  - `GET /clients/{id}` → 200 con los mismos datos; `GET /clients` → 21 registros en orden de alta con `client_id`, `cuil`, `name` y `metrics`; `GET /portfolio` incluye el cliente con `cuil` y el mismo `result` que `POST /score` con sus métricas; `GET /clients/{id}/score` trae `cuil`;
  - mismo `POST` repetido → 409 `{"detail": "El CUIL '20900000244' ya está registrado en otro cliente"}` y `GET /clients` sigue con 21;
  - `POST` con `"cuil": "20-90000001-5"` → 409 (es C-001);
  - `POST` con `"client_id": "C-999"` en el cuerpo → 422 con `loc == ["body", "client_id"]` y `msg == "campo no permitido"`;
  - `POST` sin `cuil` → 422 `campo obligatorio` en `["body", "cuil"]`;
  - `GET /clients/NO-EXISTE` → 404 `{"detail": "Cliente 'NO-EXISTE' no encontrado"}`.

### Implementation for User Story 2

- [X] T028 [US2] En `src/health_score/data/sql.py` implementar `SqlClientRepository.create(data: ClientData) -> ClientRecord` (research R4, R12): `client_id = str(uuid.uuid4())` justo antes del INSERT; INSERT dentro de `with Session(engine) as s, s.begin():`; ante `IntegrityError`, rollback y consultar si existe ese `client_id` (→ `ClientConflictError("client_id", client_id)`) o si existe ese `cuil` (→ `ClientConflictError("cuil", data.cuil)`), en ese orden. Sin verificación previa al INSERT. Hace pasar T026.
- [X] T029 [US2] En `src/health_score/api/app.py`:
  - `get_store(request) -> ClientStore` que lanza `HTTPException(501, "La fuente de datos configurada no admite escritura")` si `request.app.state.repository` no tiene los métodos de `ClientStore` (`isinstance` con `@runtime_checkable` en el Protocol, o `hasattr(repo, "create")`); `StoreDep = Annotated[ClientStore, Depends(get_store)]`;
  - handler `@app.exception_handler(ClientConflictError)` → `JSONResponse(409, {"detail": exc.message})`;
  - `POST /clients` (`status_code=201`, `response_model=ClientRecord`, tag `clientes`, summary "Crear un cliente", descripción que aclare que el `client_id` lo genera el servicio (UUID) y no se envía; `responses={409: ..., 422: ..., 503: ...}`) que llama `store.create(data)` y agrega `response.headers["Location"] = f"/clients/{record.client_id}"`;
  - `GET /clients` (`response_model=list[ClientRecord]`, orden de alta);
  - `GET /clients/{client_id}` (`response_model=ClientRecord`, `responses={404: ...}`, mismo mensaje 404 que `GET /clients/{client_id}/score`).
  Hace pasar T027.

**Checkpoint**: alta y consulta funcionan desde `/docs`; las pruebas de US1 siguen pasando.

---

## Phase 5: User Story 3 - Validación estricta de los datos de entrada (Priority: P1)

**Goal**: alta y edición rechazan cualquier dato inválido con mensajes por campo en español, sin guardar nada.

**Independent Test**: quickstart §3.

### Tests for User Story 3 ⚠️

- [X] T030 [US3] Agregar a `tests/integration/test_clients_api.py` pruebas parametrizadas de `POST /clients` (cada una verifica además que `GET /clients` no cambió de tamaño):
  - métricas: `usage` −1 y 101, `nps` −1 y 11, `support_tickets` −1, `days_to_renewal` −1 → 422 con `loc == ["body", "metrics", <campo>]` y `msg == range_message(<métrica>)`; decimal (`2.5`), texto (`"60"`), booleano (`true`) y `null` en cada métrica → 422 en ese campo; métrica faltante → `campo obligatorio`; campo extra en `metrics` o en la raíz → `campo no permitido`;
  - límites válidos: `usage` 0 y 100, `nps` 0 y 10, `support_tickets` 0, `days_to_renewal` 0 → 201 (cada uno con un CUIL sintético libre distinto);
  - CUIL: `"20900000015"`-equivalente libre sin guiones y con guiones → 201 guardado sin guiones; formatos inválidos de T003 → 422 `["body", "cuil"]` con el mensaje de formato; `"20900000016"` → 422 con el mensaje de dígito verificador;
  - varios inválidos a la vez (`usage: 101` + CUIL `"20900000016"`) → un 422 con ambos `loc`;
  - CUIL con dígito inválido que además coincide en los 10 primeros dígitos con uno existente → 422, no 409 (FR-032);
  - cuerpo que no es JSON válido → 422 con el formato `{"detail": [...]}`.

### Implementation for User Story 3

- [X] T031 [US3] Extender `validation_message` en `src/health_score/models.py` para que también devuelva `range_message(Metric(loc[2]))` cuando `len(loc) == 3`, `loc[0] == "body"`, `loc[1] == "metrics"` y `loc[2]` es una métrica. Hoy solo traduce `loc` de 2 niveles (`POST /score`), así que los errores de métricas de `POST/PUT /clients` saldrían en inglés. Los mensajes de estructura (`missing`, `extra_forbidden`) siguen teniendo prioridad; los de `PydanticCustomError` (`cuil_format`, `cuil_check_digit`) pasan sin cambios porque no coinciden con ninguna regla. No cambia el resultado para `loc` de 2 niveles. Agregar a `tests/unit/test_metrics_validation.py` un caso por métrica con `loc` de 3 niveles. Hace pasar T030.

**Checkpoint**: SC-005 y SC-011 (parte 422) verificados por pruebas.

---

## Phase 6: User Story 4 - Actualizar clientes existentes (Priority: P2)

**Goal**: `PUT /clients/{client_id}` reemplaza CUIL, nombre y métricas; el identificador no cambia.

**Independent Test**: quickstart §4, pasos 1–2.

### Tests for User Story 4 ⚠️

- [X] T032 [P] [US4] Agregar a `tests/unit/test_sql_repository.py`: `update("C-002", ClientData(...))` reemplaza `cuil`, `name` y `metrics` y conserva `client_id` y `position`; con el propio CUIL no hay conflicto; con el CUIL de C-001 lanza `ClientConflictError(field="cuil")` y C-002 conserva sus datos; `update("C-999", ...)` devuelve `None` sin crear nada.
- [X] T033 [P] [US4] Agregar a `tests/integration/test_clients_api.py`: `PUT /clients/C-002` válido → 200 y `GET /clients/C-002`, `GET /portfolio` y `GET /clients/C-002/score` reflejan los nuevos valores (score recalculado, `cuil` nuevo); con su propio CUIL → 200; con el CUIL de C-001 (con y sin guiones) → 409 y C-002 sin cambios; con CUIL de formato o dígito inválido → 422 y sin cambios; con métricas inválidas → 422 y sin cambios; con `client_id` en el cuerpo → 422 `campo no permitido`; `PUT /clients/C-999` → 404.

### Implementation for User Story 4

- [X] T034 [US4] Implementar `SqlClientRepository.update(client_id, data)` en `src/health_score/data/sql.py`: UPDATE de `cuil`, `name` y métricas por `client_id` en una transacción; si no afectó filas → `None`; ante `IntegrityError` → rollback y `ClientConflictError("cuil", data.cuil)`. Hace pasar T032.
- [X] T035 [US4] Agregar `PUT /clients/{client_id}` en `src/health_score/api/app.py` (`response_model=ClientRecord`, tag `clientes`, summary "Actualizar un cliente", descripción "Reemplaza CUIL, nombre y métricas; el identificador no cambia", `responses={404, 409, 422, 503}`); `None` → 404 con el mensaje estándar. Hace pasar T033.

---

## Phase 7: User Story 5 - Eliminar clientes (Priority: P2)

**Goal**: `DELETE /clients/{client_id}` quita el cliente del listado, la cartera y el score.

**Independent Test**: quickstart §4, pasos 3–4.

### Tests for User Story 5 ⚠️

- [X] T036 [P] [US5] Agregar a `tests/unit/test_sql_repository.py`: `delete("C-001")` devuelve `True` y el cliente ya no está en `list_clients()`/`get_record()`; `delete("C-999")` devuelve `False`; tras borrar C-001, `create` con `cuil="20900000015"` funciona y recibe un UUID nuevo.
- [X] T037 [P] [US5] Agregar a `tests/integration/test_clients_api.py`: `DELETE /clients/C-001` → 204 sin cuerpo; luego `GET /clients/C-001` y `GET /clients/C-001/score` → 404; `GET /portfolio` tiene `summary.total == 19` y `sum(by_level) + invalid == total`; `POST /clients` con el CUIL `20900000015` → 201 con otro `client_id`; `DELETE /clients/C-999` → 404.
- [X] T038 [P] [US5] Agregar a `tests/integration/test_persistence_restart.py`: borrar los 20 clientes por API, crear una nueva app con la misma base → `GET /portfolio` devuelve `total == 0` y lista vacía (la carga inicial no repuebla).

### Implementation for User Story 5

- [X] T039 [US5] Implementar `SqlClientRepository.delete(client_id) -> bool` en `src/health_score/data/sql.py` (DELETE en una transacción; `rowcount > 0`). Hace pasar T036.
- [X] T040 [US5] Agregar `DELETE /clients/{client_id}` en `src/health_score/api/app.py` (`status_code=204`, `response_class=Response`, tag `clientes`, summary "Eliminar un cliente", `responses={404, 503}`); `False` → 404 con el mensaje estándar. Hace pasar T037 y T038.

---

## Phase 8: User Story 6 - Ver el CUIL de cada cliente en el dashboard (Priority: P2)

**Goal**: el dashboard muestra el CUIL con guiones en la tabla, las tarjetas y el detalle, y permite buscar por CUIL ([contracts/ui-cuil.md](contracts/ui-cuil.md)).

**Independent Test**: quickstart §5 y `npm test`.

**Depende de**: US1 (la cartera devuelve `cuil`). Las tareas de frontend pueden empezar en paralelo con US2–US5 usando fixtures.

### Tests for User Story 6 ⚠️

- [X] T041 [US6] En `frontend/src/test/fixtures.ts` agregar `cuil` sintético a los resultados de `portfolioFixture`: C-001 `"20900000015"`, C-002 `"20900000023"`, C-003 `"20900000031"`, C-004 `"20900000058"`; dejar C-005 **sin** la clave `cuil` para cubrir la compatibilidad hacia atrás. Si hay un fixture de detalle de cliente, agregarle `cuil: "20900000015"`. No cambiar los demás campos.
- [X] T042 [P] [US6] Agregar a `frontend/src/lib/display.test.ts`:
  - `formatCuil("20900000015") === "20-90000001-5"`; `formatCuil("123") === "123"`; `formatCuil("2090000001A") === "2090000001A"`; `formatCuil(null) === "—"`; `formatCuil(undefined) === "—"`;
  - `matchesCuil("20900000015", q)` es `true` para `"20900000015"`, `"20-90000001-5"`, `"90000001"`, `" 9000000 "` (con espacios alrededor) y `false` para `"20900000023"`, `"acme"`, `""`, `"-"`; `matchesCuil(null, "209") === false`.
- [X] T043 [P] [US6] Agregar a `frontend/src/pages/portfolio/PortfolioPage.test.tsx`: la tabla tiene un encabezado de columna "CUIL"; la fila de C-001 muestra `20-90000001-5` y la de C-005 muestra `—`; escribir `20900000015`, `20-90000001-5` y `90000001` en el buscador deja solo la fila de C-001; escribir `acme` sigue filtrando por nombre. La prueba existente que lee `cell[0]` no se modifica.
- [X] T044 [P] [US6] Agregar a `frontend/src/pages/categories/CategoriesPage.test.tsx`: la tarjeta de C-001 muestra `20-90000001-5` junto a `C-001`; la de C-005 muestra `—`.
- [X] T045 [P] [US6] Agregar a `frontend/src/pages/client-detail/ClientDetailSheet.test.tsx`: el encabezado del detalle de C-001 muestra `20-90000001-5` junto a `C-001`; con una respuesta sin `cuil`, muestra `—` y el resto del panel se renderiza.
- [X] T046 [P] [US6] Agregar a `frontend/src/pages/new-client/NewClientPage.test.tsx`: tras calcular un score, el panel de resultado no contiene el texto "CUIL" ni un valor con formato `XX-XXXXXXXX-X`.

### Implementation for User Story 6

- [X] T047 [US6] En `frontend/src/api/types.ts` agregar `cuil?: string | null` a `ClientScoreResult`, después de `client_id`.
- [X] T048 [US6] En `frontend/src/lib/display.ts` agregar (único lugar del frontend, research R11):
  - `formatCuil(value: string | null | undefined): string` → `"—"` si es `null`/`undefined`; si `/^\d{11}$/.test(value)` → `` `${value.slice(0, 2)}-${value.slice(2, 10)}-${value.slice(10)}` ``; si no, `value` tal cual;
  - `matchesCuil(cuil: string | null | undefined, query: string): boolean` → `digits = query.trim().replace(/-/g, "")`; `false` si `!cuil` o si `digits` no coincide con `/^\d+$/`; si no, `cuil.includes(digits)`.
  Comentario breve del porqué: solo presentación, el dato recibido no se altera ni se envía. Hace pasar T042.
- [X] T049 [US6] En `frontend/src/pages/portfolio/ClientsTable.tsx`:
  - agregar `<TableHead>CUIL</TableHead>` después de "Cliente" y una `<TableCell className="font-mono text-sm whitespace-nowrap">{formatCuil(entry.cuil)}</TableCell>` después de la celda de cliente;
  - en el filtro, la condición de texto pasa a ser `` `${entry.client_id ?? ""} ${entry.name ?? ""}`.toLowerCase().includes(needle) || matchesCuil(entry.cuil, query) ``;
  - **no** cambiar el `placeholder="Buscar cliente"` ni el texto `sr-only` "Buscar cliente": la prueba existente de `PortfolioPage.test.tsx` busca el campo con `getByPlaceholderText("Buscar cliente")` y no debe modificarse (FR-021, SC-009). Para indicar que también se busca por CUIL, agregar al `<Input>` el atributo `title="Buscar por nombre, ID o CUIL"`.
  Hace pasar T043 sin romper las pruebas existentes.
- [X] T050 [P] [US6] En `frontend/src/pages/categories/ClientCard.tsx`, debajo del nombre, mostrar `{entry.client_id}` y `formatCuil(entry.cuil)` en la misma línea de texto secundario (separados por ` · `, CUIL en `font-mono`). Hace pasar T044.
- [X] T051 [P] [US6] En `frontend/src/pages/client-detail/ClientDetailSheet.tsx`, en el `<p>` del encabezado mostrar `{client.client_id}` y `formatCuil(client.cuil)` (separados por ` · `, CUIL en `font-mono`). Hace pasar T045.
- [X] T052 [US6] Verificar que `frontend/src/pages/new-client/ScoreResultPanel.tsx` no necesita cambios (usa `ScoreResult`, sin identidad) y que T046 pasa; ejecutar `npm test` y `npm run build` en `frontend/` sin errores de tipos.

**Checkpoint**: SC-012 verificado; las pruebas existentes del frontend pasan sin cambiar sus expectativas.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T053 [P] Agregar a `tests/contract/test_http_api.py` (sin modificar las pruebas existentes) una prueba de OpenAPI: existen `POST`/`GET` `/clients`, `GET`/`PUT`/`DELETE` `/clients/{client_id}`; `POST /clients` declara 201, 409 y 422; `PUT` declara 200, 404, 409 y 422; `DELETE` declara 204 y 404; el esquema `ClientData` no tiene la propiedad `client_id`; `ClientScoreResult` tiene la propiedad `cuil` (FR-024). Si la app de la fixture `client` usa `InMemoryClientRepository`, construir la app con un `SqlClientRepository` en memoria para esta prueba.
- [X] T054 [P] Agregar a `tests/integration/test_persistence_restart.py` una prueba de rendimiento (SC-008): base en `tmp_path` con 1000 clientes creados con `SeedClient` y CUIL sintéticos válidos generados con `check_digit` (cuerpos `9000xxxx` con resto distinto de 1); `GET /portfolio` responde en menos de 2 s (medido con `time.perf_counter`).
- [X] T055 [P] Actualizar `README.md` sección API: agregar `POST /clients`, `GET /clients`, `GET /clients/{client_id}`, `PUT /clients/{client_id}` y `DELETE /clients/{client_id}`; aclarar que el `client_id` de los clientes nuevos es un UUID generado por el servicio, que `cuil` se acepta con o sin guiones y se devuelve sin guiones, y que `GET /portfolio` y `GET /clients/{id}/score` incluyen `cuil`.
- [X] T056 Ejecutar `pytest` completo y `npm test` en `frontend/`; todo en verde sin haber cambiado expectativas previas de 001/002 (SC-009).
- [X] T057 Recorrer [quickstart.md](quickstart.md) §1–§7 de punta a punta con una base nueva y marcar cualquier diferencia como tarea pendiente.

---

## Phase 10: User Story 7 - Levantar el sistema en contenedores endurecidos (Priority: P3)

**Goal**: API y dashboard en contenedores que cumplen la sección *Contenedores y despliegue* de la constitución v2.2.0 (FR-040 a FR-046).

**Independent Test**: `docker compose up -d --build` con un volumen nuevo; el dashboard en `http://127.0.0.1:8080` muestra los 20 clientes; un cliente creado por `/api/clients` sobrevive a `docker compose down && docker compose up -d`; `docker inspect` muestra UID 10001, `CapDrop: [ALL]`, `ReadonlyRootfs: true`.

- [X] T058 [P] [US7] Crear `Dockerfile` con targets `api` (venv en builder, `uvicorn ... --factory` en el puerto 8000, `HEALTH_SCORE_DB=/var/lib/health-score/health_score.db`, healthcheck sobre `GET /metrics`) y `web` (build de Vite con `npm ci --ignore-scripts`, nginx sin privilegios en el puerto 8080). Bases fijadas por tag y digest; UID/GID 10001; código, semilla y estáticos de root; sin bits setuid. (FR-040, FR-041, FR-042, FR-045)
- [X] T059 [P] [US7] Crear `frontend/nginx.conf`: `pid` y temporales en `/tmp`, `server_tokens off`, cabeceras de seguridad y CSP, `/healthz`, `location /api/` → `http://api:8000/` (mismo contrato que el proxy de Vite). (FR-040)
- [X] T060 [P] [US7] Crear `.dockerignore` (fuera `.git`, specs, `.env*`, claves, `secrets/`, `data/*.db`, `node_modules`, tests; se permite `frontend/.npmrc`, que no tiene credenciales). (FR-044)
- [X] T061 [US7] Crear `compose.yaml`: servicios `api` y `web` con `user: "10001:10001"`, `read_only`, `tmpfs`, `cap_drop: [ALL]`, `no-new-privileges`, límites de memoria/CPU/PIDs/nofile, `restart: on-failure:5`, logs con rotación; volumen `dbdata` como única ruta escribible de la API; `config/scoring.json` montado `:ro`; red `backend` interna; solo `web` publicado en `127.0.0.1:8080`; `web` depende de `api` sano. (FR-041, FR-042, FR-043, FR-045)
- [X] T062 [P] [US7] Crear `.hadolint.yaml` y ejecutar `.claude/skills/owasp-docker-secure/scripts/audit.sh`: sin señales de alarma, controles requeridos presentes, `docker compose config` válido.
- [X] T063 [P] [US7] Crear `SECURITY-DOCKER.md` (control → regla OWASP, excepciones, tareas del host) y agregar la sección "Levantar con Docker" al `README.md`. (FR-046)
- [ ] T064 [US7] Generar un lockfile de Python con hashes (`pip-compile --generate-hashes`) e instalar con `pip install --require-hashes`, para cerrar la excepción documentada en `SECURITY-DOCKER.md`.
- [ ] T065 [US7] Con el daemon de Docker activo: `docker compose up -d --build` con un volumen nuevo y recorrer los escenarios 1–6 de US7 (carga inicial, `/api` vía nginx, persistencia tras recrear, API sin puerto publicado, `docker inspect` del endurecimiento, cambio de `config/scoring.json` con reinicio).
- [ ] T066 [US7] Ejecutar `hadolint` y `trivy image` sobre `health-score-api` y `health-score-web`; corregir o justificar en `SECURITY-DOCKER.md` toda vulnerabilidad HIGH/CRITICAL (SC-013, constitución *Puertas de calidad*).

**Checkpoint**: SC-013 verificado.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → historias.
- **US1 (Phase 3)**: depende de Phase 2. Es el MVP.
- **US2 (Phase 4)**: depende de US1 (necesita `SqlClientRepository`, la carga inicial y `app_from_env`).
- **US3 (Phase 5)**: depende de US2 (prueba los endpoints de alta).
- **US4 (Phase 6)** y **US5 (Phase 7)**: dependen de US2; son independientes entre sí, salvo que tocan los mismos archivos (`sql.py`, `app.py`, `test_clients_api.py`).
- **US6 (Phase 8)**: necesita que la cartera devuelva `cuil` (US1) para la demostración real; sus tareas de frontend solo dependen de los fixtures y pueden hacerse en paralelo con US2–US5.
- **Polish (Phase 9)**: al final.
- **US7 (Phase 10)**: depende de US1–US6 implementadas; T058–T060 y T062–T063 en paralelo, T061 tras T058/T059; T065 y T066 requieren el daemon de Docker.

### Within Each User Story

- Tests primero (deben fallar) → repositorio → endpoints → documentación.
- Tareas sobre el mismo archivo van en orden (`sql.py`: T015 → T021 → T028 → T034 → T039; `app.py`: T024 → T029 → T031 → T035 → T040).

### Parallel Opportunities

- Phase 2: T003, T004, T005, T006, T007 en paralelo; luego T008 y T009 (distintos archivos) en paralelo; T017 en paralelo con T014/T015.
- US1: T018, T019, T020 en paralelo.
- US4 y US5: sus tests de unidad (T032, T036) y de integración (T033, T037) se pueden escribir en paralelo si se coordinan los bloques del mismo archivo.
- US6: T042–T046 en paralelo; T050 y T051 en paralelo; todo US6 en paralelo con el backend de US2–US5.

## Parallel Example: User Story 6

```text
Task: "T042 [US6] formatCuil y matchesCuil en frontend/src/lib/display.test.ts"
Task: "T043 [US6] columna y búsqueda en frontend/src/pages/portfolio/PortfolioPage.test.tsx"
Task: "T044 [US6] tarjetas en frontend/src/pages/categories/CategoriesPage.test.tsx"
Task: "T045 [US6] detalle en frontend/src/pages/client-detail/ClientDetailSheet.test.tsx"
Task: "T046 [US6] sin CUIL en frontend/src/pages/new-client/NewClientPage.test.tsx"
```

## Parallel Example: User Story 1

```text
Task: "T018 [US1] repositorio y carga inicial en tests/unit/test_sql_repository.py"
Task: "T019 [US1] reinicios en tests/integration/test_persistence_restart.py"
Task: "T020 [US1] compatibilidad en tests/integration/test_contract_compat.py"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2.
2. Phase 3 (US1): cartera persistida, carga inicial idempotente, `cuil` en las respuestas.
3. **STOP and VALIDATE**: quickstart §1; el dashboard de la spec 002 funciona igual.

### Incremental Delivery

1. US1 → cartera persistida (MVP).
2. US2 + US3 → alta con UUID y validación estricta (completa el bloque P1).
3. US4 → edición; US5 → eliminación.
4. US6 → CUIL visible y buscable en el dashboard (puede adelantarse en paralelo).
5. Polish → OpenAPI, rendimiento, README, suite completa.
6. US7 → contenedores endurecidos (OWASP).

## Notes

- [P] = otro archivo, sin dependencias pendientes.
- Verificar que cada test falle antes de implementar.
- Hacer commit al cerrar cada fase o grupo lógico.
- No usar CUIL reales en ningún archivo (Principio IX): solo los sintéticos de research R7 o los generados con la misma regla.
