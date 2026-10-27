# Seguridad de los contenedores

Cómo cumplen los artefactos Docker de este repositorio el
[OWASP Docker Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
y la sección *Contenedores y despliegue* de la
[constitución](.specify/memory/constitution.md) (v2.4.0). Los números entre corchetes son las
reglas del cheat sheet; los mismos números aparecen como comentarios en los archivos.

## Arquitectura

| Servicio | Imagen | Puerto | Redes | Escritura |
|----------|--------|--------|-------|-----------|
| `api` | target `api` (python slim + venv) | 8000, sin publicar | `backend` (interna), `egress` (salida a internet, spec 005) | volumen `dbdata` en `/var/lib/health-score`; `/tmp` en tmpfs |
| `web` | target `web` (nginx sin privilegios) | 8080, publicado en `127.0.0.1:8080` | `frontend`, `backend` | solo `/tmp` en tmpfs |

El navegador solo habla con `web`; nginx reenvía `/api/*` a `api:8000` por la red interna.
`api` sale a internet solo para consultar al BCRA y a Claude (spec 005); `web` no tiene salida.

## Controles

| # | Regla | Dónde | Cómo se cumple |
|---|-------|-------|----------------|
| 0 | Mantener host y Docker actualizados | Dockerfile / host | Bases fijadas por tag y digest; renovarlas periódicamente (ver abajo). Docker y el kernel, en el host |
| 1 | No exponer el socket de Docker | compose.yaml | Ningún servicio monta `/var/run/docker.sock` |
| 2 | Usuario no-root | Dockerfile + compose | `USER 10001:10001` en ambas imágenes y `user: "10001:10001"` en compose |
| 3 | Limitar capabilities | compose.yaml | `cap_drop: [ALL]`, sin `cap_add`: ambos puertos son > 1024 |
| 4 | no-new-privileges | compose.yaml | `security_opt: no-new-privileges:true`; además se quitan los bits setuid/setgid en las imágenes |
| 5 | Comunicación entre contenedores | compose.yaml | Red `backend` con `internal: true`; la API no publica puertos; `web` solo en loopback; sin `network_mode: host`. La red `egress` (solo `api`) es una excepción documentada abajo |
| 6 | Linux Security Module | compose.yaml | Se mantienen seccomp y AppArmor por defecto; ningún perfil `unconfined` ni `privileged` |
| 7 | Limitar recursos | compose.yaml | `mem_limit`/`memswap_limit`, `cpus`, `pids_limit: 200`, `ulimits.nofile`, `restart: on-failure:5` |
| 8 | Solo lectura | compose + Dockerfile | `read_only: true` con `tmpfs` en `/tmp` (`noexec,nosuid,nodev`); el código, la semilla y los estáticos son de root; `config/scoring.json` y `config/prompts/bcra-summary.md` montados `:ro`; solo `dbdata` es escribible |
| 9 | Análisis estático | CI / manual | Trivy o Grype sobre ambas imágenes (pendiente, ver abajo) |
| 10 | Logs | compose + nginx.conf | stdout/stderr, `json-file` con `max-size: 10m` y `max-file: 5`; nginx con `error_log ... info` |
| 11 | Lint del Dockerfile | `.hadolint.yaml` | hadolint con `failure-threshold: warning` |
| 12 | Modo rootless | Host | Ver *Tareas del host* |
| 13 | Secretos | Dockerfile + compose + .dockerignore | La API key de Claude llega como Docker secret `anthropic_api_key` en `/run/secrets/` (ver abajo). Sin secretos en `ENV`/`ARG` ni en la imagen; `.env*`, claves y `secrets/` excluidos del contexto de build y del repositorio |

Controles adicionales: build multi-stage (compiladores, `node_modules` y `src/` no llegan a
las imágenes finales), `npm ci --ignore-scripts`, forma exec en `ENTRYPOINT`, `HEALTHCHECK` en
ambas imágenes, `init: true`, `server_tokens off` y cabeceras de seguridad (CSP,
`X-Frame-Options`, `nosniff`) en nginx.

## Excepciones documentadas

| Control | Excepción | Motivo | Cierre |
|---------|-----------|--------|--------|
| Instalación con hashes (`--require-hashes`) | `pip install .` resuelve versiones sin fijar | `pyproject.toml` no tiene lockfile con hashes y sus dependencias no fijan versión | Generar un lockfile con `pip-compile --generate-hashes` (tarea T064 de la spec 003) |
| Redes dedicadas sin salida (spec 005) | La red `egress` da a `api` salida a cualquier destino de internet | `api` necesita consultar `api.bcra.gob.ar` y `api.anthropic.com`, y Compose no puede limitar la salida por dominio | Proxy de salida con lista de dominios permitidos o firewall del host (ver *Salida a internet de `api`*) |
| Usuario no-root durante el build | `USER root` transitorio en el target `web` | La imagen base de nginx termina con el usuario 101; hace falta root para crear el usuario 10001 y copiar los archivos | La imagen final termina en `USER 10001:10001`; marcado con `hadolint ignore=DL3002` |

## Salida a internet de `api` (spec 005)

La consulta de la situación crediticia necesita que `api` llegue a dos servicios externos:
`api.bcra.gob.ar` (Central de Deudores) y `api.anthropic.com` (Claude). Para eso se agrega la
red `egress`, no interna, a la que solo se conecta `api`; la red `backend` sigue siendo
interna y `web` no tiene salida.

**Excepción** (constitución, *Contenedores y despliegue*; spec 005, FR-030 y research R13):
Compose no puede limitar la salida por dominio, así que `api` puede salir a cualquier destino
de internet. Se acepta para esta versión porque un proxy de salida suma una imagen, su
configuración y su endurecimiento (Principio I).

Recomendación para producción: poner un proxy de salida (por ejemplo, Squid) con una lista de
dominios permitidos limitada a `api.bcra.gob.ar` y `api.anthropic.com`, o reglas de firewall
en el host que bloqueen el resto del tráfico saliente del contenedor.

En modo demostración (`compose.demo.yaml`) la API no usa la salida: el BCRA y el modelo se
simulan con datos ficticios.

## Secreto `anthropic_api_key`

La API key de Claude se maneja como Docker secret y nunca como variable de entorno, `ARG` ni
archivo de la imagen (FR-025).

1. Crear el archivo local, fuera del control de versiones (`secrets/` está en `.gitignore` y
   en `.dockerignore`):

   ```powershell
   New-Item -ItemType Directory -Force secrets | Out-Null
   Set-Content -NoNewline -Encoding ascii secrets/anthropic_api_key.txt "<tu clave>"
   ```

2. `compose.yaml` lo monta en `/run/secrets/anthropic_api_key` y la API lo lee a través de
   `ANTHROPIC_API_KEY_FILE`, que contiene la ruta y no la clave.
3. Verificar que la clave no quedó expuesta: `docker compose exec api env` no debe mostrarla.

El archivo tiene que existir para que `docker compose up` arranque. Para la demostración
alcanza con un valor ficticio, porque en ese modo la clave no se usa. Sin una clave válida,
la API arranca igual y la consulta al BCRA responde "resumen no disponible" cuando hay deudas.

## Verificación

```bash
bash .claude/skills/owasp-docker-secure/scripts/audit.sh . health-score-api:dev
hadolint --config .hadolint.yaml Dockerfile
trivy image --severity HIGH,CRITICAL health-score-api:dev
trivy image --severity HIGH,CRITICAL health-score-web:dev
docker inspect --format '{{.Config.User}} {{.HostConfig.CapDrop}} {{.HostConfig.ReadonlyRootfs}}' health-score-api-1
```

La constitución exige hadolint sin errores y ningún HIGH/CRITICAL sin justificar antes de
publicar una imagen.

## Renovar las imágenes base

Los digests del `Dockerfile` se verificaron el 2026-10-22. Para renovarlos:

```bash
docker buildx imagetools inspect python:3.13-slim-bookworm
docker buildx imagetools inspect node:22-bookworm-slim
docker buildx imagetools inspect nginxinc/nginx-unprivileged:1.28-alpine
```

Copiar el `Digest:` de cada uno en el `ARG` correspondiente, reconstruir y volver a escanear.

## Tareas del host

No se pueden forzar desde el repositorio:

- Mantener Docker Engine y el kernel actualizados [#0].
- Ejecutar Docker en modo rootless o con `userns-remap` [#12].
- En `daemon.json`: `"icc": false` y `"log-level": "info"` [#5, #10].
- En producción, poner un proxy inverso con TLS delante de `127.0.0.1:8080`.
- Escanear las imágenes en CI antes de publicarlas [#9].
