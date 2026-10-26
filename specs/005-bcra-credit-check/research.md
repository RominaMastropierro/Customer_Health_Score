# Research: Consulta de Situación Crediticia en el BCRA

No quedan `NEEDS CLARIFICATION`. Cada decisión indica qué requisito resuelve.

## R1. Forma de la operación: `POST /credit-status` con el CUIT en el cuerpo

- **Decisión**: `POST /credit-status` con cuerpo `{"cuil": "<11 dígitos o XX-XXXXXXXX-X>"}`.
  El campo usa el tipo `Cuil` existente (`health_score/cuil.py`), que normaliza y valida el
  dígito verificador. Un CUIT inválido da 422 con `loc = ["body", "cuil"]`, igual que el alta.
- **Rationale**: FR-024 prohíbe registrar en logs el CUIT consultado. Uvicorn (access log) y
  nginx (`access_log`) registran la ruta de cada solicitud, así que un `GET
  /credit-status/{cuit}` dejaría el CUIT en los logs de los dos contenedores. En el cuerpo no
  aparece. Además, `frontend/src/api/client.ts` ya asocia el error de `["body", "cuil"]` al
  campo "CUIT/CUIL" (FR-010) sin cambios.
- **Alternativas**: `GET` con el CUIT en la ruta o en la query (más REST, pero filtra el dato a
  los logs; desactivar los access logs ocultaría también el resto del tráfico); anidarlo en
  `/clients/...` (no es un recurso de la cartera: el cliente aún no existe).

## R2. Los cuatro resultados son 200; solo un CUIT inválido es un error HTTP

- **Decisión**: la respuesta siempre es `200` con `CreditStatus` (ver
  [data-model](data-model.md)), cuyo `status` es `with_debts`, `no_data`, `bcra_unavailable` o
  `summary_unavailable`. Solo el CUIT inválido da `422`. Si nuestro servicio está caído, el
  dashboard recibe el error de conexión o el `502/504` de nginx, y muestra el mismo aviso con
  "Reintentar" (US4, escenario 4).
- **Rationale**: la consulta funcionó aunque el BCRA o el modelo hayan fallado: lo que cambia
  es qué se le dice a la persona. Usar un `503` para eso mezclaría "nuestro servicio no anda"
  con "el BCRA no anda", y el dashboard tendría que leer el cuerpo de un error para elegir el
  mensaje. Con el texto ya listo en `message` (FR-020), el dashboard no interpreta nada
  (FR-011, FR-021).
- **Alternativas**: `404` para "sin datos" y `503`/`504` para los dos casos de "no
  disponible". Se descarta porque "sin datos" es un resultado normal (US4) y no un error.

## R3. Cliente HTTP del BCRA: `urllib.request` de la biblioteca estándar

- **Decisión**: `HttpBcraSource` usa `urllib.request.urlopen(Request(url), timeout=10)` contra
  `https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/{11 dígitos}`. La URL base es
  configurable con `HEALTH_SCORE_BCRA_URL`, para usar un servidor simulado en una demo.
  `HTTPError` 404 se traduce a "sin datos"; cualquier otro `HTTPError` (400, 429, 5xx),
  `URLError`, `TimeoutError` o JSON inválido, a "BCRA no disponible".
- **Rationale**: Principio I. Es un único `GET` síncrono sin autenticación, y los endpoints
  de FastAPI del proyecto son síncronos (corren en el pool de hilos). La biblioteca estándar
  alcanza y no se agrega una dependencia más.
- **Alternativas**: `httpx` (hoy solo es dependencia de desarrollo; agregarla al runtime para
  un `GET` no se justifica); `httpx2`, que entra con el SDK de Anthropic (es una dependencia
  transitiva y no conviene acoplarse a ella).
- **Riesgo a verificar al implementar**: la cadena TLS de `api.bcra.gob.ar` ha dado problemas
  de verificación con algunos almacenes de certificados. Si pasa, se agrega el certificado
  intermedio al almacén de la imagen. **Nunca** se desactiva la verificación TLS.

## R4. Validación de la respuesta del BCRA con Pydantic

