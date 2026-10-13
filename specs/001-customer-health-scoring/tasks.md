---

description: "Task list for the customer health scoring engine"
---

# Tasks: Motor de Scoring de Salud de Clientes

**Input**: Design documents from `/specs/001-customer-health-scoring/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (python-api.md, http-api.md, scoring-config.schema.json), quickstart.md

**Tests**: INCLUDED. Constitution v2.0.0, Principle VII requires pytest coverage of normal cases, range boundaries and invalid values, and plan.md lists the test files. Within each story, write the tests first and confirm they FAIL before implementing.

**Organization**: Tasks are grouped by user story so each story can be implemented and demonstrated on its own (Principle X).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: User story the task belongs to (US1–US4)
- Paths are relative to the repository root (single project, `src/` layout per plan.md)

## Global rules for every task

- No weights, thresholds, ticket cap or renewal horizon values in Python code. They exist only in `config/scoring.json` and in test fixtures (Principle III).
- Metric ranges are defined ONLY in `src/health_score/metrics.py` (`METRIC_RANGES`). Models, error messages and tests read them from there (Principle VI, FR-003).
- `src/health_score/scoring.py` MUST NOT import `fastapi`, `health_score.api`, `health_score.data`, `json`, `os`, `pathlib`, `datetime` or anything that does I/O (Principle II).
- All client names and values are fictitious (Principle IX).
- Field names are in English, as in data-model.md. The level values are exactly `"Top"`, `"Estable"` and `"En riesgo"`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create the directory layout from plan.md: `config/`, `data/`, `src/health_score/`, `src/health_score/data/`, `src/health_score/api/`, `tests/unit/`, `tests/contract/`, `tests/integration/`, with empty `src/health_score/data/__init__.py` and `src/health_score/api/__init__.py`
- [X] T002 Create `pyproject.toml` at the repo root: project `health-score`, `requires-python = ">=3.12"`, `src/` layout package `health_score`, runtime dependencies `fastapi`, `pydantic>=2`, `uvicorn`; optional extra `dev = ["pytest", "httpx"]`; `[tool.pytest.ini_options]` with `testpaths = ["tests"]` and `pythonpath = ["src"]`. No other dependencies (Principle I)
- [X] T003 [P] Create `.gitignore` at the repo root ignoring `.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `*.egg-info/`
- [X] T004 [P] Create `config/scoring.json` with the FR-012 defaults, matching `contracts/scoring-config.schema.json` exactly: `{"weights": {"usage": 25, "support_tickets": 25, "nps": 25, "renewal": 25}, "thresholds": {"top": 75, "at_risk": 50}, "normalization": {"ticket_cap": 10, "renewal_horizon_days": 180}}`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Single definition of metric ranges, the core Pydantic models, config loading, and the API app shell. Every user story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Create `src/health_score/metrics.py`: `Metric` enum (`USAGE="usage"`, `SUPPORT_TICKETS="support_tickets"`, `NPS="nps"`, `RENEWAL="days_to_renewal"`) and `METRIC_RANGES: dict[Metric, tuple[int, int | None]]` = USAGE (0, 100), SUPPORT_TICKETS (0, None), NPS (0, 10), RENEWAL (0, None). Both ends inclusive; `None` = no upper bound. Add a helper `range_message(metric) -> str` that builds the Spanish message from `METRIC_RANGES`: `"debe ser un entero entre 0 y 100"` when there is an upper bound, `"debe ser un entero mayor o igual a 0"` otherwise. This is the only place ranges are written
- [X] T006 Create `src/health_score/models.py` with the core models (all `frozen=True`, `extra="forbid"`): `ClientMetrics` with the four fields `usage`, `support_tickets`, `nps`, `days_to_renewal` as `StrictInt` constrained with `ge`/`le` read from `METRIC_RANGES` (all required; reject `5.0`, `"5"`, `true`, `null`, missing and extra fields, per research R6); `HealthLevel` str enum with values exactly `"Top"`, `"Estable"`, `"En riesgo"`; `SubScores` (`usage`, `support_tickets`, `nps`, `renewal`: float 0–100, 2 decimals); `ScoreResult` (`score`: int 0–100, `level`: HealthLevel, `sub_scores`: SubScores); `FieldError` (`field`: str e.g. `"metrics.nps"`, `message`: str)
- [X] T007 Create `src/health_score/config.py`: `ConfigError(Exception)`; Pydantic models `Weights` (`usage`, `support_tickets`, `nps`, `renewal`: number `ge=0`, booleans rejected), `Thresholds` (`top`, `at_risk`: StrictInt 0–100), `Normalization` (`ticket_cap`, `renewal_horizon_days`: StrictInt `gt=0`), `ScoringConfig` (`weights`, `thresholds`, `normalization`), all `frozen=True`, `extra="forbid"`, all fields required with NO defaults; `load_config(path: str | os.PathLike) -> ScoringConfig` that raises `ConfigError` when the file does not exist, is not valid JSON, or fails validation, with a message containing the field path (e.g. `thresholds.at_risk`) and the reason. Never returns a partial config
- [X] T008 Create `src/health_score/__init__.py` exporting the public API from contracts/python-api.md that exists so far: `ClientMetrics`, `ScoringConfig`, `ScoreResult`, `SubScores`, `HealthLevel`, `FieldError`, `ConfigError`, `Metric`, `METRIC_RANGES`, `load_config` (with `__all__`)
- [X] T009 Create `src/health_score/api/app.py` app shell: `create_app(config: ScoringConfig) -> FastAPI` that stores the config and exposes it through a dependency `get_config()`; module-level `app` built by loading the path in env var `HEALTH_SCORE_CONFIG` (default `config/scoring.json`) with `load_config`, so an invalid config raises `ConfigError` and the service does not start (research R7). Title and description set for OpenAPI. No endpoints yet
- [X] T010 Create `tests/conftest.py` with fixtures: `default_config` (a `ScoringConfig` built in-test with the FR-012 values 25/25/25/25, 75/50, 10/180), `config_factory(**overrides)` returning a `ScoringConfig` with nested overrides, `write_config(tmp_path, data)` writing a JSON file and returning its path, and `client` (FastAPI `TestClient(create_app(default_config))`)

