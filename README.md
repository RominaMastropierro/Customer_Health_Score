# Customer Health Score

Motor que calcula la salud de cada cliente a partir de cuatro métricas y devuelve:

- un **score** entero de 0 a 100;
- un **nivel**: `Top`, `Estable` o `En riesgo`;
- el **sub-score** de cada métrica, para explicar el resultado.

| Métrica | Campo | Rango |
|---------|-------|-------|
| Uso del producto (%) | `usage` | 0–100 |
| Tickets de soporte (últimos 30 días) | `support_tickets` | 0 o más |
| NPS | `nps` | 0–10 |
| Días hasta la renovación | `days_to_renewal` | 0 o más |

Los pesos, los umbrales de nivel y los parámetros de normalización se definen en
[config/scoring.json](config/scoring.json), no en el código. Todos los datos del repositorio
son ficticios.

## Instalación

Requiere Python 3.12 o superior.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

## Tests

```powershell
pytest
```

## API

```powershell
uvicorn health_score.api.app:app --reload
```

La documentación interactiva queda en `http://127.0.0.1:8000/docs`.

| Endpoint | Qué hace |
|----------|----------|
| `POST /score` | Evalúa un cliente a partir de sus métricas |
| `POST /portfolio/score` | Evalúa una cartera enviada en la solicitud |
| `GET /portfolio` | Evalúa la cartera almacenada |
| `GET /clients/{client_id}/score` | Evalúa un cliente de la cartera almacenada |
| `GET /config` | Muestra la configuración activa |
| `GET /metrics` | Lista las métricas de entrada y sus rangos válidos |

Variables de entorno:

| Variable | Default | Uso |
|----------|---------|-----|
| `HEALTH_SCORE_CONFIG` | `config/scoring.json` | Archivo de configuración del scoring |
| `HEALTH_SCORE_CLIENTS` | `data/clients.json` | Cartera almacenada (datos ficticios) |

## Frontend

Dashboard web (Cartera, Por categoría, Nuevo cliente, detalle y configuración) en
[frontend/](frontend/). Todos los datos salen de la API; la interfaz no calcula scores.
Requiere Node.js 20 o superior y la API corriendo.

```powershell
cd frontend
npm install
npm run dev       # http://localhost:5173
npm test          # tests de la interfaz (Vitest)
npm run build     # build de producción en frontend/dist
```

El servidor de desarrollo reenvía `/api` a `http://127.0.0.1:8000`. Para usar otra dirección,
definir `VITE_API_TARGET` antes de `npm run dev`. [frontend/.npmrc](frontend/.npmrc) sube los
reintentos y plazos de npm porque la red de desarrollo es lenta.

La guía de validación de punta a punta está en
[specs/002-health-score-dashboard/quickstart.md](specs/002-health-score-dashboard/quickstart.md).
Para probar el rendimiento con una cartera grande:
`python scripts/make_fake_portfolio.py 1000 > tmp/clients_1000.json` y levantar la API con
`HEALTH_SCORE_CLIENTS` apuntando a ese archivo.

## Cambiar pesos y umbrales

1. Editar [config/scoring.json](config/scoring.json):
   - `weights`: peso de cada métrica, en cualquier escala (25/25/25/25 equivale a 1/1/1/1);
   - `thresholds.top`: score mínimo para `Top`;
   - `thresholds.at_risk`: por debajo de este score el cliente queda `En riesgo`;
   - `normalization.ticket_cap`: a partir de esta cantidad de tickets el sub-score es 0;
   - `normalization.renewal_horizon_days`: a partir de estos días el sub-score de
     renovación es 100.
2. Reiniciar el servicio.

Si la configuración es inválida (un peso negativo, `at_risk` ≥ `top`, un campo faltante,
etc.), el servicio no arranca y el mensaje indica qué campo falla.

## Uso como biblioteca

```python
from health_score import ClientMetrics, load_config, score_client

config = load_config("config/scoring.json")
result = score_client(
    ClientMetrics(usage=60, support_tickets=3, nps=7, days_to_renewal=90),
    config,
)
print(result.score, result.level.value)  # 63 Estable
```

`score_portfolio` evalúa una lista de clientes y devuelve un resumen por nivel. La biblioteca
y la API dan resultados idénticos para la misma entrada y configuración.

## Más información

La especificación, el diseño y la guía de validación de punta a punta están en
[specs/001-customer-health-scoring/](specs/001-customer-health-scoring/), en particular
[quickstart.md](specs/001-customer-health-scoring/quickstart.md).
