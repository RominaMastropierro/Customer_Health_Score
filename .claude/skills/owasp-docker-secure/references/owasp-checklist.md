# Checklist OWASP para Docker

Fuente: OWASP Docker Security Cheat Sheet (reglas #0–#13) y OWASP Docker Top 10 (D01–D10). Úsalo para auditar los archivos generados. Marca cada punto como CUMPLE / N/A (con motivo) / EXCEPCIÓN (documentada).

## Reglas del Cheat Sheet

| # | Regla | Dónde se aplica | Verificación |
|---|---|---|---|
| 0 | Mantener host y Docker actualizados | Host (recomendación) | Mencionarlo en el resumen; base fijada y renovada |
| 1 | No exponer el socket del daemon de Docker | compose.yaml | Sin volumen `/var/run/docker.sock`; sin daemon por TCP sin TLS |
| 2 | Definir un usuario no-root | Dockerfile + compose | `USER <uid>` presente; `user:` de compose coincide |
| 3 | Limitar capabilities | compose | `cap_drop: [ALL]`; `cap_add` mínimo y justificado |
| 4 | no-new-privileges | compose | `security_opt: no-new-privileges:true` |
| 5 | Deshabilitar comunicación entre contenedores | compose / daemon | Redes dedicadas, `internal: true` en backends, sin `network_mode: host`; `icc=false` en daemon recomendado |
| 6 | Usar un Linux Security Module | compose | Sin perfiles `unconfined`; seccomp/AppArmor por defecto; perfil propio si hace falta |
| 7 | Limitar recursos | compose | `mem_limit`, `cpus`, `pids_limit`, `ulimits`, reinicio acotado |
| 8 | Filesystem y volúmenes de solo lectura | compose | `read_only: true`, `tmpfs` para rutas escribibles, volúmenes `:ro` cuando sea posible |
| 9 | Usar herramientas de análisis estático | CI / audit.sh | Trivy/Grype/Docker Scout ejecutados; base fijada por digest |
| 10 | Nivel de log al menos INFO | compose / daemon | Driver con rotación; la app escribe a stdout/stderr |
| 11 | Lint del Dockerfile en build | `.hadolint.yaml` | hadolint sin errores |
| 12 | Modo rootless | Host (recomendación) | Mencionar Docker rootless / userns-remap |
| 13 | Usar Docker secrets | Dockerfile + compose | Sin secretos en ENV/ARG/COPY; `secrets:` o montajes secretos de BuildKit |

## Mapeo con el Docker Top 10

| ID | Riesgo | Mitigación en los archivos generados |
|---|---|---|
| D01 | Mapeo seguro de usuarios | UID numérico no-root; userns-remap/rootless recomendado |
| D02 | Gestión de parches | Base fijada y renovada periódicamente |
| D03 | Segmentación de red y firewall | Redes dedicadas/internas, puertos publicados mínimos |
| D04 | Valores seguros por defecto y hardening | cap_drop ALL, no-new-privileges, FS de solo lectura |
| D05 | Mantener contextos de seguridad | No mezclar niveles de confianza en un mismo host/red; redes por capa |
| D06 | Proteger secretos | Docker secrets, `.dockerignore` para `.env` |
| D07 | Protección de recursos | CPU, memoria, PIDs, ulimits |
| D08 | Integridad y origen de la imagen | Imágenes oficiales/verificadas, digest fijado, verificación de firma opcional (cosign / DOCKER_CONTENT_TRUST) |
| D09 | Paradigma inmutable | rootfs `read_only`, sin instalar paquetes en runtime |
| D10 | Logging | stdout/stderr + rotación, recolección centralizada recomendada |

## Señales de alarma (detenerse y corregir)

`privileged: true`, `network_mode: host`, `pid: host`, `ipc: host`, `cap_add: [ALL]` o `SYS_ADMIN`, `user: root`, tag `latest`, secretos en `ENV`, `docker.sock` montado, `curl | sh`, `chmod 777`, `ADD http://`, `--security-opt seccomp=unconfined`.