**Checkpoint**: `pytest` collects with no errors; `from health_score import load_config; load_config('config/scoring.json')` works.

---

## Phase 3: User Story 1 - Calcular el score y nivel de un cliente (Priority: P1) 🎯 MVP

**Goal**: Given the four metrics of one client, return a 0–100 integer score, its level and the four sub-scores, from both the library and `POST /score`.

**Independent Test**: `POST /score` with `{usage:60, support_tickets:3, nps:7, days_to_renewal:90}` returns 200, `score: 63`, `level: "Estable"`, sub-scores 60/70/70/50; with `nps: 11` returns 422 pointing at `nps`.

### Tests for User Story 1 ⚠️ (write first, must FAIL)

- [X] T011 [P] [US1] Write `tests/unit/test_metrics_validation.py`: `ClientMetrics` accepts the inclusive limits (usage 0 and 100, support_tickets 0, nps 0 and 10, days_to_renewal 0, plus a large tickets/days value like 10_000); rejects usage −1 and 101, nps −1 and 11, support_tickets −1, days_to_renewal −1, decimals (`5.0`, `2.5`), strings (`"5"`), booleans (`True`), `None`, each missing field, and an extra field; each rejection's error `loc` names the offending field. Parametrize bounds from `METRIC_RANGES` rather than repeating numbers where possible
- [X] T012 [P] [US1] Write `tests/unit/test_scoring.py` with `default_config`: (a) usage 90 / tickets 0 / nps 9 / days 300 → score 95, level Top, sub-scores 90/100/90/100; (b) 60/3/7/90 → 63 Estable, sub-scores 60.0/70.0/70.0/50.0 (62.5 rounds half-up to 63, research R2); (c) 10/15/2/10 → 9, En riesgo, tickets sub-score 0 (above cap); (d) days above horizon → renewal sub-score 100; (e) all-boundary inputs (0/0/10/0 and 100/0/10/0, 0/10/0/0) → 0 ≤ score ≤ 100; (f) determinism: same input twice → equal `ScoreResult`; (g) `classify` at exactly 75 → Top, 74 → Estable, exactly 50 → Estable, 49 → En riesgo; (h) a weight of 0 means that metric has no effect on the score
- [X] T013 [P] [US1] Write `POST /score` tests in `tests/contract/test_http_api.py` using the `client` fixture: 200 body for 60/3/7/90 equals the contract example exactly (`{"score": 63, "level": "Estable", "sub_scores": {"usage": 60.0, "support_tickets": 70.0, "nps": 70.0, "renewal": 50.0}}`); 422 for `nps: 11` with `detail[*].loc` containing `"nps"`; 422 for `support_tickets: 2.5`, `usage: "60"`, a missing field and an extra field

