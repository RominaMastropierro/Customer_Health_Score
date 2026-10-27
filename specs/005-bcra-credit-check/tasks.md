---

description: "Lista de tareas de la spec 005: consulta de situación crediticia en el BCRA al dar de alta un cliente"
---

# Tasks: Consulta de Situación Crediticia en el BCRA al Dar de Alta un Cliente

**Input**: documentos de diseño en `specs/005-bcra-credit-check/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/http-api-changes.md](contracts/http-api-changes.md), [contracts/ui-credit-check.md](contracts/ui-credit-check.md), [contracts/bcra-summary-prompt.md](contracts/bcra-summary-prompt.md), [quickstart.md](quickstart.md)

**Tests**: la spec los pide (FR-026, FR-027). En cada historia se escriben primero y deben fallar antes de implementar. **Ninguna prueba sale a la red**: el BCRA y el modelo siempre se simulan.

**Organization**: tareas agrupadas por historia de usuario. Backend en `src/health_score/` y `tests/`; frontend en `frontend/src/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: otro archivo, sin dependencias pendientes.
- **[Story]**: historia de la spec (US1 … US4).

## Convenciones para todas las tareas

- **Textos de UI**: en español neutro con tuteo, como el resto del dashboard ("Inténtalo de nuevo"). Los textos fijos son exactamente los de [data-model.md §4](data-model.md); el indicador dice "Consultando situación en el BCRA…".
- **Datos de prueba solo sintéticos o ficticios** (constitución, Principio IX):
  - CUIT válido: `20900000244` / `20-90000024-4`.
  - Otro CUIT válido: `20900000015` / `20-90000001-5`.
  - Dígito verificador inválido: `20900000245`.
  - Denominaciones y entidades ficticias ("EMPRESA FICTICIA S.A.", "BANCO FICTICIO DEL SUR").
- **Privacidad** (FR-024): nunca hacer `logger.*` con el CUIT, la denominación, montos, el JSON del BCRA, el prompt ni el texto del modelo. Los logs de error registran solo el tipo de falla (p. ej. `"BCRA no disponible: HTTPError 503"`).
- **Estilos**: utilidades de Tailwind y componentes de `@/components/ui`; los colores de tono salen de `TONE_CLASSES` (`@/lib/display`). Sin dependencias npm nuevas.
- **Comentarios**: solo para explicar el porqué (constitución, Principio I).
- **Peticiones en pruebas de frontend**: usar `stubFetch` de `frontend/src/test/fixtures.ts`; la clave de la ruta es `"POST /api/credit-status"`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencia nueva, datos de prueba compartidos y el prompt versionado.

- [X] T001 En `pyproject.toml` agregar `"anthropic>=1.0"` a `dependencies` (justificación en plan.md) y reinstalar con `pip install -e ".[dev]"`. Verificar con `python -c "import anthropic; print(anthropic.__version__)"`.
- [X] T002 [P] En `.gitignore` agregar una sección `# Secretos locales para Docker (spec 005)` con `secrets/`.
- [X] T003 [P] Crear `tests/fixtures/cuil_cases.json`. Es la fuente única de casos para el backend y el frontend (research R11). Formato: `{"valid": [{"input": str, "digits": str}], "format_error": [str], "check_digit_error": [str]}`.
  - `valid`: `"20900000244"`, `"20-90000024-4"`, `"20900000015"`, `"20-90000001-5"`, y un CUIT cuyo resto da 0 (dígito verificador `0`), calculado con `check_digit` de `src/health_score/cuil.py`.
  - `format_error`: `"2090000001"`, `"209000000150"`, `"2090000001A"`, `" 20900000015"`, `"20900000015 "`, `"20 90000024 4"`, `"20.90000024.4"`, `"20-9000002-4"`, `"20-900000244"`, `"2090-000024-4"`, `""`. El `""` es error de formato para `validateCuit` y `normalize_cuil`; la página no lo valida al perder el foco (FR-004, T024), así que no muestra error.
  - `check_digit_error`: `"20900000245"`, `"20900000016"`, y un número de 10 dígitos cuyo resto da 1, con cualquier dígito final (no existe dígito válido), calculado con `check_digit`.
- [X] T004 [P] Crear `tests/fixtures/bcra/` con respuestas **ficticias** del método "Deudas", con la forma exacta del manual (`central-deudores-v1.md`): `{"status": 200, "results": {"identificacion": 20900000244, "denominacion": "EMPRESA FICTICIA S.A.", "periodos": [...]}}`. Cada entidad lleva todos los campos del manual (`entidad`, `situacion`, `fechaSit1`, `monto`, `diasAtrasoPago`, `refinanciaciones`, `recategorizacionOblig`, `situacionJuridica`, `irrecDisposicionTecnica`, `enRevision`, `procesoJud`). Salvo `varios-periodos.json`, todos tienen un único período `"202407"`. Archivos:
  - `situacion-1.json`: 1 entidad, situación 1, monto 59.0, 0 días.
  - `situacion-2.json`: 3 entidades, montos 120.5 + 1000.0 + 129.5. La situación 2, con 45 días de atraso, la informa `"BANCO FICTICIO DEL SUR"`; las otras dos están en situación 1 con 0 días.
  - `situacion-3.json`: 2 entidades, peor 3, 95 días.
  - `situacion-4.json`: peor 4, con `refinanciaciones: true`.
  - `situacion-5.json`: peor 5, con `situacionJuridica`, `irrecDisposicionTecnica`, `enRevision` y `procesoJud` en `true` en alguna entidad, y `recategorizacionOblig: true` en otra.
  - `varios-periodos.json`: `"202406"` con situación 3 y `procesoJud: true`, y `"202407"` con situación 1 (debe usarse 202407; en la revisión del prompt, el texto no menciona la marca de 202406).
  - `entidad-incompleta.json`: una entidad con `situacion: null` y `monto: null`, y otra válida con situación 2.
  - `sin-situacion-valida.json`: 2 entidades, una con `situacion: null` y otra con `situacion: 7`, ambas con monto.
  - `sin-periodos.json`: `"periodos": []`.
  - `estructura-invalida.json`: `{"status": 200, "results": {"identificacion": 20900000244, "periodos": "no-es-lista"}}`.
