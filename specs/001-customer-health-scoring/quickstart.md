# Quickstart: validar el motor de scoring de punta a punta

Guía para comprobar que la feature funciona. Los modelos están en
[data-model.md](data-model.md) y los endpoints en [contracts/http-api.md](contracts/http-api.md).

## Prerrequisitos

- Python 3.12
- Ejecutar desde la raíz del repositorio

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

## 1. Suite de tests

```powershell
pytest
```

**Esperado**: todos los tests pasan, incluidos los extremos de cada rango, los valores
inválidos, la validación de la configuración y la paridad entre la biblioteca y la API.

## 2. Biblioteca (US1, US4)

```powershell
python -c "from health_score import load_config, score_client, ClientMetrics; c = load_config('config/scoring.json'); print(score_client(ClientMetrics(usage=60, support_tickets=3, nps=7, days_to_renewal=90), c))"
```

**Esperado**: `score=63`, `level='Estable'`. Los sub-scores son 60 / 70 / 70 / 50; el
promedio es 62,5 y se redondea hacia arriba a 63.

## 3. API (US1, US3, US4)

```powershell
uvicorn health_score.api.app:app --reload
```

Abrir `http://127.0.0.1:8000/docs`. **Esperado**: aparecen los 5 endpoints de
[http-api.md](contracts/http-api.md) con sus esquemas y sus respuestas 404/422.

| Escenario | Solicitud | Resultado esperado |
|-----------|-----------|--------------------|
| Cliente sano | `POST /score` `{usage:90, support_tickets:0, nps:9, days_to_renewal:300}` | 200, `score: 95`, `level: "Top"` |
| Cliente intermedio | `POST /score` `{usage:60, support_tickets:3, nps:7, days_to_renewal:90}` | 200, `score: 63`, `level: "Estable"` |
| Cliente en riesgo | `POST /score` `{usage:10, support_tickets:15, nps:2, days_to_renewal:10}` | 200, `score: 9`, `level: "En riesgo"` |
| Límites aceptados | `POST /score` `{usage:0, support_tickets:0, nps:10, days_to_renewal:0}` | 200, score entre 0 y 100 |
| NPS fuera de rango | `POST /score` con `nps: 11` | 422 que señala `nps` |
| Decimal | `POST /score` con `support_tickets: 2.5` | 422 |
| Cartera con un cliente inválido | `POST /portfolio/score` (ejemplo del contrato) | 200, `invalid: 1`, el cliente válido evaluado |
| Cartera vacía | `POST /portfolio/score` `{clients: []}` | 200, `total: 0`, todos los conteos en 0 |
| Cartera almacenada | `GET /portfolio` | 200, `Top + Estable + En riesgo + invalid = total` |
| Cliente inexistente | `GET /clients/NO-EXISTE/score` | 404 |

## 4. Cambio de configuración (US2)

1. En `config/scoring.json`, cambiar `thresholds.top` de 75 a 60 y reiniciar `uvicorn`.
2. `GET /config` → **esperado**: `top: 60`.
3. `POST /score` con el cliente intermedio → **esperado**: `score: 63`, `level: "Top"`.
4. Poner `thresholds.at_risk: 80` (mayor que `top`) y reiniciar → **esperado**: el servicio
   no arranca y el mensaje identifica `thresholds`.
5. Restaurar los valores originales (75 / 50).

## Criterios de cierre

- Los pasos 1–4 dan los resultados esperados.
- `data/clients.json` y los fixtures contienen solo datos ficticios.
- No hay pesos, umbrales, topes ni horizontes en el código fuera de `config/scoring.json`.