### Implementation for User Story 1

- [X] T014 [US1] Create `src/health_score/scoring.py` with pure functions only (no I/O, no date, no globals besides imports): `sub_scores(metrics, config) -> dict[Metric, Fraction]` using research R1 (usage → `usage`; tickets → `100 × (1 − min(tickets, ticket_cap) / ticket_cap)`; nps → `nps × 10`; renewal → `100 × min(days, renewal_horizon_days) / renewal_horizon_days`) with exact `fractions.Fraction` arithmetic (convert weights via `Fraction(str(w))`); `compute_score(subs, config) -> int` = Σ(weight × sub) / Σ(weights), rounded half-up to an int with exact Fraction math (NOT built-in `round()` on floats); `classify(score, config) -> HealthLevel` (Top if score ≥ `thresholds.top`, En riesgo if score < `thresholds.at_risk`, else Estable; this is the only place the rule lives); `score_client(metrics: ClientMetrics, config: ScoringConfig) -> ScoreResult` exposing sub-scores as floats rounded to 2 decimals for display only
- [X] T015 [US1] Export `score_client` and `classify` from `src/health_score/__init__.py` and add them to `__all__`
- [X] T016 [US1] Add `POST /score` to `src/health_score/api/app.py`: request body `ClientMetrics`, `response_model=ScoreResult`, `responses={422: {...}}` with a description, delegates to `score_client(metrics, get_config())` and nothing else
- [X] T017 [US1] Run `pytest tests/unit/test_metrics_validation.py tests/unit/test_scoring.py tests/contract/test_http_api.py` and make all US1 tests pass; then run quickstart.md §2 (library one-liner prints `score=63`, `level='Estable'`)

**Checkpoint**: US1 is the MVP. One client can be scored via the library and via `POST /score`; invalid metrics are rejected naming the field.

---

## Phase 4: User Story 2 - Ajustar pesos y umbrales sin tocar la lógica (Priority: P2)

**Goal**: Weights, thresholds, ticket cap and renewal horizon change results only through `config/scoring.json`; invalid configs are rejected with a message naming the field; the active config is visible at `GET /config`.

**Independent Test**: The same client scored with two configs gives different results as expected (NPS weight doubled → higher score; `top` 75 → 70 turns a 72 from Estable to Top); each invalid config in FR-011 raises `ConfigError`.

### Tests for User Story 2 ⚠️ (write first, must FAIL)

- [X] T018 [P] [US2] Write `tests/unit/test_config.py` using `write_config`: `load_config('config/scoring.json')` equals the FR-012 defaults; `ConfigError` (message contains the field path) for: missing file, invalid JSON, each missing top-level section and each missing nested key, an extra key, a negative weight, all weights 0 (`weights`), `top` or `at_risk` outside 0–100, `at_risk == top` and `at_risk > top` (`thresholds`), `ticket_cap` 0 and −1, `renewal_horizon_days` 0, a non-integer threshold (`75.5`), a boolean weight. Also: a single weight of 0 with the rest positive is VALID; weights 1/1/1/1 give the same scores as 25/25/25/25
- [X] T019 [P] [US2] Add config-sensitivity tests to `tests/unit/test_scoring.py` using `config_factory`: (a) client usage 20 / tickets 8 / nps 10 / days 20 scores higher with `weights.nps = 50` (others 25) than with defaults; (b) client 80/3/7/120 scores 72 → `Estable` with default thresholds and `Top` with `thresholds.top = 70`; (c) changing `ticket_cap` and `renewal_horizon_days` changes the corresponding sub-scores
- [X] T020 [P] [US2] Add to `tests/contract/test_http_api.py`: `GET /config` returns 200 and the active config as JSON equal to the defaults; a `TestClient(create_app(config_factory(thresholds={"top": 60, "at_risk": 50})))` returns `level: "Top"` for 60/3/7/90 (quickstart §4); importing/building the app with `HEALTH_SCORE_CONFIG` pointing at a config with `at_risk: 80`, `top: 75` raises `ConfigError` mentioning `thresholds` (use `monkeypatch.setenv` and `importlib.reload`, or a factory function `app_from_env()` called in the test)

### Implementation for User Story 2