- [X] T005 [P] Crear `config/prompts/bcra-summary.md` con el texto **exacto** del bloque ```text de [contracts/bcra-summary-prompt.md](contracts/bcra-summary-prompt.md) (sin las cercas ni las notas).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: modelos, interfaces de acceso y la validación del CUIT en el dashboard, que todas las historias usan.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [X] T006 Crear `src/health_score/credit/models.py` con los modelos Pydantic de [data-model.md](data-model.md):
  - `CreditStatusRequest`: `model_config = ConfigDict(extra="forbid")`; `cuil: Cuil` (importado de `health_score.cuil`).
  - Respuesta del BCRA, todos con `extra="ignore"`:
    - `BcraEntity`: `entidad: str`; `situacion: int | None = None` ("Fuera de 1–5 se acepta pero no cuenta para el tono"); `monto: float | None = None` ("Miles de pesos; `None` no suma al total"); `diasAtrasoPago: int | None = None` ("0 = no aplicable"); `fechaSit1: str | None = None`; los seis booleanos `refinanciaciones`, `recategorizacionOblig`, `situacionJuridica`, `irrecDisposicionTecnica`, `enRevision`, `procesoJud` con default `False`.
    - `BcraPeriod`: `periodo: str` con `pattern=r"^\d{6}$"`; `entidades: list[BcraEntity]`.
    - `BcraResults`: `identificacion: int`; `denominacion: str | None = None`; `periodos: list[BcraPeriod]`.
    - `BcraDebtResponse`: `status: int`; `results: BcraResults`.
  - `CreditFacts`: `period_label: str`, `worst_situation: int | None`, `worst_entity: str | None`, `entity_count: int`, `total_pesos: str`, `max_days_late: int`, `tone: CreditTone | None`.
  - `CreditStatus`: `status: Literal["with_debts", "no_data", "bcra_unavailable", "summary_unavailable"]`, `tone: Literal["positive", "warning", "risk"] | None = None`, `message: str`. Con `Field(description=...)` en español para OpenAPI (Principio VIII).
- [X] T007 Crear `src/health_score/credit/bcra.py` con:
  - Las dataclasses congeladas `Found(raw: dict, parsed: BcraDebtResponse)`, `NotFound()` y `Unavailable(reason: str)`.
  - `BcraLookup = Found | NotFound | Unavailable`.
  - `class BcraSource(Protocol): def lookup(self, digits: str) -> BcraLookup: ...`.
  - Aún sin la implementación HTTP (la agrega T017).
- [X] T008 [P] Crear `src/health_score/credit/summarizer.py` con:
  - `class Summarizer(Protocol): def summarize(self, raw: dict, facts: CreditFacts) -> str | None: ...`. `None` significa "resumen no disponible".
  - `load_prompt(path) -> str`: lee el archivo en UTF-8 y lanza `health_score.config.ConfigError` si no existe o si queda vacío tras `strip()`, con un mensaje en español como los de `load_config`.
  - Aún sin `ClaudeSummarizer` (la agrega T018).
- [X] T009 [P] Crear `frontend/src/lib/cuit.ts` con:
  - `CUIT_FORMAT_MESSAGE = "El CUIT/CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)"`.
  - `CUIT_CHECK_DIGIT_MESSAGE = "El dígito verificador del CUIT/CUIL no es válido"`.
  - `validateCuit(value: string): { ok: true; digits: string } | { ok: false; message: string }`, con la misma regla que `src/health_score/cuil.py`: regex `/^\d{11}$|^\d{2}-\d{8}-\d$/`; pesos `[5, 4, 3, 2, 7, 6, 5, 4, 3, 2]`; resto 0 → 0, resto 1 → inválido, otro → 11 − resto. Sin recortar espacios.
  - Comentario de cabecera: la regla duplica `cuil.py` a propósito (FR-003) y `tests/fixtures/cuil_cases.json` mantiene sincronizadas las dos implementaciones.
- [X] T010 [P] En `frontend/src/api/types.ts` agregar `export type CreditStatusKind = "with_debts" | "no_data" | "bcra_unavailable" | "summary_unavailable"`, `export type CreditTone = "positive" | "warning" | "risk"` y `export interface CreditStatus { status: CreditStatusKind; tone: CreditTone | null; message: string }`. En `frontend/src/api/client.ts` agregar `export function getCreditStatus(cuil: string, signal?: AbortSignal)`, que hace `request<CreditStatus>("/credit-status", { method: "POST", body: JSON.stringify({ cuil }), signal })`.

**Checkpoint**: los módulos importan sin errores y `pytest` / `npm test` siguen verdes.

---

## Phase 3: User Story 1 - Ver la situación crediticia del CUIT al terminar de escribirlo (Priority: P1) 🎯 MVP

**Goal**: al salir del campo con un CUIT válido, el dashboard pide la situación a `POST /credit-status`. El servicio consulta al BCRA (11 dígitos sin guiones), le pide a Claude el texto, y el dashboard lo muestra con su tono y la fuente.

**Independent Test**: con `FakeBcraSource` y `FakeSummarizer` (backend) y `stubFetch` (frontend), un CUIT válido produce exactamente una solicitud. El modelo recibe el prompt, el JSON completo y los datos calculados, y el texto se ve con el tono correcto.

### Tests for User Story 1 ⚠️

- [X] T011 [P] [US1] Crear `tests/unit/test_credit_service.py` con fakes locales (`FakeBcraSource`, que devuelve un `Found` construido desde `tests/fixtures/bcra/*.json` y registra los `digits` recibidos; y `FakeSummarizer`, que registra `(raw, facts)` y devuelve un texto fijo). Probar:
  - `compute_facts` sobre `situacion-2.json`: `period_label == "julio 2024"`, `worst_situation == 2`, `worst_entity == "BANCO FICTICIO DEL SUR"`, `entity_count == 3`, `total_pesos == "$ 1.250.000"`, `max_days_late == 45`, `tone == "warning"`.
  - `tone_for`: 1 → `"positive"`; 2 → `"warning"`; 3, 4 y 5 → `"risk"`.
  - `varios-periodos.json` usa `"202407"` (tono `"positive"`).
  - `entidad-incompleta.json` ignora la entidad sin situación ni monto en el tono y en el total.
  - `sin-situacion-valida.json`: `worst_situation is None`, `worst_entity is None`, `tone is None`, y el total suma los dos montos (FR-013).
  - `check_credit` devuelve `CreditStatus(status="with_debts", tone=..., message=<texto del fake>)`, y el fake recibe el `raw` **idéntico** al JSON del fixture (FR-015).
- [X] T012 [P] [US1] Crear `tests/unit/test_summarizer.py` con un cliente falso que imita `client.with_options(...).messages.create(**kwargs)`. Verificar que `ClaudeSummarizer.summarize`:
  - llama a `with_options(timeout=15.0, max_retries=0)`;
  - envía `model` (por defecto `"claude-opus-5-5"`), `max_tokens=2000`, `output_config={"effort": "low"}`, `system` igual al texto del prompt cargado y `cache_control={"type": "ephemeral"}`;
  - envía un único mensaje `user` que contiene `<respuesta_bcra>` con `json.dumps(raw, ensure_ascii=False)` y `<datos_calculados>` con las líneas `periodo:`, `peor_situacion:`, `entidad_peor_situacion:`, `cantidad_entidades:`, `monto_total:` y `maximo_dias_atraso:` ([contrato del prompt](contracts/bcra-summary-prompt.md)); con facts en `None`, la línea dice `no informado` (p. ej. `peor_situacion: no informado`), nunca `None`;
  - con `stop_reason="end_turn"` y un bloque `text`, devuelve ese texto sin espacios al inicio ni al final.

  Probar también que `load_prompt` lanza `ConfigError` con un archivo vacío o inexistente.
- [X] T013 [P] [US1] Crear `tests/unit/test_bcra_source.py`, caso feliz: con `monkeypatch` sobre `urllib.request.urlopen` en el módulo `health_score.credit.bcra`, verificar que `HttpBcraSource(base_url="https://bcra.test/CentralDeDeudores/v1.0").lookup("20900000244")` pide exactamente `https://bcra.test/CentralDeDeudores/v1.0/Deudas/20900000244` con `timeout=10`, y que con `situacion-1.json` devuelve `Found` con `raw` igual al JSON y `parsed` validado.
- [X] T014 [P] [US1] Crear `tests/integration/test_credit_status_api.py` con `TestClient(create_app(default_config, <repo de conftest>, credit_source=fake, summarizer=fake))`. Probar:
  - `POST /credit-status` con `{"cuil": "20-90000024-4"}` y con `{"cuil": "20900000244"}` responde 200 con `status == "with_debts"`, el `tone` y el `message` del fake, y la fuente recibe `"20900000244"` (sin guiones, FR-010).
  - Un cuerpo con un campo extra responde 422.
- [X] T015 [P] [US1] En `tests/contract/test_http_api.py` agregar `test_openapi_declares_credit_status` (sin tocar `EXPECTED_ENDPOINTS`): `paths["/credit-status"]["post"]` existe, su 200 referencia `CreditStatus`, declara `"422"` y tiene `summary` y `description`. El esquema `CreditStatus` tiene exactamente las propiedades `{"status", "tone", "message"}`.
- [X] T016 [P] [US1] En `frontend/src/pages/new-client/NewClientPage.test.tsx` agregar `describe("consulta al BCRA")` con `stubFetch` (`GET /api/metrics` como en las pruebas existentes, y `POST /api/credit-status` con `{status: "with_debts", tone: "warning", message: "Texto ficticio del resumen."}`). Probar:
  - Escribir `20-90000024-4` y hacer `tab` hace **una** llamada `POST /api/credit-status` con cuerpo `{"cuil":"20900000244"}`, y mientras está pendiente (ruta como función que devuelve una promesa controlada) se ve "Consultando situación en el BCRA…".
  - Al resolver, se ve el texto y "Fuente: Central de Deudores del BCRA" dentro de un `role="status"`.
  - Con `tone` `positive`, `warning` y `risk`, el contenedor tiene la clase de `TONE_CLASSES` de `top`, `stable` y `risk`, respectivamente.
  - Con `with_debts` y `tone: null`, el `Alert` no tiene ninguna clase de `TONE_CLASSES` (neutro, FR-013).
  - Escribir solo métricas y pulsar "Calcular score" no llama a `/api/credit-status`.
  - Con un resultado visible, calcular y "Guardar en cartera" siguen funcionando igual (FR-023).

### Implementation for User Story 1

- [X] T017 [US1] En `src/health_score/credit/bcra.py` implementar `HttpBcraSource(base_url: str, timeout: float = 10.0)` (camino feliz): `lookup` arma `f"{base_url.rstrip('/')}/Deudas/{digits}"`, hace `urllib.request.urlopen(Request(url, headers={"Accept": "application/json"}), timeout=self.timeout)`, lee y decodifica el JSON, lo valida con `BcraDebtResponse.model_validate` y devuelve `Found(raw, parsed)`. **Nunca** desactivar la verificación TLS (research R3). Que T013 pase.
- [X] T018 [US1] En `src/health_score/credit/summarizer.py` implementar `ClaudeSummarizer(prompt: str, model: str = "claude-opus-5-5", client: anthropic.Anthropic | None = None)` según T012. El cliente por defecto es `anthropic.Anthropic()` y se crea en el constructor. La función privada `_facts_block(facts)` arma `<datos_calculados>` y escribe los valores `None` como `no informado`. Por ahora solo el camino `end_turn`: el manejo de fallas lo agrega T040. Que T012 pase.
- [X] T019 [US1] Crear `src/health_score/credit/service.py` con:
  - `MONTHS` (`"enero"` … `"diciembre"`).
  - `tone_for(situation: int | None) -> CreditTone | None`.
  - `compute_facts(parsed: BcraDebtResponse) -> CreditFacts`: elige el período con `periodo` mayor; total = `sum(monto) * 1000` formateado como `"$ " + f"{int(round(total)):,}".replace(",", ".")`; `worst_entity` es la primera entidad con la peor situación válida (1–5).
  - Los textos fijos `NO_DATA_MESSAGE`, `BCRA_UNAVAILABLE_MESSAGE` y `SUMMARY_UNAVAILABLE_MESSAGE`, con el texto exacto de data-model.md §4.
  - `check_credit(digits: str, source: BcraSource | None, summarizer: Summarizer | None) -> CreditStatus`: `Found` → `compute_facts` → `summarizer.summarize(raw, facts)` → `with_debts` con el `tone` de los facts.

  Crear `src/health_score/credit/__init__.py`, que exporta `BcraSource`, `HttpBcraSource`, `Summarizer`, `ClaudeSummarizer`, `load_prompt`, `check_credit`, `CreditStatus` y `CreditStatusRequest`. Que T011 pase.
- [X] T020 [US1] En `src/health_score/api/app.py`:
  - Cambiar la firma a `create_app(config, repository, credit_source: BcraSource | None = None, summarizer: Summarizer | None = None)` y guardar ambos en `app.state`.
  - Agregar `POST /credit-status` con `response_model=CreditStatus`, `tags=["crédito"]`, `summary="Consultar la situación crediticia en el BCRA"`, una `description` que explique los cuatro `status`, que el CUIT va en el cuerpo para que no quede en los logs y que nada se guarda, y `responses=INVALID_RESPONSE`. El cuerpo es `CreditStatusRequest` y llama a `check_credit(data.cuil, ...)`.
  - En `app_from_env` leer `HEALTH_SCORE_BCRA_URL` (default `https://api.bcra.gob.ar/CentralDeDeudores/v1.0`), `HEALTH_SCORE_SUMMARY_PROMPT` (default `config/prompts/bcra-summary.md`; un prompt inválido lanza `ConfigError` y el servicio no arranca, como `scoring.json`) y `HEALTH_SCORE_SUMMARY_MODEL` (default `claude-opus-5-5`), y construir `HttpBcraSource`. La construcción de `ClaudeSummarizer` se hace con `_summarizer_from_env(prompt, model)` (la define T041b); hasta entonces, `summarizer=None`.

  Que T014 y T015 pasen, y que las pruebas existentes de `create_app` sigan verdes sin cambios.
- [X] T021 [P] [US1] Crear `frontend/src/pages/new-client/useCreditCheck.ts` (versión inicial; la deduplicación completa se agrega en T033). Estado `{ kind: "idle" } | { kind: "loading"; digits } | { kind: "done"; digits; result: CreditStatus } | { kind: "failed"; digits }`. `check(digits)` aborta el `AbortController` anterior, pasa a `loading` y llama a `getCreditStatus(digits, signal)`; al resolver, si no se abortó, pasa a `done`; ante un error que no sea de aborto, pasa a `failed`. `reset()` aborta y vuelve a `idle`. Al desmontar se aborta.
  - Tiempo límite propio de `CREDIT_CHECK_TIMEOUT_MS = 28_000` (SC-005 pide el aviso en menos de 30 s; quedan 2 s de margen para el dibujado): un `setTimeout` por consulta aborta la solicitud y pasa a `failed`. Se cancela al resolver, en `reset` y al desmontar. Comentar el porqué: los tiempos límite del BCRA y del SDK son por operación de red, no por duración total (research R6), así que el servicio no garantiza por sí solo el límite de 30 s.
- [X] T022 [P] [US1] Crear `frontend/src/pages/new-client/CreditStatusPanel.tsx` según la tabla de [contracts/ui-credit-check.md](contracts/ui-credit-check.md):
  - Contenedor `role="status"` con `aria-live="polite"`, siempre presente (vacío en `idle`), para que el anuncio funcione.
  - En `loading`: `Loader2` con `animate-spin` y el texto del indicador.
  - En `done`: un `Alert` de `@/components/ui/alert` con `role={undefined}`: el `Alert` trae `role="alert"` y, dentro del `role="status"`, quedarían dos regiones anidadas y un anuncio asertivo. Cuando `tone` no es `null`, usa `TONE_CLASSES[CREDIT_TONE[tone]]`, donde `CREDIT_TONE` es un `Record<CreditTone, Tone>` local: `positive` → `top`, `warning` → `stable` y `risk` → `risk`.
  - El `message` va en un `<p className="whitespace-pre-line break-words">` como texto plano, seguido de `<small>Fuente: Central de Deudores del BCRA</small>`. `break-words` evita el desplazamiento horizontal en pantallas angostas (FR-022).
  - Props: `state` y `onRetry` (el botón "Reintentar" se completa en T043).
- [X] T023 [US1] En `frontend/src/components/ClientFields.tsx` agregar dos props opcionales: `onCuilBlur?: () => void` (se pasa como `onBlur` del `Input` de CUIT) y `cuilStatus?: ReactNode` (se dibuja dentro del `Field` de CUIT, debajo del error). Sin ellas, el componente se comporta exactamente igual, y la edición (`ClientEditForm`) no cambia.
- [X] T024 [US1] En `frontend/src/pages/new-client/ScoreForm.tsx` reenviar `onCuilBlur` y `cuilStatus` a `ClientFields`. En `frontend/src/pages/new-client/NewClientPage.tsx` usar `useCreditCheck()`. En el `onCuilBlur`, si el valor está vacío no se hace nada; si `validateCuit(form.values.cuil)` es `ok`, se llama a `check(result.digits)`. Pasar `<CreditStatusPanel state={...} onRetry={...} />` como `cuilStatus`. Que T016 pase.

**Checkpoint**: US1 funciona de punta a punta con fakes; `pytest` y `npm test` verdes.

---

## Phase 4: User Story 2 - Detectar un CUIT mal escrito sin consultar al BCRA (Priority: P1)

**Goal**: un CUIT con formato o dígito verificador inválido muestra el mensaje junto al campo al salir del foco, sin ninguna solicitud. El servicio también lo rechaza con 422 sin llamar a las fuentes.

**Independent Test**: para cada valor de `format_error` y `check_digit_error` de `tests/fixtures/cuil_cases.json`, al salir del campo se ve el mensaje y `fetch` no recibe `POST /api/credit-status`. En el backend, un 422 no invoca a los fakes.

### Tests for User Story 2 ⚠️

- [X] T025 [P] [US2] Crear `frontend/src/lib/cuit.test.ts` que importe `../../../tests/fixtures/cuil_cases.json` y verifique: cada `valid` → `{ ok: true, digits }`; cada `format_error` → `{ ok: false, message: CUIT_FORMAT_MESSAGE }`; cada `check_digit_error` → `{ ok: false, message: CUIT_CHECK_DIGIT_MESSAGE }`. Si TypeScript rechaza la importación del JSON, habilitar `"resolveJsonModule": true` en `frontend/tsconfig.json`.
- [X] T026 [P] [US2] En `tests/unit/test_cuil.py` agregar pruebas parametrizadas que lean `tests/fixtures/cuil_cases.json` (ruta relativa a `__file__`): `valid` → `normalize_cuil(input) == digits`; `format_error` → `error_of(v)["type"] == "cuil_format"`; `check_digit_error` → `error_of(v)["type"] == "cuil_check_digit"`. No modificar las pruebas existentes.
- [X] T027 [P] [US2] En `tests/integration/test_credit_status_api.py` agregar: `{"cuil": "20900000245"}` → 422 con `loc == ["body", "cuil"]` y `type == "cuil_check_digit"`; `{"cuil": "20 90000024 4"}` → 422 `cuil_format`; `{}` → 422. En los tres casos los fakes **no** registran llamadas.
- [X] T028 [P] [US2] En `frontend/src/pages/new-client/NewClientPage.test.tsx` (en `describe("consulta al BCRA")`) agregar:
  - Con `20-9000002-4`, `20 90000024 4` y `20A90000024`, al salir del foco se ve `CUIT_FORMAT_MESSAGE` junto al campo, el input tiene `aria-invalid="true"` con `aria-describedby` apuntando al mensaje, el valor del campo no cambió y no hubo `POST /api/credit-status`.
  - Con `20900000245` se ve `CUIT_CHECK_DIGIT_MESSAGE` y no hay solicitud.
  - Con el campo vacío, al salir del foco no hay error ni solicitud.
  - Tras un error, corregir a `20900000244` y salir del foco quita el mensaje y hace una solicitud.

### Implementation for User Story 2

- [X] T029 [US2] En `frontend/src/lib/cuit.ts` ajustar lo que haga falta para que T025 pase (los casos de resto 0 y resto 1).
- [X] T030 [US2] En `frontend/src/pages/new-client/NewClientPage.tsx`, en el `onCuilBlur`: si `validateCuit` no es `ok`, `setForm(prev => ({ ...prev, fieldErrors: { ...prev.fieldErrors, cuil: result.message } }))` y no consultar. El borrado del mensaje al escribir ya lo hace `change` (comportamiento existente). Que T027 y T028 pasen.

**Checkpoint**: US1 y US2 funcionan juntas; ningún CUIT inválido genera solicitudes.

---

## Phase 5: User Story 3 - Cambiar el CUIT después de una consulta (Priority: P2)

**Goal**: el resultado nunca corresponde a un CUIT distinto del escrito. Al modificar el campo se invalida el resultado; no hay solicitudes duplicadas para el mismo CUIT (con o sin guiones); las respuestas tardías se descartan.

**Independent Test**: con `stubFetch` y rutas que devuelven promesas controladas, se verifican el borrado inmediato, el descarte de respuestas viejas y el conteo exacto de solicitudes.

### Tests for User Story 3 ⚠️

- [X] T031 [P] [US3] En `frontend/src/pages/new-client/NewClientPage.test.tsx` agregar:
  - Con un resultado visible, escribir un carácter en el campo hace desaparecer el resultado de inmediato.
  - Con una consulta pendiente, modificar el campo y luego resolverla no muestra el texto.
  - Consultar `20-90000024-4`, cambiar el campo a `20900000244` (el resultado desaparece al escribir) y salir del foco: el resultado vuelve a verse **sin** una segunda solicitud, porque es el mismo CUIT normalizado (US3, escenario 3). Conteo total: **1**.
  - Salir del foco tres veces sin cambiar el valor deja una sola solicitud.
  - Con una consulta pendiente, salir del foco otra vez con el mismo CUIT no genera otra solicitud.
  - Consultar A, luego cambiar a B y salir del foco: hay 2 solicitudes, y si la respuesta de A llega después que la de B se muestra solo la de B.
  - Tras "Guardar en cartera" exitoso, el panel queda vacío.
  - Con una consulta pendiente, desmontar la página (navegar a otra ruta) aborta la señal de la solicitud, y resolverla después no produce advertencias de React ni muestra el texto en la otra pantalla (FR-009).
  - Con un resultado `bcra_unavailable`, cambiar el campo y volver al mismo CUIT al salir del foco hace una solicitud nueva: los resultados "no disponible" no se conservan.
- [X] T032 [P] [US3] Crear `frontend/src/pages/new-client/useCreditCheck.test.ts` con `renderHook`: `check` dos veces con el mismo `digits` en `loading` o en `done` hace una sola llamada; `reset` aborta la señal pasada a `getCreditStatus` (usar `vi.spyOn` sobre `@/api/client`); una respuesta que llega después de `reset` no cambia el estado.

### Implementation for User Story 3

- [X] T033 [US3] En `frontend/src/pages/new-client/useCreditCheck.ts`:
  - `check(digits)` no hace nada si el estado es `loading` o `done` con los mismos `digits` (FR-006, FR-007).
  - Guardar en un `useRef` el último resultado `done` (`{ digits, result }`), solo si su `status` es `with_debts` o `no_data`. Un "no disponible" no se conserva: volver al mismo CUIT consulta otra vez en lugar de mostrar de nuevo el error.
  - `reset()` vuelve a `idle` y aborta lo que esté en curso, pero **conserva** ese último resultado. Así un `check` posterior con los mismos `digits` lo restaura sin una solicitud nueva (US3, escenario 3).
  - Agregar `clear()`, que además olvida el último resultado, para el guardado exitoso y el desmontaje (FR-009).
  - Comentar el porqué de la diferencia entre `reset` y `clear`.
- [X] T034 [US3] En `frontend/src/pages/new-client/NewClientPage.tsx`: en `change` con `field === "cuil"`, llamar a `reset()` (FR-008); en `save`, tras el éxito, llamar a `clear()` junto con el vaciado del formulario. Que T031 y T032 pasen.

**Checkpoint**: US1–US3 funcionan; SC-003 y SC-004 se cumplen en las pruebas.

---

## Phase 6: User Story 4 - Entender cuando no hay datos o la consulta falla (Priority: P2)

**Goal**: "sin datos" se muestra neutro y sin llamar al modelo. Las fallas del BCRA, del modelo o de nuestro servicio muestran un aviso con "Reintentar", sin bloquear el alta.

**Independent Test**: con fakes y `monkeypatch`, cada falla listada en FR-012 produce el `status` y el texto fijo correctos; en el dashboard, cada caso muestra su aviso y "Reintentar" repite la consulta.

### Tests for User Story 4 ⚠️

- [X] T035 [P] [US4] En `tests/unit/test_bcra_source.py` agregar, con `urlopen` simulado:
  - `HTTPError` 404 → `NotFound`.
  - `HTTPError` 400, 429, 500 y 503 → `Unavailable`.
  - `URLError` → `Unavailable`.
  - `TimeoutError` (y `socket.timeout`) → `Unavailable`.
  - Cuerpo que no es JSON → `Unavailable`.
  - `estructura-invalida.json` → `Unavailable`.
  - `sin-periodos.json` → `NotFound`.
  - Un período más reciente con `"entidades": []` → `NotFound`.
- [X] T036 [P] [US4] En `tests/unit/test_summarizer.py` agregar casos que devuelven `None`:
  - El cliente falso lanza `anthropic.APITimeoutError`, `anthropic.APIConnectionError`, `anthropic.RateLimitError` o `anthropic.APIStatusError` (construirlos como indique la firma del SDK instalado, con un `httpx2.Request` o `Response` mínimo).
  - El cliente falso lanza `anthropic.AnthropicError("x")` (error del cliente, no de la API).
  - `stop_reason` igual a `"refusal"` o `"max_tokens"`.
  - Sin bloques `text`, o con texto vacío o solo espacios.
  - Texto de 1.201 caracteres. Uno de exactamente 1.200 sí se acepta.
- [X] T037 [P] [US4] En `tests/unit/test_credit_service.py` agregar:
  - `NotFound` → `CreditStatus(status="no_data", tone=None, message=NO_DATA_MESSAGE)` y el summarizer **no** se llama (FR-020).
  - `Unavailable` → `bcra_unavailable` con `BCRA_UNAVAILABLE_MESSAGE`.
  - `Found` con el summarizer devolviendo `None` → `summary_unavailable`.
  - `source=None` → `bcra_unavailable`; `summarizer=None` con `Found` → `summary_unavailable`.
  - Los tres textos coinciden carácter por carácter con data-model.md §4.
- [X] T038 [P] [US4] En `tests/integration/test_credit_status_api.py` agregar los tres `status` no felices por HTTP (200 con el `message` fijo). Agregar también que `create_app(config, repo)` sin fuentes responde `bcra_unavailable` sin salir a la red.
- [X] T039 [P] [US4] En `frontend/src/pages/new-client/NewClientPage.test.tsx` agregar:
  - `no_data` → se ve el `message` sin botón "Reintentar".
  - `bcra_unavailable` y `summary_unavailable` → se ve el `message` y un botón "Reintentar"; pulsarlo hace una segunda solicitud con el mismo cuerpo y muestra de nuevo el indicador.
  - `POST /api/credit-status` con status 502, o con un `fetch` que rechaza → "No pudimos consultar la situación en el BCRA en este momento. Inténtalo de nuevo en unos minutos." (el mismo texto de `bcra_unavailable`) y "Reintentar".
  - Con `vi.useFakeTimers()` y una ruta que nunca resuelve, al avanzar 28 s se aborta la solicitud y se ve el mismo aviso con "Reintentar" (SC-005).
  - En todos los casos, "Calcular score" y "Guardar en cartera" siguen funcionando.

### Implementation for User Story 4

- [X] T040 [US4] En `src/health_score/credit/summarizer.py`, en `ClaudeSummarizer.summarize`, capturar `anthropic.AnthropicError` (cubre timeout, conexión, 429, 4xx/5xx y errores del cliente) → `logger.warning("Resumen no disponible: %s", type(exc).__name__)` y `return None`. También devolver `None` con `stop_reason` distinto de `"end_turn"`, con texto vacío tras `strip()` o con más de `MAX_SUMMARY_CHARS = 1200` caracteres (FR-012). Que T036 pase.
- [X] T041 [US4] En `src/health_score/credit/bcra.py`, en `HttpBcraSource.lookup`, capturar `HTTPError` (404 → `NotFound()`, otro → `Unavailable(f"HTTP {code}")`), `URLError`, `TimeoutError`, `json.JSONDecodeError`, `UnicodeDecodeError` y `pydantic.ValidationError` → `Unavailable`. Tras validar, si no hay períodos o el más reciente no tiene entidades, devolver `NotFound()`. Registrar solo el motivo, nunca la URL (contiene el CUIT). Que T035 pase.
- [X] T041b [US4] En `src/health_score/api/app.py` crear `_summarizer_from_env(prompt, model)` (research R7) y usarla en `app_from_env`:
  - Credenciales, en este orden: el archivo de `ANTHROPIC_API_KEY_FILE` (con `.strip()`) o la variable `ANTHROPIC_API_KEY`. Si hay una, devolver `ClaudeSummarizer(prompt, model, anthropic.Anthropic(api_key=...))`. No se usa el perfil de `ant auth login`: no hay forma fiable de detectarlo y haría que las pruebas dependan de la máquina.
  - Si no hay ninguna (archivo inexistente o vacío, o variable vacía), registrar **una** advertencia ("Sin credenciales del modelo: la consulta al BCRA no podrá resumir") y devolver `None`. No confiar en que `anthropic.Anthropic()` lance: el SDK recién falla en la solicitud.
  - Pruebas en `tests/unit/test_summarizer_from_env.py`, llamando a la función directamente: con un archivo temporal → `ClaudeSummarizer` con esa clave; con `ANTHROPIC_API_KEY` → ídem; sin ninguna (`monkeypatch.delenv` de las dos) → `None` y una sola advertencia sin datos personales; con un archivo vacío → `None`.
  - En `tests/integration/test_credit_status_api.py`: `create_app(config, repo, credit_source=fake_found, summarizer=None)` responde 200 `summary_unavailable`.
- [X] T042 [US4] En `src/health_score/credit/service.py`, completar `check_credit` con las ramas `NotFound`, `Unavailable`, `source is None`, `summarizer is None` y `summary is None`, según la tabla de data-model.md §4. Que T037 y T038 pasen.
- [X] T043 [US4] En `frontend/src/pages/new-client/useCreditCheck.ts` agregar `retry()`: disponible en `failed` o en `done` con `status` `bcra_unavailable` o `summary_unavailable`; vuelve a `loading` con los mismos `digits` y saltea la deduplicación. En `frontend/src/pages/new-client/CreditStatusPanel.tsx`:
  - `no_data`: `Alert` neutro.
  - Los dos "no disponible": `Alert` neutro con `AlertTriangle`, el `message` y un `Button variant="secondary" size="sm"` "Reintentar" → `onRetry`.
  - `failed` (servicio caído, error de red o tiempo límite de 28 s): el mismo `Alert`, con el texto "No pudimos consultar la situación en el BCRA en este momento. Inténtalo de nuevo en unos minutos." y "Reintentar". Para la persona el efecto es el mismo que `bcra_unavailable`, por eso usa el mismo texto.

  Que T039 pase.

**Checkpoint**: las cuatro historias funcionan con fakes; suites completas verdes.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: privacidad en logs, contenedores, documentación y revisión del prompt.

- [X] T044 [P] En `tests/integration/test_credit_status_api.py` agregar `test_logs_never_contain_personal_data` con `caplog.set_level(logging.DEBUG)`. Ejecutar los cuatro resultados, el 422 y un `HttpBcraSource` con `URLError` simulado. Verificar que ningún registro contiene `"20900000244"`, `"20-90000024-4"`, `"EMPRESA FICTICIA"` ni el `message` del fake (FR-024, SC-008).
- [X] T045 [P] Crear `scripts/review_bcra_prompt.py` (FR-028). Para cada `tests/fixtures/bcra/*.json` con períodos válidos, el script carga el prompt con `load_prompt`, calcula los facts con `compute_facts`, llama a `ClaudeSummarizer` real y escribe en `tmp/prompt-review/<archivo>.txt` el texto junto con los facts, para revisión manual. Docstring con una advertencia: llama al modelo real y tiene costo. Nunca lo importa ni lo ejecuta la suite de pytest. Opción `--model` para probar otro modelo.
  - Medir con `time.perf_counter()` la duración de cada llamada al modelo y escribir al final un resumen con el máximo y el percentil 95 (SC-001). Si el p95 del modelo supera 8 s (dejando unos 2 s al BCRA), avisar en la salida que conviene probar `--model claude-sonnet-5-5`.
  - Ignorar `tests/fixtures/bcra-demo.json` (está fuera de `bcra/`, pero el docstring lo aclara). El script es la revisión manual que permite la constitución v2.4.0 (Principio IX): fixtures ficticios, solo a mano.
- [X] T045b [P] Crear `tests/unit/test_credit_demo.py` (escribir primero; debe fallar):
  - `FixtureBcraSource(fixtures_dir)` con cada CUIT de `tests/fixtures/bcra-demo.json` devuelve el `Found` del fixture indicado, con `raw` idéntico al JSON salvo `results.identificacion`, que es el CUIT consultado (como lo devuelve el BCRA real); con `estructura-invalida.json`, `Unavailable`; con un CUIT que no está en el índice, `NotFound`.
  - `FixtureBcraSource` nunca abre conexiones: con `urllib.request.urlopen` reemplazado por una función que falla, todos los casos anteriores pasan.
  - `DemoSummarizer.summarize(raw, facts)` devuelve un texto que empieza con "[Demostración]" e incluye `period_label`, `worst_situation`, `entity_count` y `total_pesos`; devuelve `None` cuando el índice marca `"summary": "fail"` para el CUIT de `raw["results"]["identificacion"]`. Probarlo de punta a punta: `check_credit("20900000066", FixtureBcraSource(...), DemoSummarizer(...))` da `summary_unavailable`, y `check_credit("20900000244", ...)` da `with_debts`.
  - `app_from_env` con `HEALTH_SCORE_DEMO_FIXTURES=tests/fixtures` usa las dos versiones simuladas (no construye `HttpBcraSource` ni `ClaudeSummarizer`, verificado con `monkeypatch` sobre sus constructores) y registra **una** advertencia "Modo demostración: BCRA y modelo simulados".
- [X] T045c Crear `tests/fixtures/bcra-demo.json` con el índice `{"<11 dígitos>": {"fixture": "<archivo>", "summary": "ok" | "fail"}}`, según la tabla de [quickstart.md](quickstart.md) §2:
  - `20900000244` → `situacion-2.json`; `20900000023` → `situacion-1.json`; `20900000031` → `situacion-5.json`; `20900000074` → `sin-situacion-valida.json`; `20900000058` → `estructura-invalida.json`; `20900000066` → `situacion-3.json` con `"summary": "fail"`. Cualquier otro CUIT da "sin datos".

  Crear `src/health_score/credit/demo.py` con `FixtureBcraSource` y `DemoSummarizer`, que implementan `BcraSource` y `Summarizer` (Principio IV) y se construyen con el mismo índice. `FixtureBcraSource` reemplaza `results.identificacion` por el CUIT consultado, porque `Summarizer.summarize` no recibe el CUIT y todos los fixtures comparten la misma identificación; `DemoSummarizer` busca en el índice por ese valor. En `app_from_env`, si `HEALTH_SCORE_DEMO_FIXTURES` está definida, usarlas en lugar de las reales. Comentar el porqué: la constitución exige que las demostraciones usen versiones simuladas de las fuentes y del modelo (Principio IX). El texto de `DemoSummarizer` es solo para demostraciones: no es una alternativa al modelo (clarificación del 2026-10-26). Que T045b pase.
- [X] T046 En `Dockerfile`, en la imagen `api`, agregar `COPY config/prompts ./config/prompts` junto a `scoring.json` y `HEALTH_SCORE_SUMMARY_PROMPT=/app/config/prompts/bcra-summary.md` en el bloque `ENV`. No agregar la API key en ningún `ENV` ni `ARG`. Correr `hadolint Dockerfile` sin errores.
- [X] T046b En `Dockerfile`, etapa `web-builder`: cambiar a `WORKDIR /build/frontend`, agregar `COPY tests/fixtures/cuil_cases.json /build/tests/fixtures/cuil_cases.json` antes de `RUN npm run build` y ajustar a `COPY --from=web-builder /build/frontend/dist ...` en la etapa `web`. En `.dockerignore`, después de `tests`, agregar `!tests/fixtures/cuil_cases.json`. Motivo: `tsc -b` también revisa `cuit.test.ts`, que importa ese archivo por ruta relativa (T025). Verificar con `docker compose build web` y `hadolint Dockerfile`.
- [X] T047 En `compose.yaml`:
  - Red nueva `egress: {}` (no interna), que solo usa `api`: `networks: [backend, egress]`.
  - `secrets: [anthropic_api_key]` en `api` y un bloque raíz `secrets: anthropic_api_key: { file: ./secrets/anthropic_api_key.txt }`.
  - `environment: ANTHROPIC_API_KEY_FILE=/run/secrets/anthropic_api_key` (es la ruta, no la clave).
  - Montaje `./config/prompts/bcra-summary.md:/app/config/prompts/bcra-summary.md:ro`.
  - Comentarios con la referencia OWASP: [#5] la excepción de salida sin restricción por dominio (research R13) y [#13] el secreto.
  - Reemplazar el comentario final "No hay secretos…" por la descripción del secreto nuevo.
  - `web` no cambia de redes.
- [X] T047b Crear `compose.demo.yaml` (override, nunca se usa en producción): en `api`, `environment: HEALTH_SCORE_DEMO_FIXTURES=/app/demo-fixtures` y el volumen `./tests/fixtures:/app/demo-fixtures:ro`. Comentario: los datos son ficticios y el modo demo no sale a internet (constitución v2.4.0, Principio IX). Revisarlo contra el checklist OWASP, igual que `compose.yaml`.
- [X] T048 [P] En `SECURITY-DOCKER.md` agregar dos secciones: "Salida a internet de `api` (spec 005)", con la excepción, su justificación y la recomendación para producción (proxy de salida con lista de dominios permitidos `api.bcra.gob.ar` y `api.anthropic.com`, o firewall del host); y "Secreto `anthropic_api_key`", con cómo crear `secrets/anthropic_api_key.txt`, que está en `.gitignore` y que nunca va en variables de entorno.
- [X] T049 [P] En `README.md` agregar la sección "Consulta al BCRA (spec 005)", con:
  - qué hace y que es informativa;
  - las variables `HEALTH_SCORE_BCRA_URL`, `HEALTH_SCORE_SUMMARY_PROMPT`, `HEALTH_SCORE_SUMMARY_MODEL`, `ANTHROPIC_API_KEY_FILE` y `HEALTH_SCORE_DEMO_FIXTURES`;
  - cómo dar la API key en local y en Docker;
  - cómo correr la demo simulada, en local y con `docker compose -f compose.yaml -f compose.demo.yaml up`;
  - que los datos reales solo se muestran (constitución v2.4.0, Principio IX);
  - el aviso de confirmar que la cuenta de Anthropic opera bajo términos comerciales sin entrenamiento con datos de la API;
  - cómo ajustar el prompt (`config/prompts/bcra-summary.md` + `docker compose restart api`) y cómo revisarlo con `scripts/review_bcra_prompt.py`.
- [X] T050 Correr la suite completa: `pytest` y `cd frontend; npm test; npm run build`. Todo verde, con las pruebas previas sin cambios de expectativas (FR-029, SC-009). Revisar con `git diff` que ninguna prueba previa cambió más allá de los agregados.
- [X] T050b **Puerta de privacidad** (constitución v2.4.0, Principio IX): confirmar con la persona responsable del proyecto que la cuenta u organización de la API key de Anthropic opera bajo términos comerciales sin entrenamiento con los datos de la API, y dejarlo anotado en el README (sección de T049) con la fecha. **Sin esta confirmación no se ejecuta** quickstart §3 ni se usa la funcionalidad con datos reales. La demo (§2) no lo necesita: es totalmente simulada.
- [ ] T051 Ejecutar [quickstart.md](quickstart.md) §2 (demo en modo simulado: cada CUIT de la tabla muestra su resultado; revisar la pantalla a 360 px de ancho sin desplazamiento horizontal, FR-022) y §4 (Docker con `compose.demo.yaml`: `docker compose build` sin errores; la clave no aparece en `docker compose exec api env`; `web` no está en `egress`; los logs de `api` y `web` no contienen el CUIT tras una consulta). Tras T050b y **solo con aprobación de la persona responsable** (tiene costo), ejecutar §3, que también mide SC-001 (T045), y ajustar `config/prompts/bcra-summary.md` según lo que muestre.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias; T001 primero, porque T008 y T018 importan `anthropic`.
- **Foundational (Phase 2)**: depende de Setup. T007 depende de T006; T008, T009 y T010 en paralelo tras T006. Bloquea todas las historias.
- **US1 (Phase 3)**: depende de Foundational.
- **US2 (Phase 4)**: depende de Foundational. Comparte `NewClientPage.tsx` con US1 (T030 después de T024), así que se hace después de US1.
- **US3 (Phase 5)**: depende de US1 (hook y página).
- **US4 (Phase 6)**: depende de US1. Los tests de backend (T035–T038) pueden empezar en paralelo a US3.
- **Polish (Phase 7)**: depende de las historias deseadas; T046–T049 pueden empezar apenas termina US1 (T046b, después de T025).

### User Story Dependencies

- **US1 (P1)**: base del flujo; no depende de otras historias.
- **US2 (P1)**: lógica independiente (`lib/cuit.ts`, 422 del servicio); solo comparte archivo con US1.
- **US3 (P2)**: extiende el hook de US1.
- **US4 (P2)**: extiende servicio, fuentes, hook y panel de US1.

### Within Each User Story

- Tests primero, y deben fallar.
- Backend: modelos → fuentes → servicio → endpoint.
- Frontend: hook y panel → `ClientFields` → página.

## Parallel Opportunities

- **Setup**: T002, T003, T004 y T005 en paralelo.
- **Foundational**: T008, T009 y T010 en paralelo tras T006.
- **US1**: T011–T016 (tests) en paralelo; T021 y T022 en paralelo con T017–T020 (frontend frente a backend).
- **US2**: T025–T028 en paralelo.
- **US4**: T035–T039 en paralelo; T040, T041 y T041b en paralelo (archivos distintos; T041b, en `app.py`, va después de T020).
- **Polish**: T044, T045, T045b, T048 y T049 en paralelo. T045b va antes de T045c; T047b, después de T047; T050b, antes de la §3 de T051.

## Parallel Example: User Story 1

```text
Task: "T011 test_credit_service.py: compute_facts, tone_for, check_credit con fakes"
Task: "T012 test_summarizer.py: parámetros de la llamada a Claude"
Task: "T013 test_bcra_source.py: URL con 11 dígitos y Found"
Task: "T014 test_credit_status_api.py: with_debts por HTTP"
Task: "T015 test_http_api.py: OpenAPI de /credit-status"
Task: "T016 NewClientPage.test.tsx: blur → 1 solicitud, indicador, texto, tono"

# Luego, backend y frontend en paralelo:
Task: "T017–T020 HttpBcraSource, ClaudeSummarizer, service, endpoint"
Task: "T021 useCreditCheck.ts" + "T022 CreditStatusPanel.tsx"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2.
2. Phase 3 (US1): con fakes en pruebas, y con BCRA y Claude reales en la demo.
3. **STOP and VALIDATE**: con las pruebas de US1 en verde. La demo de quickstart §2 necesita el modo simulado (T045b, T045c), que se puede adelantar justo después de US1 si se quiere mostrar el MVP.

### Incremental Delivery

1. US1 → MVP: la consulta funciona.
2. US2 → sin consultas inútiles ante CUIT mal escritos.
3. US3 → coherencia del resultado con el valor escrito.
4. US4 → fallas y "sin datos" bien explicados, con reintento.
5. Polish → Docker, documentación y revisión del prompt.

## Notes

- Las respuestas del BCRA de `tests/fixtures/bcra/` las usan las pruebas **y** la revisión del prompt: si se agrega un caso, sirve para ambas.
- Commit sugerido al cerrar cada fase.
