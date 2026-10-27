---
name: owasp-docker-secure
description: Genera artefactos Docker endurecidos (Dockerfile, .dockerignore, docker-compose.yaml, configuración de hadolint y comandos de ejecución) que siguen el OWASP Docker Security Cheat Sheet y el OWASP Docker Top 10. Usa esta skill siempre que el usuario pida crear, dockerizar, contenerizar, revisar o endurecer un Dockerfile, un docker-compose o cualquier configuración de contenedores para cualquier aplicación (Python, Node, Go, Java, etc.), aunque no mencione OWASP ni seguridad. Frases que deben activarla - "crear contenedor", "dockerizar", "archivos docker", "Dockerfile seguro", "endurecer contenedor", "containerize", "create Docker files", "harden Docker".
---

# Generación de archivos Docker conformes con OWASP

Produce los archivos necesarios para construir y ejecutar un contenedor de modo que la configuración segura sea la opción por defecto y no un añadido posterior. Cada control de abajo se asocia a una regla del OWASP Docker Security Cheat Sheet (número entre corchetes) para que el usuario pueda rastrear cada decisión.

Responde en el idioma del usuario. Escribe los comentarios de los archivos generados en español, salvo que el usuario pida otro idioma. Los identificadores técnicos (`cap_drop`, `USER`, `read_only`, etc.) se dejan siempre tal cual.

## Flujo de trabajo

