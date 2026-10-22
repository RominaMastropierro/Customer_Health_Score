# syntax=docker/dockerfile:1.7
ARG GO_IMAGE=golang:1.22-bookworm@sha256:<PIN_ME>
ARG RUNTIME_IMAGE=gcr.io/distroless/static-debian12:nonroot@sha256:<PIN_ME>

# ---------- builder ----------
FROM ${GO_IMAGE} AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download && go mod verify
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/app ./cmd/app

# ---------- runtime: sin shell, sin gestor de paquetes, no-root  [#2, #8] ----------
FROM ${RUNTIME_IMAGE}
LABEL org.opencontainers.image.source="<REPO_URL>" \
      org.opencontainers.image.version="<VERSION>"
COPY --from=builder --chown=65532:65532 /out/app /app
USER 65532:65532
EXPOSE 8080
# Distroless no tiene shell ni curl: implementar un flag `-healthcheck` en el binario o usar la sonda del orquestador
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["/app", "-healthcheck"]
ENTRYPOINT ["/app"]
