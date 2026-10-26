# Quickstart: validar la consulta al BCRA

Requisitos: los mismos de las specs anteriores (Python 3.12+, Node 20+). Las pruebas no
necesitan red, API key ni el BCRA: todo se simula (FR-026).

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

## 2. Demo manual con BCRA y modelo reales

> Usa datos reales del BCRA (constitución v2.3.0, Principio IX, excepción de consulta en tiempo
> de uso) y la API de Claude, con costo. No se graba ni se registra nada.

```powershell
$env:ANTHROPIC_API_KEY = "<tu clave>"   # o ANTHROPIC_API_KEY_FILE, o `ant auth login`
uvicorn health_score.api.app:app_from_env --factory --reload
cd frontend; npm run dev
```

1. Abrir `http://localhost:5173/#/nuevo`.
2. Escribir `20-90000024-4` (sintético) y salir del campo. Se ve el indicador y luego,
   normalmente, "El BCRA no registra deudas informadas para este CUIT/CUIL".
3. Escribir `20900000245` y salir del campo. Aparece el error de dígito verificador y la
   pestaña Red no muestra ninguna solicitud.
4. Escribir `20 90000024 4` y salir del campo. Aparece el error de formato.
5. Modificar el campo después de un resultado. El resultado desaparece al instante.
6. Con la red de la API cortada, o con `HEALTH_SCORE_BCRA_URL` apuntando a un puerto cerrado,
   aparece "No pudimos consultar la situación en el BCRA…" con "Reintentar".
7. Sin API key, y con un CUIT que el BCRA informe con deudas, aparece "No pudimos preparar el
   resumen…" con "Reintentar".

Para probar el caso "con deudas" sin datos reales, levantar un servidor estático que sirva
uno de los JSON de `tests/fixtures/bcra/` y apuntar `HEALTH_SCORE_BCRA_URL` a él.

## 3. Revisión del prompt (FR-028)

```powershell
python scripts/review_bcra_prompt.py      # llama al modelo real (costo); escribe los textos
```

Revisar contra FR-017 a FR-019 y SC-006: peor situación, entidades y total correctos; ninguna
recomendación; nada inventado.

## 4. Docker

```powershell
New-Item -ItemType Directory -Force secrets | Out-Null
Set-Content -NoNewline -Encoding ascii secrets/anthropic_api_key.txt "<tu clave>"   # en .gitignore
docker compose up -d --build
```

Verificar:

- `docker compose exec api env` no muestra la clave.
- `web` no está en la red `egress`.
- `docker compose logs api web` no contiene CUIT ni denominaciones después de una consulta
  (FR-024).