1. **Reúne contexto** del proyecto o del usuario. Revisa primero el repositorio y pregunta solo lo que no puedas inferir:
   - Lenguaje/runtime y punto de entrada (inspecciona `package.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `pom.xml`).
   - Puerto(s) de escucha y si la app necesita escribir en disco (qué rutas).
   - Servicios auxiliares (BD, caché), secretos y si corre detrás de un proxy inverso.
   - Entorno de destino: desarrollo local, CI o producción (afecta límites de recursos y fijado de imágenes).
2. **Elige una plantilla base** de `assets/` (`Dockerfile.python`, `Dockerfile.node`, `Dockerfile.go`) y adáptala. Para otros runtimes, sigue la misma estructura: build multi-stage, imagen final mínima y usuario no-root.
3. **Genera el conjunto de archivos** (ver abajo), adaptando los valores al proyecto.
4. **Autoauditoría** contra `references/owasp-checklist.md` y corrige las brechas antes de presentar. Si `hadolint` o `trivy` están disponibles, ejecuta `scripts/audit.sh`.
5. **Entrega** los archivos con un resumen breve: qué regla OWASP cubre cada archivo, qué debe hacer el usuario manualmente (reglas a nivel de host, fijar digests, escaneo) y cualquier desviación deliberada con su motivo.

## Conjunto de archivos a producir

| Archivo | Propósito |
|---|---|
| `Dockerfile` | Multi-stage, no-root, mínimo, base fijada |
| `.dockerignore` | Evita que secretos, `.git`, entornos locales y basura entren al contexto de build |
| `compose.yaml` | Endurecimiento en ejecución: capabilities, FS de solo lectura, límites, redes, secretos |
| `.hadolint.yaml` | Reglas de lint aplicadas en build o CI (regla #11) |
| `SECURITY-DOCKER.md` (opcional, si lo piden o es producción) | Mapea cada control con su regla OWASP |

## Valores por defecto innegociables

Son el comportamiento por defecto porque cada uno cierra una vía habitual de escape de contenedor o ataque a la cadena de suministro. Desvíate solo si la app realmente lo necesita y dilo explícitamente en el resumen.

**Dockerfile**
- Fija la imagen base por tag **y** digest (`imagen:1.2.3@sha256:...`); nunca `latest`. Indica al usuario que renueve el digest periódicamente [#0, #9].
- Prefiere bases slim, distroless o alpine; usa builds multi-stage para que compiladores y herramientas de build no lleguen a la imagen final.
- Crea un usuario dedicado sin privilegios con UID/GID numérico fijo (≥10000) y define `USER` antes de `ENTRYPOINT` [#2].
- Usa `COPY --chown` en lugar de capas con `chown -R`; nunca `ADD` con URLs remotas; evita `curl | sh`.
- Sin secretos en `ENV`, `ARG` ni `COPY`. Usa `--mount=type=secret` de BuildKit cuando el build necesite credenciales [#13].
- No instales `sudo` ni `ssh`, y no dejes cachés del gestor de paquetes. Elimina binarios setuid/setgid cuando sea viable.
- Usa forma exec (array JSON) en `ENTRYPOINT`/`CMD` para que las señales lleguen al proceso; añade `HEALTHCHECK`.
- Añade metadatos con `LABEL` (origen, versión) para trazabilidad.

**compose.yaml / flags de ejecución**
- `user:` numérico no-root [#2]
- `cap_drop: [ALL]` y luego `cap_add` solo de lo que se demuestre necesario (p. ej. `NET_BIND_SERVICE` si se enlaza un puerto <1024, aunque es preferible usar un puerto alto) [#3]
- `security_opt: ["no-new-privileges:true"]` [#4]
- Redes dedicadas; marca como `internal: true` las redes de backend; nunca `network_mode: host`; no publiques puertos innecesarios y enlaza a `127.0.0.1` cuando solo lo consuma un proxy local [#5]
- Mantén los perfiles seccomp y AppArmor por defecto; nunca `seccomp:unconfined`, `apparmor:unconfined` ni `privileged: true` [#6]
- Límites de recursos: memoria, CPU, `pids_limit`, `ulimits` (nofile) y política de reinicio acotada como `on-failure:5` [#7]
- `read_only: true` con `tmpfs` para `/tmp` y cualquier otra ruta que deba ser escribible; monta volúmenes `:ro` salvo que necesiten escritura [#8]
- Secretos mediante `secrets:` (archivos en `/run/secrets`), no variables de entorno [#13]
- Driver de logs con rotación (`json-file` con `max-size`/`max-file`) [#10]
- **Nunca** montes `/var/run/docker.sock` en un contenedor [#1]

## Lo que depende del host o del daemon (no se puede forzar con archivos)

Menciónalo en el resumen como recomendación, porque el usuario debe aplicarlo fuera del repositorio: mantener Docker y el kernel actualizados [#0], ejecutar Docker en modo rootless o con remapeo de user namespaces [#12], `icc=false` y nivel de log `info` a nivel de daemon [#5, #10], y escanear imágenes con Trivy/Grype en CI [#9].

## Adaptación por stack

- **Python**: `PYTHONDONTWRITEBYTECODE=1`, `PYTHONUNBUFFERED=1`; instala en un venv en el builder y copia solo eso; usa `pip install --no-cache-dir --require-hashes` si existe un lockfile con hashes.
- **Node**: usa `npm ci --omit=dev`; define `NODE_ENV=production`; ejecuta `node` directamente (no `npm start`) para que las señales se propaguen; considera `tini` o `init: true`.
- **Go**: compila un binario estático (`CGO_ENABLED=0`) y entrégalo sobre `gcr.io/distroless/static-debian12:nonroot` o `scratch`.
- **Java**: usa una base solo JRE, compila con Maven/Gradle en el stage de build y configura flags de memoria conscientes del contenedor.
- Si la app necesita enlazar el puerto 80/443, cámbialo a 8080/8443 y mapéalo hacia fuera en vez de añadir capabilities.

## Estándar de calidad de la salida

- Todos los archivos deben ser coherentes entre sí (mismo UID en Dockerfile y compose, mismo puerto en `EXPOSE`, healthcheck y compose).
- Comenta cada línea de endurecimiento con el número de regla OWASP, de forma concisa, para que los revisores vean por qué existe.
- No inventes digests ni resultados de CVE. Usa un placeholder claramente marcado (`@sha256:<PIN_ME>`) e indica cómo obtener el real (`docker buildx imagetools inspect <imagen:tag>`).
- Si la petición del usuario choca con un control (p. ej. "ejecútalo como root", "monta docker.sock"), explica brevemente el riesgo, ofrece la alternativa segura y relaja el control solo si el usuario confirma que lo necesita, documentando la excepción.

## Referencias

- `references/owasp-checklist.md`: checklist regla por regla (#0–#13) y mapeo con el OWASP Docker Top 10. Léelo en el paso de autoauditoría.
- `assets/`: plantillas para copiar y adaptar: `Dockerfile.python`, `Dockerfile.node`, `Dockerfile.go`, `compose.yaml`, `.dockerignore`, `.hadolint.yaml`.
- `scripts/audit.sh`: ejecuta hadolint, `docker compose config` y el escaneo de configuración de Trivy cuando están instalados.
