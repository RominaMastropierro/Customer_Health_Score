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

## Levantar el proyecto (resumen)

Requisitos: Python 3.12+ y Node.js 20+. Se usan dos terminales, desde la raíz del repositorio.

**Terminal 1: API** (`http://127.0.0.1:8000`, docs en `/docs`)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn health_score.api.app:app_from_env --factory --reload
```

**Terminal 2: dashboard** (`http://localhost:5173`)

```powershell
cd frontend
npm install
npm run dev
```

Al primer arranque la API crea `data/health_score.db` y carga los 20 clientes de ejemplo.
Para volver a empezar de cero, detener la API y borrar ese archivo. Los pasos de instalación
solo hacen falta la primera vez; después alcanza con activar el entorno y correr `uvicorn` y
`npm run dev`.

## Levantar con Docker

Alternativa a las dos terminales: no requiere Python ni Node.js, solo Docker con Compose.

```powershell
# Una sola vez: la API key de Claude como Docker secret (ver "Consulta al BCRA")
New-Item -ItemType Directory -Force secrets | Out-Null
Set-Content -NoNewline -Encoding ascii secrets/anthropic_api_key.txt "<tu clave>"

docker compose up -d --build     # dashboard en http://127.0.0.1:8080
docker compose logs -f api       # ver los logs de la API
docker compose down              # detener (la cartera se conserva)
docker compose down -v           # detener y borrar la base (la carga inicial se repite)
```

- Se construyen dos imágenes desde el [Dockerfile](Dockerfile): `api` (FastAPI) y `web`
  (dashboard compilado servido por nginx, que reenvía `/api` a la API).
- La API no publica puertos: solo se accede a través del dashboard (`/api/...`, por ejemplo
  `http://127.0.0.1:8080/api/portfolio`). La documentación interactiva (`/docs`) no está
  disponible por esta vía; para usarla, levantar la API localmente como se indica arriba.
- La base SQLite vive en el volumen `dbdata`. Para cambiar pesos o umbrales, editar
  [config/scoring.json](config/scoring.json) y ejecutar `docker compose restart api`.
- Los contenedores corren sin privilegios y con el sistema de archivos de solo lectura,
  según el OWASP Docker Security Cheat Sheet. El detalle de cada control, las excepciones y
  lo que hay que configurar en el host están en [SECURITY-DOCKER.md](SECURITY-DOCKER.md).

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
uvicorn health_score.api.app:app_from_env --factory --reload
```

La documentación interactiva queda en `http://127.0.0.1:8000/docs`.

| Endpoint | Qué hace |
|----------|----------|
| `POST /score` | Evalúa un cliente a partir de sus métricas |
| `POST /portfolio/score` | Evalúa una cartera enviada en la solicitud |
| `GET /portfolio` | Evalúa la cartera almacenada; cada resultado incluye el `cuil` |
| `GET /clients/{client_id}/score` | Evalúa un cliente de la cartera almacenada, con su `cuil` |
| `POST /clients` | Crea un cliente (CUIL, nombre opcional y métricas) |
| `GET /clients` | Lista los clientes guardados, en orden de alta |
| `GET /clients/{client_id}` | Consulta un cliente |
| `PUT /clients/{client_id}` | Reemplaza el CUIL, el nombre y las métricas de un cliente |
| `DELETE /clients/{client_id}` | Elimina un cliente |
| `GET /config` | Muestra la configuración activa |
| `GET /metrics` | Lista las métricas de entrada y sus rangos válidos |
| `POST /credit-status` | Consulta la situación crediticia de un CUIT en el BCRA (spec 005) |

Sobre el CRUD de clientes:

- El `client_id` de un cliente nuevo lo genera el servicio (UUID v4) y no se envía en el
  cuerpo; los 20 clientes de la carga inicial conservan `C-001` … `C-020`.
- El `cuil` es obligatorio y único. Se acepta con o sin guiones (`20900000015` o
  `20-90000001-5`), se valida el dígito verificador y se devuelve siempre sin guiones.
- Errores: 422 datos inválidos, 404 cliente inexistente, 409 CUIL ya registrado en otro
  cliente, 503 base de datos no disponible.

Variables de entorno:

| Variable | Default | Uso |
|----------|---------|-----|
| `HEALTH_SCORE_CONFIG` | `config/scoring.json` | Archivo de configuración del scoring |
| `HEALTH_SCORE_DB` | `data/health_score.db` | Base SQLite donde se guarda la cartera |
| `HEALTH_SCORE_CLIENTS` | `data/clients.json` | Archivo de la carga inicial (se usa solo cuando la base nunca fue inicializada) |
| `HEALTH_SCORE_BCRA_URL` | `https://api.bcra.gob.ar/CentralDeDeudores/v1.0` | Base de la Central de Deudores del BCRA |
| `HEALTH_SCORE_SUMMARY_PROMPT` | `config/prompts/bcra-summary.md` | Prompt del resumen del BCRA; si falta o está vacío, el servicio no arranca |
| `HEALTH_SCORE_SUMMARY_MODEL` | `claude-opus-5-5` | Modelo de Claude que redacta el resumen |
| `ANTHROPIC_API_KEY_FILE` | sin definir | Ruta del archivo con la API key de Claude (en Docker, `/run/secrets/anthropic_api_key`) |
| `HEALTH_SCORE_DEMO_FIXTURES` | sin definir | Carpeta de fixtures ficticios; si está definida, el BCRA y el modelo se simulan (solo demos) |