- **Decisión**: modelos `BcraDebtResponse` → `BcraResults` → `BcraPeriod` → `BcraEntity`, con
  `extra="ignore"`, para tolerar campos nuevos que agregue el BCRA. `situacion`, `monto` y
  `diasAtrasoPago` son opcionales y `situacion` no se restringe a 1–5, así una entidad
  incompleta no invalida toda la respuesta (Edge Cases). Si falta `results`, `periodos` no es
  una lista o un tipo no coincide, se devuelve "BCRA no disponible" (FR-011).
- **Rationale**: Principio V (validar en el límite). Es tolerante con lo que el manual
  describe como posible y estricto con la estructura.
- **"Sin datos" adicional**: un `200` con `periodos` vacío, o cuyo período más reciente no
  tiene entidades, se trata igual que el `404` del BCRA (no hay deudas que describir).

## R5. Proveedor de IA: Claude (Anthropic) con el SDK oficial `anthropic`

- **Decisión**: el SDK de Python `anthropic` (1.x), con el modelo `claude-opus-5-5`
  (configurable con `HEALTH_SCORE_SUMMARY_MODEL`) y `output_config={"effort": "low"}`. Hace
  una sola llamada `messages.create` no streaming, con `max_tokens=2000`, el prompt como
  `system` y los datos en el mensaje del usuario.
- **Rationale**:
  - Es un único resumen de texto, sin herramientas ni agentes: la superficie más simple de la
    API.
  - Claude Opus 5.5 es el modelo actual por defecto. En este modelo el razonamiento no se
    puede desactivar, así que se controla con el esfuerzo: `low` alcanza para redactar
    1.200 caracteres y ayuda a cumplir SC-001 (texto en menos de 10 s).
  - `max_tokens=2000` deja margen al razonamiento sobre los ~400 tokens del texto. Si se
    corta (`stop_reason == "max_tokens"`), es "resumen no disponible".
  - El modelo es configurable, para poder bajar a `claude-sonnet-5-5` si la latencia o el
    costo lo piden, sin tocar código.
- **Entrenamiento con los datos (constitución v2.3.0, Principio IX)**: según los términos
  comerciales de Anthropic, las entradas y salidas de la API no se usan para entrenar modelos.
  **Acción previa a producción**: confirmar que la cuenta u organización que provee la API key
  opera bajo esos términos comerciales, y dejarlo anotado en el README.
- **Alternativas**: otros proveedores (no aportan nada para este caso y el proyecto ya trabaja
  con Claude); generar el texto con plantillas (descartado por la usuaria: el texto lo redacta
  un modelo); streaming (innecesario para un texto corto que se muestra completo).

## R6. Tiempo límite y reintentos del modelo

- **Decisión**: `client.with_options(timeout=15.0, max_retries=0)`. Se capturan
  `anthropic.APITimeoutError`, `anthropic.APIConnectionError`, `anthropic.RateLimitError` y
  `anthropic.APIStatusError` (en ese orden), y todas dan "resumen no disponible" (FR-012).
  También dan "resumen no disponible": `stop_reason` igual a `refusal` o `max_tokens`, y un
  texto vacío o de más de 1.200 caracteres.
- **Rationale**: el SDK reintenta 2 veces por defecto, y el tiempo real puede llegar a
  `timeout × 3` = 45 s, lo que rompe SC-005 (aviso en menos de 30 s). Con 10 s del BCRA más
  15 s del modelo, el peor caso queda en ~25 s. El reintento lo decide la persona con
  "Reintentar" (US4).
- **Sin `fallbacks` de rechazo**: en Opus 5.5 la guía recomienda activar por defecto el
  fallback del servidor ante rechazos (`fallbacks: "default"`). No se activa aquí porque
  volvería a ejecutar la solicitud en otro modelo dentro de la misma llamada, lo que puede
  duplicar el tiempo límite. Además, un rechazo ante un informe de deudas es improbable. Si
  ocurre, se muestra "resumen no disponible" y se puede reintentar.

## R7. Credenciales del modelo como secreto

- **Decisión**: la API key se lee de un archivo cuya ruta indica `ANTHROPIC_API_KEY_FILE`
  (en Docker, el secreto `anthropic_api_key` montado en `/run/secrets/anthropic_api_key`) y
  se pasa explícitamente con `anthropic.Anthropic(api_key=...)`. Si la variable no está
  definida, el SDK resuelve las credenciales como siempre (`ANTHROPIC_API_KEY` o un perfil de
  `ant auth login`), que es lo cómodo en desarrollo local. Si no hay credenciales, la API
  arranca igual, registra **una** advertencia al iniciar (sin datos personales) y cada consulta
  con deudas devuelve "resumen no disponible".
