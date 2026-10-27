# syntax=docker/dockerfile:1.7
# Imágenes de Customer Health Score. Dos targets finales:
#   docker build --target api -t health-score-api .
#   docker build --target web -t health-score-web .
# Las reglas entre corchetes son del OWASP Docker Security Cheat Sheet.

# Bases fijadas por tag Y digest (verificados el 2026-10-22). Renovar periódicamente con:
#   docker buildx imagetools inspect <imagen:tag>   [#0, #9]
ARG PYTHON_IMAGE=python:3.13-slim-bookworm@sha256:e32be0e55814a08977501ca863271d9bd02443710db8f2afaf8372e2c4508530
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.28-alpine@sha256:7377697a821c131a924a7105fafbe7414db4e9fcc77a6f08f776f33f141ec3f8

# =====================================================================
# API (FastAPI + uvicorn + SQLite)
# =====================================================================

# ---------- api-builder: instala el paquete en un venv aislado ----------
FROM ${PYTHON_IMAGE} AS api-builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY pyproject.toml ./
COPY src ./src
# Instalación no editable: la imagen final solo lleva el venv, no el código fuente.
# Credenciales de índices privados, si algún día hacen falta, vía --mount=type=secret  [#13]
RUN pip install --no-cache-dir .

# ---------- api: imagen final ----------
FROM ${PYTHON_IMAGE} AS api
LABEL org.opencontainers.image.title="health-score-api" \
      org.opencontainers.image.source="https://github.com/<OWNER>/Customer_Health_Score" \
      org.opencontainers.image.version="0.1.0"
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    HEALTH_SCORE_CONFIG=/app/config/scoring.json \
    HEALTH_SCORE_CLIENTS=/app/data/clients.json \
    HEALTH_SCORE_DB=/var/lib/health-score/health_score.db \
    HEALTH_SCORE_SUMMARY_PROMPT=/app/config/prompts/bcra-summary.md
# La API key de Claude nunca va en ENV ni ARG: llega como Docker secret (spec 005)  [#13]

# Usuario dedicado sin privilegios con IDs fijos; se quitan bits setuid/setgid  [#2]
# /var/lib/health-score es el único directorio escribible (volumen de la base SQLite)  [#8]
RUN groupadd --system --gid 10001 app \
 && useradd  --system --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app \
 && install -d -o 10001 -g 10001 -m 0750 /var/lib/health-score \
 && { find / -xdev -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true; }

WORKDIR /app
# Código y datos semilla quedan de root y solo lectura para el proceso: no puede modificarlos  [#8]
COPY --from=api-builder /opt/venv /opt/venv
COPY config/scoring.json ./config/scoring.json
COPY config/prompts ./config/prompts
COPY data/clients.json ./data/clients.json

USER 10001:10001
# Puerto no privilegiado: no hace falta NET_BIND_SERVICE  [#3]
EXPOSE 8000
# La API no tiene /health: GET /metrics es estático y barato
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/metrics', timeout=2).status==200 else 1)"]
# Forma exec para que SIGTERM llegue a uvicorn
ENTRYPOINT ["uvicorn", "health_score.api.app:app_from_env", "--factory", \
            "--host", "0.0.0.0", "--port", "8000", "--no-server-header"]

# =====================================================================
# WEB (dashboard React compilado, servido por nginx sin privilegios)
# =====================================================================

# ---------- web-builder: compila el bundle estático ----------
FROM ${NODE_IMAGE} AS web-builder
# Se replica la estructura del repo: lib/cuit.test.ts importa ../../../tests/fixtures/cuil_cases.json
# y `tsc -b` también revisa las pruebas (spec 005, research R11)
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
# Se necesitan devDependencies (vite, typescript) solo en este stage; no llegan a la imagen final.
# --ignore-scripts evita ejecutar scripts de instalación de terceros
RUN npm ci --ignore-scripts
COPY tests/fixtures/cuil_cases.json /build/tests/fixtures/cuil_cases.json
COPY frontend/ ./
# Espera máxima de la consulta al BCRA en el dashboard; vacío = 28 s (compose.ollama.yaml la sube)
ARG VITE_CREDIT_CHECK_TIMEOUT_MS=""
RUN npm run build

# ---------- web: imagen final ----------
FROM ${NGINX_IMAGE} AS web
LABEL org.opencontainers.image.title="health-score-web" \
      org.opencontainers.image.source="https://github.com/<OWNER>/Customer_Health_Score" \
      org.opencontainers.image.version="0.1.0"

# La imagen base termina con USER 101; se vuelve a root solo para preparar la imagen
# hadolint ignore=DL3002
USER root
# Usuario propio con UID alto, igual que la API; se quitan bits setuid/setgid  [#2]
RUN addgroup -S -g 10001 app \
 && adduser  -S -u 10001 -G app -H -s /sbin/nologin app \
 && rm -f /etc/nginx/conf.d/*.conf \
 && { find / -xdev -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true; }

# Configuración y estáticos propiedad de root, solo lectura para el proceso  [#8]
COPY frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-builder /build/frontend/dist /usr/share/nginx/html

USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
# Se arranca nginx directamente, sin el entrypoint de la base (escribe en /etc/nginx)
ENTRYPOINT ["nginx", "-g", "daemon off;"]