La primera vez que arranca, el servicio crea la base y carga los 20 clientes ficticios de
`data/clients.json`. Los cambios posteriores quedan en la base y sobreviven a los reinicios;
la carga inicial no vuelve a ejecutarse, ni siquiera si se eliminan todos los clientes. Para
empezar de cero, detener el servicio y borrar `data/health_score.db`.

## Frontend

Dashboard web (Cartera, Por categoría, Nuevo cliente, detalle y configuración) en
[frontend/](frontend/). Todos los datos salen de la API; la interfaz no calcula scores.
Requiere Node.js 20 o superior y la API corriendo.

Gestión de clientes desde el dashboard (spec 004):

- **Alta**: en "Nuevo cliente", escribir el CUIT/CUIL (con o sin guiones), el nombre opcional y
  las métricas, calcular el score y pulsar "Guardar en cartera".
- **Edición y baja**: desde el detalle del cliente, con "Editar" o "Eliminar" (la baja pide
  confirmación y es definitiva).
- Los errores del servicio (CUIT/CUIL inválido o ya registrado, métricas fuera de rango) se
  muestran junto a cada campo, y la cartera se actualiza sola después de cada operación.
- **Situación en el BCRA** (spec 005): al salir del campo CUIT/CUIL en "Nuevo cliente", se
  muestra lo que informa la Central de Deudores. Ver [Consulta al BCRA](#consulta-al-bcra-spec-005).

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

Las guías de validación de punta a punta están en
[specs/002-health-score-dashboard/quickstart.md](specs/002-health-score-dashboard/quickstart.md)
y, para el alta, la edición y la baja de clientes,
[specs/004-client-crud-ui/quickstart.md](specs/004-client-crud-ui/quickstart.md).
Para probar el rendimiento con una cartera grande:
`python scripts/make_fake_portfolio.py 1000 > tmp/clients_1000.json` y levantar la API con
una base nueva: `HEALTH_SCORE_DB` apuntando a un archivo que no exista (p. ej.
`tmp/health_1000.db`) y `HEALTH_SCORE_CLIENTS` apuntando al archivo generado. Los registros
fuera de rango que genera el script se omiten en la carga inicial (se informan en el log).

## Consulta al BCRA (spec 005)

Al dar de alta un cliente, cuando el campo CUIT/CUIL pierde el foco, el dashboard valida el
CUIT (formato y dígito verificador) y pide a la API su situación en la Central de Deudores del
BCRA. La API consulta al BCRA con los 11 dígitos sin guiones y, si hay deudas, le pide a Claude
un texto en lenguaje claro guiado por el prompt de
[config/prompts/bcra-summary.md](config/prompts/bcra-summary.md). El tono visual (normal,
advertencia o riesgo) lo calcula el código, no el modelo.

- Es **informativa**: no cambia el score ni el nivel, y no impide calcular ni guardar.
- El navegador nunca habla con el BCRA ni con Claude: todo pasa por `POST /credit-status`.
- **Los datos reales solo se muestran** (constitución v2.4.0, Principio IX): el resultado no se
  guarda y la API no registra en sus logs el CUIT, la denominación, las deudas, el prompt ni
  el texto. Las pruebas y la demostración usan solo datos ficticios y fuentes simuladas.

**API key de Claude.** En local, definir `ANTHROPIC_API_KEY` o `ANTHROPIC_API_KEY_FILE` antes
de `uvicorn`. En Docker, crear `secrets/anthropic_api_key.txt` (ver *Levantar con Docker* y
[SECURITY-DOCKER.md](SECURITY-DOCKER.md)); nunca va en variables de entorno de la imagen. Sin
clave, la API arranca igual y, cuando hay deudas, muestra "No pudimos preparar el resumen…".

> **Antes de usarla con datos reales**: confirmar que la cuenta u organización de la API key
> de Anthropic opera bajo términos comerciales que no usan los datos de la API para entrenar
> modelos (constitución v2.4.0, Principio IX; spec 005, T050b).
>
> Estado: **confirmado el 2026-10-26** por la persona responsable del proyecto, para la cuenta
> de la API key actual. Si se cambia de cuenta u organización, volver a confirmarlo.

**Demostración sin datos reales.** El BCRA y el modelo se simulan con los fixtures ficticios
de `tests/fixtures/`; no hace falta API key ni salida a internet:

```powershell
$env:HEALTH_SCORE_DEMO_FIXTURES = "tests/fixtures"
uvicorn health_score.api.app:app_from_env --factory --reload
# o con Docker:
docker compose -f compose.yaml -f compose.demo.yaml up -d --build
```

Los CUIT de la demostración y lo que muestra cada uno están en
[specs/005-bcra-credit-check/quickstart.md](specs/005-bcra-credit-check/quickstart.md).

**Ajustar el prompt.** Editar [config/prompts/bcra-summary.md](config/prompts/bcra-summary.md)
y reiniciar la API (`docker compose restart api` en Docker). Para revisar los textos que
genera, ejecutar `python scripts/review_bcra_prompt.py`: llama al modelo real con las
respuestas ficticias de `tests/fixtures/bcra/`, **tiene costo** y escribe los textos en
`tmp/prompt-review/` para revisarlos a mano.

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