- **Rationale**: FR-025 y la constitución (secretos con Docker secrets, nunca en `ENV`, `ARG`
  ni en la imagen). Un dashboard sin IA configurada no debe impedir el resto de la aplicación
  (FR-029).
- **Alternativas**: `environment: ANTHROPIC_API_KEY` en compose (lo prohíbe la constitución);
  fallar al arrancar sin clave (rompe la demo del resto del producto).

## R8. Qué recibe el modelo: respuesta completa más datos calculados

- **Decisión**: el mensaje del usuario lleva dos bloques delimitados:
  1. `<respuesta_bcra>`: el JSON del BCRA tal como llegó (completo, con CUIT y denominación,
     según la clarificación del 2026-10-26).
  2. `<datos_calculados>`: lo que el servicio ya calculó sin IA sobre el período más
     reciente: período en texto (p. ej. "julio 2024"), peor situación, entidad que la
     informa, cantidad de entidades, monto total en pesos ya formateado con separador de miles
     y máximo de días de atraso.

  El prompt indica usar las cifras de `<datos_calculados>` y no recalcularlas.
- **Rationale**: SC-006 exige cifras correctas en el 100 % de los casos. La suma y la
  conversión de miles de pesos son aritmética que el código hace sin error y el modelo puede
  equivocar. El modelo igual recibe la respuesta completa para describir entidades y marcas.
  Los delimitadores ayudan a cumplir FR-019 (los datos son datos, no instrucciones).
- **Alternativas**: solo el JSON crudo (riesgo de errores de cálculo); solo los datos
  calculados (contradice la clarificación "respuesta completa").

## R9. El prompt: archivo versionado en `config/`

- **Decisión**: `config/prompts/bcra-summary.md`. Se carga al iniciar la API y se rechaza si
  está vacío (`ConfigError`, como `scoring.json`). La ruta es configurable con
  `HEALTH_SCORE_SUMMARY_PROMPT`, y en compose se monta `:ro` igual que `scoring.json`. La
  primera versión del texto está en
  [contracts/bcra-summary-prompt.md](contracts/bcra-summary-prompt.md), para iterarla junto
  con la usuaria antes de copiarla al archivo.
- **Rationale**: FR-016 (un único lugar, versionado y separado del código), en el espíritu del
  Principio III. Montarlo en compose permite ajustarlo con `docker compose restart api`.
- **Caché del prompt**: se envía `cache_control={"type": "ephemeral"}`. Si el prompt queda
  por debajo del mínimo cacheable del modelo, simplemente no se cachea: no hay error ni cambio
  de comportamiento. No vale la pena inflar el prompt para alcanzar el mínimo.

## R10. Descripciones de situación y tono: dónde vive cada regla

- **Decisión**:
  - Las descripciones de cada situación (FR-017) viven **solo en el prompt**: el código no
    las usa.
  - El tono (FR-013) vive **solo en el servicio**, `credit/service.py::tone_for`: peor
    situación válida (1–5) del período más reciente → 1 `positive`, 2 `warning`, 3–5 `risk`.
  - Si ninguna entidad tiene una situación válida, `tone` es `null` y el dashboard lo muestra
    neutro.
  - Los cuatro textos fijos (FR-020) viven en el mismo módulo del servicio.
- **Rationale**: Principio VI, una regla en un lugar. El tono no depende del modelo, así una
  redacción inesperada no puede pintar de verde un riesgo.

## R11. Validación del CUIT en el dashboard y casos compartidos

- **Decisión**:
  - `frontend/src/lib/cuit.ts` implementa `validateCuit(value)`: misma regex que
    `CUIL_PATTERN`, los mismos pesos y la misma regla del resto 1. Devuelve
    `{ ok: true, digits }` o `{ ok: false, message }`, con los textos de FR-002 y FR-003.
  - Los casos de prueba viven en `tests/fixtures/cuil_cases.json` (válidos, formato inválido,
    dígito inválido, resto 1). Los lee `tests/unit/test_cuil.py` y también `cuit.test.ts`,
    que importa el JSON por ruta relativa.
