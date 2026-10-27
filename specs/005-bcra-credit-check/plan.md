# Implementation Plan: Consulta de Situación Crediticia en el BCRA al Dar de Alta un Cliente

**Branch**: `005-bcra-credit-check` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-bcra-credit-check/spec.md`

## Summary

Cuando en "Nuevo cliente" el campo "CUIT/CUIL" pierde el foco, el dashboard valida el CUIT
(formato y dígito verificador) y, si es válido, llama a `POST /credit-status`. El servicio
vuelve a validarlo, consulta la Central de Deudores del BCRA con los 11 dígitos sin guiones y
valida la respuesta. Si hay deudas, le pide a Claude un texto descriptivo en español, guiado
por un prompt versionado en `config/prompts/`. El dashboard muestra ese texto con un tono
visual que calcula el servicio sin IA. Nada se guarda ni se registra en logs.

Enfoque técnico (detalle en [research.md](research.md)):

- **Endpoint**: `POST /credit-status` con el CUIT en el cuerpo, para que no quede en los access
  logs de uvicorn ni de nginx (R1). Los cuatro resultados responden 200 con un `status`, y
  solo un CUIT inválido da 422 (R2).
- **Paquete nuevo `health_score/credit/`**, separado del scoring (Principio II), con dos
  interfaces de acceso (Principio IV):
  - `BcraSource`, implementada por `HttpBcraSource` con `urllib.request` de la biblioteca
    estándar (R3).
  - `Summarizer`, implementada por `ClaudeSummarizer` con el SDK `anthropic` (R5).
  - Las respuestas del BCRA se validan con modelos Pydantic (R4).
- **Datos calculados sin IA**: período, peor situación, total en pesos y atrasos se calculan
  en código y se envían al modelo junto con la respuesta completa del BCRA (R8). El tono
  también lo calcula el código (R10).
- **Llamada al modelo**: `claude-opus-5-5` (configurable) con esfuerzo `low`,
  `max_tokens=2000`, 15 s de tiempo límite y sin reintentos automáticos (R5, R6). La API key se
  lee de un Docker secret (R7).
- **Dashboard**: `lib/cuit.ts` valida con los mismos casos que el servicio, a través de un
  JSON de casos compartido (R11). El hook `useCreditCheck` evita consultas duplicadas, aborta
  y reintenta (R12). `ClientFields` suma dos props opcionales.
- **Docker**: una red `egress` solo para `api`, con la excepción documentada (R13).

## Technical Context

**Language/Version**: Python >= 3.12; TypeScript (React 19 + Vite, existentes)

**Primary Dependencies**: FastAPI, Pydantic v2, SQLAlchemy, uvicorn (existentes);
**`anthropic` 1.x** (nueva, justificada abajo); `urllib.request` y `json` de la biblioteca
estándar para el BCRA. Frontend sin dependencias nuevas.

**Storage**: N/A. La feature no persiste nada (FR-024).

**Testing**: pytest + httpx (backend), con `FakeBcraSource`/`FakeSummarizer` y `monkeypatch`;
Vitest + Testing Library (frontend). Sin red en ninguna prueba.

**Target Platform**: igual que antes (local o contenedores Docker en un host), más salida a
internet desde `api` hacia `api.bcra.gob.ar` y `api.anthropic.com`.

**Project Type**: web-service (`src/health_score`) + web app (`frontend/`)

**Performance Goals**: texto visible en menos de 10 s en el 95 % de los casos (SC-001); aviso
de falla en menos de 30 s (SC-005), con un tiempo límite de 28 s en el dashboard (R6). Presupuesto: 10 s del BCRA + 15 s del modelo, sin
reintentos.

**Constraints**:
- No guardar ni registrar en logs el CUIT, la denominación, la deuda, el prompt ni el texto.
- La API key nunca va en `ENV`, en la imagen ni en el repositorio.
- Las pruebas no salen a la red.
- Endpoints y pruebas existentes sin cambios.

**Scale/Scope**: una consulta por CUIT en el alta; uso interno, pocas personas.

### Justificación de dependencias nuevas (Principio I)

| Dependencia | Problema que resuelve | Por qué la biblioteca estándar no basta |
|-------------|-----------------------|------------------------------------------|
| `anthropic` (SDK oficial de Python, 1.x) | Llamar a Claude para redactar el texto (FR-015): autenticación, tipos de respuesta, `stop_reason`, errores tipados (`APITimeoutError`, `RateLimitError`…) y tiempo límite por solicitud | Con `urllib` habría que reimplementar los encabezados, la serialización, el parseo de bloques de contenido y la clasificación de errores, que son justamente lo que el SDK mantiene al día. La guía de Anthropic recomienda el SDK oficial frente a HTTP a mano |

El BCRA **no** suma dependencia: se consulta con `urllib.request` (R3). El SDK trae `httpx2`
como dependencia transitiva, y el código propio no la usa.

### Proveedor del modelo (constitución v2.4.0, Principio IX)

Anthropic (Claude). Según sus términos comerciales, las entradas y salidas de la API no se
usan para entrenar modelos. Se envía la respuesta completa del BCRA, incluidos CUIT y
denominación (clarificación del 2026-10-26). **Antes de usarlo con datos reales** hay que
confirmar que la API key pertenece a una cuenta bajo esos términos (R5) y anotarlo en el
README. Es una puerta explícita del plan de tareas (T050b): sin esa confirmación no se hace
la demo con datos reales.

## Constitution Check

*GATE: debe pasar antes de Phase 0. Re-evaluado tras el diseño de Phase 1.*

| # | Principio | Cumple | Cómo |
|---|-----------|--------|------|
| I | Simplicidad | Sí | Una sola dependencia nueva, justificada arriba. El BCRA se consulta con la biblioteca estándar. No hay proxy de salida (R13) ni caché, y no se agregan librerías al frontend |
| II | Separación | Sí | `credit/` no importa `scoring` ni al revés; el scoring sigue siendo puro. El dashboard no interpreta la respuesta del BCRA ni calcula nada de crédito: solo valida el CUIT antes de consultar |
| III | Config externa | Sí | Sin pesos ni umbrales nuevos. El prompt, el modelo y la URL del BCRA son configuración externa (`config/prompts/`, variables de entorno) |
| IV | Adapter | Sí | `BcraSource` y `Summarizer` son Protocols; se inyectan en `create_app` y se reemplazan por versiones simuladas en las pruebas |
| V | Validación en el límite | Sí | Cuerpo con el tipo `Cuil`; la respuesta del BCRA se valida con Pydantic antes de usarla; la salida del modelo se valida (`stop_reason`, largo, vacío). La validación del dashboard es solo una mejora de uso: el servicio no depende de ella |
| VI | Reglas únicas | Sí, con 1 excepción documentada | FR-003 exige comprobar el dígito verificador **en el dashboard y en el servicio**: queda en `cuil.py` y en `lib/cuit.ts`, una vez en cada lado, con **un solo** archivo de casos para los dos (R11; ver Complexity Tracking). Tono y textos fijos solo en `credit/service.py`; descripciones de situación solo en el prompt |
| VII | Pruebas | Sí | pytest para validación, interpretación, tono, fallas y logs; Vitest para el flujo de UI; casos normales, límite e inválidos del CUIT compartidos |
| VIII | API documentada | Sí | `POST /credit-status` con `CreditStatusRequest`/`CreditStatus`, `summary`, `description` y 422 declarado ([contrato](contracts/http-api-changes.md)) |
| IX | Privacidad (v2.4.0) | Sí, con la excepción de consulta en tiempo de uso | Datos reales solo en tiempo de uso; nada se guarda ni se registra (POST para que el CUIT no llegue a los access logs); el proveedor no entrena con los datos (a confirmar con la cuenta, T050b); pruebas, fixtures y demos con CUIT sintéticos y entidades ficticias. Las pruebas y las demos usan fuentes simuladas: las demos, con `FixtureBcraSource` y `DemoSummarizer` (`HEALTH_SCORE_DEMO_FIXTURES`), nunca el BCRA ni el modelo reales. La revisión manual del prompt (FR-028, T045) usa el modelo real con fixtures ficticios, solo a mano, como permite la v2.4.0 |
| X | Incremental | Sí | US2 (validación) se demuestra sin backend nuevo; US1 sobre US2; US3 y US4 sobre US1 ([quickstart](quickstart.md)) |
| — | Contenedores y despliegue | Sí, con 1 excepción documentada | La API key va como Docker secret, nunca en `ENV`; el prompt se monta `:ro`. Excepción: la red `egress` no restringe dominios (R13), documentada en `compose.yaml` y `SECURITY-DOCKER.md` |

Sin violaciones sin justificar; ver Complexity Tracking.

**Re-evaluación tras Phase 1**: el diseño mantiene los diez principios. El riesgo de
privacidad detectado en el diseño (el CUIT en la URL quedaría en los access logs) se resolvió
con `POST` (R1).

## Project Structure

### Documentation (this feature)

```text
specs/005-bcra-credit-check/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api-changes.md
│   ├── ui-credit-check.md
│   └── bcra-summary-prompt.md   # versión 1 del prompt, para iterar
├── checklists/requirements.md
└── tasks.md                     # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
src/health_score/
├── credit/                      # NUEVO paquete (no lo importa el scoring)
│   ├── __init__.py              # exporta check_credit, BcraSource, Summarizer, CreditStatus
│   ├── models.py                # BcraDebtResponse…BcraEntity, CreditFacts, CreditStatus(Request)
│   ├── bcra.py                  # BcraSource (Protocol), HttpBcraSource (urllib), BcraLookup
│   ├── summarizer.py            # Summarizer (Protocol), ClaudeSummarizer, load_prompt
│   ├── demo.py                  # FixtureBcraSource, DemoSummarizer (solo modo demo)
│   └── service.py               # check_credit(), compute_facts(), tone_for(), textos fijos
└── api/app.py                   # + POST /credit-status; create_app(…, credit_source, summarizer);
                                 #   app_from_env lee BCRA_URL, prompt, modelo y API key