- [X] T021 [US2] Add cross-field validators to `src/health_score/config.py`: `Weights` → "la suma de los pesos debe ser mayor que 0" when all are 0; `Thresholds` → "at_risk debe ser menor que top" when `at_risk >= top`. Make sure `load_config` turns every Pydantic error into a `ConfigError` whose message lists each failing path joined with dots (e.g. `thresholds: at_risk debe ser menor que top`) and the reason
- [X] T022 [US2] Add `GET /config` to `src/health_score/api/app.py` with `response_model=ScoringConfig`, returning `get_config()`; if needed for T020, factor env loading into `app_from_env() -> FastAPI` and set `app = app_from_env()`
- [X] T023 [US2] Run `pytest tests/unit/test_config.py tests/unit/test_scoring.py tests/contract/test_http_api.py` and make all US2 tests pass

**Checkpoint**: US1 and US2 work independently; changing `config/scoring.json` and restarting changes results without touching code.

---

## Phase 5: User Story 3 - Evaluar una cartera completa (Priority: P3)

**Goal**: Score many clients in one request (sent in the body or read from the stored portfolio), one result per client in input order, invalid clients reported with their errors without stopping the rest, plus a per-level summary.

**Independent Test**: A 20-client fictitious portfolio returns 20 results with Top + Estable + En riesgo = 20; with 1 invalid client, 19 are scored and 1 carries `errors`; an empty portfolio returns all counts at 0.

### Tests for User Story 3 ⚠️ (write first, must FAIL)

- [X] T024 [P] [US3] Write `tests/unit/test_portfolio.py`: 20 valid fictitious `Client`s → 20 results in input order and `by_level` sums to 20, `invalid == 0`; 19 valid + 1 invalid record → 19 `result`s, 1 entry with `result is None` and `errors == [FieldError(field="metrics.usage", message="debe ser un entero entre 0 y 100")]`, `invalid == 1`, invariant `Top + Estable + En riesgo + invalid == total`; empty input → `total 0`, all three `by_level` keys present with 0, `invalid 0`; each entry has exactly one of `result`/`errors`; 1,000 clients score in < 5 s (SC-003)
- [X] T025 [P] [US3] Write `tests/integration/test_local_repository.py` using a temp JSON file: `LocalJsonClientRepository(path).list_clients()` returns valid `Client`s and keeps invalid records as errors (with `client_id` when present); `get_client("C-001")` returns it, an unknown id returns `None`; the shipped `data/clients.json` loads with 20 clients and no errors
- [X] T026 [P] [US3] Add portfolio tests to `tests/contract/test_http_api.py`: `POST /portfolio/score` with the http-api.md example → 200 and body equal to the contract example (C-002 has `errors: [{"field": "metrics.usage", "message": "debe ser un entero entre 0 y 100"}]`, `summary.invalid: 1`); `{"clients": []}` → 200, `total: 0`; 422 for missing `clients`, `clients` not a list, an element without `client_id` or `metrics`, and duplicate `client_id`s; `GET /portfolio` → 200 and the invariant holds; `GET /clients/C-001/score` → 200 `ClientScoreResult`; `GET /clients/NO-EXISTE/score` → 404 with `{"detail": "Cliente 'NO-EXISTE' no encontrado"}`. Use a test repository fixture injected via `create_app`

### Implementation for User Story 3