- **Rationale**: FR-003 y el Principio VI. La regla queda duplicada en dos lenguajes, pero un
  único archivo de casos obliga a que las dos implementaciones coincidan. Si una cambia sin la
  otra, falla alguna de las dos suites. La guarda `/length:\s*11/` de `guards.test.ts` solo mira
  `src/pages/`, así que no se ve afectada.
- **Alternativas**: consultar al servicio para validar (contradice "no consultar si es
  inválido"); dejar el dígito verificador solo en el servidor (contradice FR-003).

## R12. Estado de la consulta en el dashboard

- **Decisión**: un hook `useCreditCheck()` en `frontend/src/pages/new-client/` guarda
  `{ digits, state }`, donde `state` es `idle`, `loading`, `done` (con el `CreditStatus`) o
  `failed`. Expone tres funciones:
  - `check(digits)`: si `digits` coincide con el CUIT en curso o ya consultado, no hace nada
    (FR-006, FR-007). Si no, aborta el anterior y lanza uno nuevo con su `AbortController`.
  - `reset()`: aborta y limpia. Se llama en cada cambio del campo (FR-008), al guardar con
    éxito y al desmontar (FR-009).
  - `retry()`: repite la consulta del CUIT actual.

  `NewClientPage` llama a `validateCuit` en el `onBlur` del campo: si es inválido, pone el
  mensaje en `fieldErrors.cuil`; si es válido, llama a `check(digits)`.
- **Rationale**: es el mismo patrón de `AbortController` que ya usan `useApi` y el cálculo del
  score. Al reutilizar `fieldErrors.cuil`, el error de validación hereda `aria-invalid`,
  `aria-describedby` y el borrado al escribir que ya existen (US2, escenario 6).
- **Cambio en `ClientFields`**: suma dos props opcionales, `onCuilBlur` y `cuilStatus` (un
  `ReactNode` que se dibuja bajo el campo). La edición no las pasa, así que no cambia.

## R13. Red de salida en Docker

- **Decisión**: una red nueva, `egress` (no interna), conectada solo a `api`. La red `backend`
  sigue `internal: true` para el tráfico `web` ↔ `api`, y `web` no se conecta a `egress`.
- **Excepción documentada** (constitución, Contenedores y despliegue; FR-030): Compose no puede
  limitar la salida por dominio. `api` podrá salir a cualquier destino de internet, no solo a
  `api.bcra.gob.ar` y `api.anthropic.com`. Se documenta en `compose.yaml` y en
  `SECURITY-DOCKER.md`, con la recomendación para producción: un proxy de salida con lista de
  dominios permitidos, o reglas de firewall en el host.
- **Alternativas**: un contenedor proxy (p. ej. Squid) con lista de dominios permitidos. Cumple
  FR-030 al pie de la letra, pero suma una imagen, su configuración y su endurecimiento. Se
  descarta para esta versión por el Principio I y queda como mejora.

## R14. Pruebas sin servicios reales y revisión del prompt

- **Decisión**:
  - **Backend**: `FakeBcraSource` y `FakeSummarizer` se inyectan en `create_app` (igual que el
    repositorio). `HttpBcraSource` se prueba con `urlopen` reemplazado por `monkeypatch`
    (200, 404, 400, 429, 500, timeout, JSON inválido), y `ClaudeSummarizer` con un cliente
    falso que imita `messages.create`. Una prueba con `caplog` verifica que no se registran ni
    el CUIT ni la denominación (FR-024).
  - **Frontend**: `fetch` simulado, como en las pruebas existentes.
  - **Revisión del prompt (FR-028)**: respuestas del BCRA ficticias en
    `tests/fixtures/bcra/*.json`, que también usan las pruebas. El script
    `scripts/review_bcra_prompt.py` corre el prompt real sobre esas respuestas y escribe los
    textos para revisarlos a mano. **Llama al modelo real y tiene costo**: se ejecuta solo a
    mano, nunca en la suite.
- **Rationale**: FR-026 y SC-009. La calidad del texto no se puede afirmar con un modelo
  falso: por eso la revisión manual de FR-028 y SC-006.