config/prompts/bcra-summary.md   # NUEVO: el prompt (montado :ro en Docker)

frontend/src/
├── lib/cuit.ts (+ cuit.test.ts) # NUEVO: validateCuit
├── api/types.ts                 # + CreditStatus
├── api/client.ts                # + getCreditStatus
├── components/ClientFields.tsx  # + onCuilBlur, cuilStatus (opcionales)
└── pages/new-client/
    ├── useCreditCheck.ts        # NUEVO
    ├── CreditStatusPanel.tsx    # NUEVO
    ├── NewClientPage.tsx        # conecta el flujo
    └── NewClientPage.test.tsx   # + escenarios US1–US4

tests/
├── fixtures/
│   ├── cuil_cases.json          # NUEVO: casos compartidos backend/frontend
│   ├── bcra-demo.json           # NUEVO: índice CUIT sintético → fixture para la demo
│   └── bcra/*.json              # NUEVO: respuestas ficticias del BCRA (situaciones 1–5,
│                                #   varias entidades, atrasos, marcas, datos incompletos)
├── unit/
│   ├── test_cuil.py             # + casos desde cuil_cases.json
│   ├── test_bcra_source.py      # NUEVO: urlopen simulado
│   ├── test_credit_service.py   # NUEVO: facts, tono, textos fijos, flujo
│   ├── test_summarizer.py       # NUEVO: cliente falso; timeout, refusal, vacío, largo
│   ├── test_summarizer_from_env.py  # NUEVO: credenciales desde archivo o variable
│   └── test_credit_demo.py      # NUEVO: modo demo sin red
├── integration/test_credit_status_api.py   # NUEVO: endpoint completo con fakes; logs sin datos
└── contract/test_http_api.py    # + prueba OpenAPI de /credit-status (EXPECTED_ENDPOINTS intacto)

scripts/review_bcra_prompt.py    # NUEVO: revisión manual del prompt con el modelo real (FR-028)

pyproject.toml                   # + anthropic
compose.yaml                     # + red egress (solo api), secreto anthropic_api_key,
                                 #   montaje :ro del prompt, ANTHROPIC_API_KEY_FILE
compose.demo.yaml                # NUEVO: override de demo (fuentes simuladas, fixtures :ro)
Dockerfile                       # copia config/prompts/ en la imagen api
.gitignore                       # + secrets/
SECURITY-DOCKER.md               # + excepción de salida y manejo del secreto
README.md                        # + consulta al BCRA, variables nuevas, API key, términos del proveedor
```

**Structure Decision**: se mantiene el proyecto existente. La integración externa es un
paquete nuevo, `credit/`, al lado de `data/` y aislado del scoring. En el frontend, la lógica
nueva vive en `lib/cuit.ts` y en `pages/new-client/`; el único componente compartido que
cambia (`ClientFields`) lo hace con props opcionales.

## Complexity Tracking

| Decisión | Por qué se necesita | Alternativa más simple descartada porque |
|----------|---------------------|------------------------------------------|
| Regla del dígito verificador en Python **y** TypeScript (excepción al Principio VI) | FR-003 exige la comprobación en los dos lados: el dashboard, para no consultar si el CUIT es inválido sin ir al servidor; el servicio, porque no puede depender del cliente (Principio V) | Validar solo en el servidor obliga a una solicitud por cada CUIT mal escrito; se mitiga con un único archivo de casos que prueban las dos implementaciones |
| Red `egress` sin restricción por dominio | El servicio necesita salir al BCRA y a Anthropic | Un proxy de salida con lista de dominios permitidos cumple mejor FR-030, pero suma una imagen y su endurecimiento; queda documentado como mejora para producción |
