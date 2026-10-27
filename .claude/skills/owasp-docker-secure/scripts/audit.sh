#!/usr/bin/env bash
# Audita los archivos Docker generados. Uso: scripts/audit.sh [directorio_proyecto] [nombre_imagen]
# Ejecuta las herramientas que estén instaladas e informa de las omitidas.
set -uo pipefail
DIR="${1:-.}"; IMAGE="${2:-}"; rc=0
cd "$DIR" || exit 1

echo "== Búsqueda de señales de alarma (OWASP) =="
# Se ignoran las líneas que son solo comentarios para que no generen falsos positivos
if grep -nEi 'privileged:\s*true|network_mode:\s*host|pid:\s*host|docker\.sock|unconfined|cap_add:.*(ALL|SYS_ADMIN)|user:\s*"?root|:latest\b|curl[^|]*\|\s*(ba)?sh' Dockerfile* compose*.y*ml 2>/dev/null | grep -vE '^[^:]+:[0-9]+:\s*#'; then
  echo "!! se encontraron señales de alarma (ver arriba)"; rc=1
else echo "ninguna encontrada"; fi

echo; echo "== Controles requeridos =="
for k in 'cap_drop' 'no-new-privileges' 'read_only' 'pids_limit' 'mem_limit|memory' 'user:'; do
  grep -Eq "$k" compose*.y*ml 2>/dev/null && echo "ok     compose: $k" || { echo "FALTA  compose: $k"; rc=1; }
done
grep -Eq '^USER ' Dockerfile* 2>/dev/null && echo "ok     Dockerfile USER" || { echo "FALTA  Dockerfile USER"; rc=1; }

echo; echo "== hadolint =="
if command -v hadolint >/dev/null; then hadolint --config .hadolint.yaml Dockerfile || rc=1
else echo "omitido (hadolint no está instalado)"; fi

echo; echo "== docker compose config =="
if command -v docker >/dev/null; then docker compose config -q && echo "válido" || rc=1
else echo "omitido (docker no está instalado)"; fi

echo; echo "== trivy =="
if command -v trivy >/dev/null; then
  trivy config --severity HIGH,CRITICAL --exit-code 1 . || rc=1
  [ -n "$IMAGE" ] && { trivy image --severity HIGH,CRITICAL "$IMAGE" || true; }
else echo "omitido (trivy no está instalado)"; fi

exit $rc