- [X] T027 [US3] Add portfolio models to `src/health_score/models.py`: `Client` (`client_id`: non-empty str; `name`: `str | None` = None; `metrics`: ClientMetrics); `InvalidClient` (`client_id`: str, `name`: str | None, `errors`: list[FieldError]) representing an invalid record; `ClientInput = Client | InvalidClient`; `ClientScoreResult` (`client_id`, `name`, `result`: ScoreResult | None, `errors`: list[FieldError] | None, with a validator that exactly one of `result`/`errors` is set); `PortfolioSummary` (`total`: int, `by_level`: dict with the three keys `"Top"`, `"Estable"`, `"En riesgo"` always present, `invalid`: int); `PortfolioResult` (`results`: list[ClientScoreResult], `summary`: PortfolioSummary). Add a boundary helper `validate_client_record(raw: dict) -> ClientInput` that runs `ClientMetrics.model_validate` on `raw["metrics"]` and converts each Pydantic error into `FieldError(field="metrics.<name>", message=range_message(metric))` for range/type errors (use a generic Spanish message for missing/extra fields)
- [X] T028 [US3] Add `score_portfolio(clients: Iterable[ClientInput], config: ScoringConfig) -> PortfolioResult` to `src/health_score/scoring.py`: preserves order, calls `score_client` for each `Client`, copies errors for each `InvalidClient`, builds the summary. Still pure (no I/O)
- [X] T029 [P] [US3] Create `src/health_score/data/repository.py`: `ClientRepository` `typing.Protocol` with `list_clients() -> list[ClientInput]` and `get_client(client_id: str) -> ClientInput | None`
- [X] T030 [P] [US3] Create `data/clients.json`: a JSON list of 20 fictitious clients (`client_id` `"C-001"`…`"C-020"`, invented names like "Acme Ficticia", "Globex Demo"), all valid, spread so the defaults give a mix of Top, Estable and En riesgo
- [X] T031 [US3] Create `src/health_score/data/local_json.py`: `LocalJsonClientRepository(path)` implementing `ClientRepository`; reads the JSON list, validates each record's structure (`client_id`, `name`, `metrics`) and metrics with `validate_client_record`, keeps invalid records as `InvalidClient` (research R9). Export it from `src/health_score/data/__init__.py`
- [X] T032 [US3] Export `Client`, `ClientScoreResult`, `PortfolioResult`, `score_portfolio` from `src/health_score/__init__.py` (add to `__all__`)
- [X] T033 [US3] Extend `src/health_score/api/app.py`: `create_app(config, repository: ClientRepository)` with a `get_repository()` dependency; `app_from_env()` builds `LocalJsonClientRepository` from env var `HEALTH_SCORE_CLIENTS` (default `data/clients.json`); update the `client` fixture in `tests/conftest.py` to pass an in-memory test repository
- [X] T034 [US3] Add portfolio endpoints to `src/health_score/api/app.py` per contracts/http-api.md: `POST /portfolio/score` with a request model `PortfolioRequest` (`clients`: list of `RawClient` with required `client_id: str`, optional `name`, `metrics: dict` — structure only, research R5) and a validator rejecting duplicate `client_id`s (→ 422); each element goes through `validate_client_record` then `score_portfolio`; `response_model=PortfolioResult`, `responses={422: ...}`. `GET /portfolio` → `score_portfolio(repository.list_clients(), config)`, `response_model=PortfolioResult`. `GET /clients/{client_id}/score` → `ClientScoreResult`, raises `HTTPException(404, f"Cliente '{client_id}' no encontrado")`, `responses={404: ...}`
- [X] T035 [US3] Run `pytest tests/unit/test_portfolio.py tests/integration/test_local_repository.py tests/contract/test_http_api.py` and make all US3 tests pass

**Checkpoint**: Portfolio scoring works from the body and from stored data; one bad client never fails the whole request.

---

## Phase 6: User Story 4 - Uso desde distintas interfaces (Priority: P3)

**Goal**: The library and the HTTP API return identical results for the same input and config, and the API is fully documented in OpenAPI.

**Independent Test**: `tests/integration/test_interface_parity.py` passes; `/docs` shows all 5 endpoints with schemas and 404/422 responses.

### Tests for User Story 4 ⚠️ (write first, must FAIL)

- [X] T036 [P] [US4] Write `tests/integration/test_interface_parity.py`: for a parametrized set of metric inputs (the quickstart scenarios plus all boundary combos and a seeded `random.Random(0)` sample of ~200 valid inputs) and for both the default config and a non-default one, `score_client(...).model_dump(mode="json")` equals `POST /score` JSON; `score_portfolio(...)` equals `POST /portfolio/score` for the same clients (SC-005)
- [X] T037 [P] [US4] Add OpenAPI tests to `tests/contract/test_http_api.py`: `GET /openapi.json` lists `POST /score`, `POST /portfolio/score`, `GET /portfolio`, `GET /clients/{client_id}/score`, `GET /config`; each has a 200 response schema referencing the right model; both POSTs declare 422; `GET /clients/{client_id}/score` declares 404; component schemas use the data-model.md field names

### Implementation for User Story 4

- [X] T038 [US4] Complete OpenAPI metadata in `src/health_score/api/app.py`: `summary` and `description` (Spanish) on each endpoint, descriptions on the 404/422 `responses`, `tags` (`scoring`, `cartera`, `configuración`), and `Field(description=..., examples=...)` on public models in `src/health_score/models.py` and `src/health_score/config.py` so `/docs` explains inputs, outputs and errors without reading code (US4 scenario 2)
- [X] T039 [US4] Run `pytest tests/integration/test_interface_parity.py tests/contract/test_http_api.py` and make all US4 tests pass

