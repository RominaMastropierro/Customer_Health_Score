# Quickstart: validar la consulta al BCRA

Requisitos: los mismos de las specs anteriores (Python 3.12+, Node 20+). Las pruebas y la demo
no necesitan red, API key ni el BCRA: todo se simula (FR-026; constitución v2.4.0, Principio
IX). Solo la revisión del prompt (§3) llama al modelo real, con fixtures ficticios.

## 1. Pruebas automatizadas

```powershell
pip install -e ".[dev]"            # incluye la dependencia nueva `anthropic`
pytest                              # suite completa, sin red
cd frontend; npm test               # incluye lib/cuit.test.ts y NewClientPage.test.tsx
```

Esperado: todo verde, incluidas las pruebas previas sin cambios (FR-029, SC-009).

Pruebas clave por historia:

| Historia | Backend | Frontend |
|----------|---------|----------|
| US1 | `tests/integration/test_credit_status_api.py` (with_debts: el modelo recibe prompt + JSON completo + datos calculados; tono) | `NewClientPage.test.tsx`: blur válido → 1 solicitud, indicador, texto, tono |
| US2 | `tests/unit/test_cuil.py` con `tests/fixtures/cuil_cases.json`; 422 sin llamar fuentes | `lib/cuit.test.ts` (mismos casos); blur inválido → 0 solicitudes |
| US3 | — | cambio del campo borra el resultado; respuesta tardía descartada; mismo CUIT con y sin guiones → 1 solicitud |
| US4 | `tests/unit/test_bcra_source.py` (404, 400, 429, 500, timeout, JSON inválido); `tests/unit/test_summarizer.py` (timeout, refusal, vacío, largo) | avisos y "Reintentar" |
| FR-024 | `caplog`: ni CUIT ni denominación en logs | — |
| Demo | `tests/unit/test_credit_demo.py`: fuentes simuladas, sin red | — |

## 2. Demo de punta a punta (simulada)

> La constitución (v2.4.0, Principio IX) exige que las demostraciones usen datos ficticios y
> versiones simuladas del BCRA y del modelo. En este modo el servicio no sale a internet: el
> BCRA se reemplaza por `FixtureBcraSource` (lee `tests/fixtures/bcra/` según el índice
> `tests/fixtures/bcra-demo.json`) y el modelo por `DemoSummarizer`. No hace falta API key.

```powershell
$env:HEALTH_SCORE_DEMO_FIXTURES = "tests/fixtures"
uvicorn health_score.api.app:app_from_env --factory --reload
cd frontend; npm run dev
```

Abrir `http://localhost:5173/#/nuevo`, escribir cada CUIT y salir del campo:

| CUIT | Se espera |
|------|-----------|
| `20-90000024-4` | Indicador y luego texto "[Demostración] …" con tono de advertencia y la fuente |
| `20-90000002-3` | Texto con tono positivo |
| `20-90000003-1` | Texto con tono de riesgo |
| `20-90000007-4` | Texto con tono neutro (ninguna situación válida) |
| `20-90000001-5` | "El BCRA no registra deudas informadas para este CUIT/CUIL." |
| `20-90000005-8` | "No pudimos consultar la situación en el BCRA…" con "Reintentar" |
| `20-90000006-6` | "No pudimos preparar el resumen…" con "Reintentar" |
| `20900000245` | Error de dígito verificador; la pestaña Red no muestra solicitudes |
| `20 90000024 4` | Error de formato |

También:

- Modificar el campo después de un resultado lo borra al instante; volver a `20900000244` lo
  restaura sin una solicitud nueva.
- Detener uvicorn, escribir `20-90000002-3` y salir del campo: aparece el aviso de no
  disponibilidad con "Reintentar". Volver a levantar uvicorn y pulsarlo muestra el texto.
- A 360 px de ancho, el indicador y el texto se ven completos sin desplazamiento horizontal
  (FR-022).

## 3. Revisión del prompt (FR-028)

> **Requisito previo** (T050b): confirmar que la cuenta de la API key opera bajo términos
> comerciales sin entrenamiento con los datos de la API y que está anotado en el README.
> Llama al modelo real con fixtures ficticios (constitución v2.4.0, Principio IX) y tiene
> costo: se ejecuta solo a mano y con aprobación.

```powershell
$env:ANTHROPIC_API_KEY = "<tu clave>"     # o ANTHROPIC_API_KEY_FILE
python scripts/review_bcra_prompt.py      # escribe los textos y la duración de cada llamada
```

Revisar contra FR-017 a FR-019 y SC-006: peor situación, entidades y total correctos; ninguna
recomendación; nada inventado; en `varios-periodos.json`, ninguna mención del período
anterior. El resumen de tiempos del script sirve para SC-001.

## 4. Docker (en modo demo)

```powershell
New-Item -ItemType Directory -Force secrets | Out-Null
# En modo demo no se usa la clave: alcanza un valor ficticio para verificar el manejo del secreto.
Set-Content -NoNewline -Encoding ascii secrets/anthropic_api_key.txt "clave-ficticia"   # en .gitignore
docker compose -f compose.yaml -f compose.demo.yaml up -d --build
```

Verificar:

- La build termina sin errores (incluida la etapa `web-builder`, T046b).
- `docker compose exec api env` no muestra la clave.
- `web` no está en la red `egress`.
- Tras consultar `20-90000024-4`, `docker compose logs api web` no contiene CUIT ni
  denominaciones (FR-024).