**Checkpoint**: All user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T040 [P] Add an architecture test `tests/unit/test_architecture.py` that parses `src/health_score/scoring.py` with `ast` and fails if it imports `fastapi`, `health_score.api`, `health_score.data`, `json`, `os`, `pathlib`, `datetime`, `time` or `random` (Principle II), and that the literals 75, 50, 180 do not appear in `src/health_score/**/*.py` (Principle III)
- [X] T041 [P] Add a single-client timing test to `tests/contract/test_http_api.py`: `POST /score` completes in < 1 s (SC-002)
- [X] T042 [P] Write `README.md` at the repo root (Spanish): purpose, install (`pip install -e ".[dev]"`), run tests, run the API (`uvicorn health_score.api.app:app`), env vars `HEALTH_SCORE_CONFIG` and `HEALTH_SCORE_CLIENTS`, how to change weights/thresholds (edit `config/scoring.json`, restart), library usage example, link to `specs/001-customer-health-scoring/quickstart.md`
- [X] T043 Review all comments in `src/health_score/` and remove any that restate the code; keep only *why* comments (e.g. why `Fraction` and half-up rounding, why per-client validation in portfolios) (Principle I)
- [X] T044 Check `data/clients.json`, `tests/` and `README.md` contain only fictitious names and values (Principle IX)
- [X] T045 Run the full `pytest` suite and every step of `specs/001-customer-health-scoring/quickstart.md` (§1–§4, including the invalid-config startup failure and restoring 75/50); fix any mismatch

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on Foundational. Its sensitivity tests (T019, T020) call `score_client` and `POST /score`, so in practice it follows US1
- **US3 (Phase 5)**: Depends on US1 (`score_client`, `POST /score` app wiring)
- **US4 (Phase 6)**: Depends on US1 (single-client parity) and US3 (portfolio parity and the full endpoint list)
- **Polish (Phase 7)**: Depends on all user stories

### Story completion order

```text
Setup → Foundational → US1 (MVP) ─┬─► US2
                                  └─► US3 ─► US4 → Polish
```

US2 and US3 can proceed in parallel after US1.

### Within Each User Story

- Tests first, confirmed failing
- Models → pure scoring functions → data adapters → API endpoints
- `tests/contract/test_http_api.py`, `src/health_score/api/app.py`, `src/health_score/models.py` and `src/health_score/scoring.py` are shared files: tasks touching them in different stories must not run at the same time

### Parallel Opportunities

- Setup: T003, T004
- US1 tests: T011, T012, T013
- US2 tests: T018, T019, T020
- US3 tests: T024, T025, T026; implementation T029, T030 in parallel with T027
- US4 tests: T036, T037
- Polish: T040, T041, T042
- After US1: US2 and US3 by different people (coordinate on `app.py` and `test_http_api.py`)

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together:
Task: "Write tests/unit/test_metrics_validation.py (bounds, invalid values)"
Task: "Write tests/unit/test_scoring.py (normal cases, rounding, classify, determinism)"
Task: "Write POST /score tests in tests/contract/test_http_api.py"
```

## Parallel Example: User Story 3

```bash
# Tests:
Task: "Write tests/unit/test_portfolio.py"
Task: "Write tests/integration/test_local_repository.py"
Task: "Write portfolio tests in tests/contract/test_http_api.py"

# Independent implementation files:
Task: "Create ClientRepository protocol in src/health_score/data/repository.py"
Task: "Create 20 fictitious clients in data/clients.json"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US1
4. **STOP and VALIDATE**: `POST /score` with the quickstart scenarios (95 Top, 63 Estable, 9 En riesgo, 422 on `nps: 11`)
5. Demo

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → single-client scoring (MVP)
3. US2 → config validation and `GET /config`; demo by editing `config/scoring.json`
4. US3 → portfolio endpoints and the local repository
5. US4 → parity test and complete OpenAPI docs
6. Polish → architecture guard, README, full quickstart run

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- Expected values in tests come from research R1/R2 and quickstart.md; do not change them to make tests pass
- Commit after each task or logical group
- Stop at any checkpoint to validate the story on its own
