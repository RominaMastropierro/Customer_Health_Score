# Research: Motor de Scoring de Salud de Clientes

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-10

El Technical Context no tenía puntos marcados como NEEDS CLARIFICATION, porque la
constitución fija el stack. Este documento registra las decisiones de diseño que la spec dejó
abiertas.

## R1. Normalización de cada métrica a 0–100

**Decision**: normalización lineal con recorte (*clamp*) a [0, 100]:

| Métrica | Sub-score |
|---------|-----------|
| Uso (%) | `uso` |
| Tickets (30 días) | `100 × (1 − min(tickets, tope) / tope)` |
| NPS | `nps × 10` |
| Días hasta renovación | `100 × min(días, horizonte) / horizonte` |

`tope` (`ticket_cap`) y `horizonte` (`renewal_horizon_days`) salen de la configuración.

**Rationale**: es la opción más simple y explicable para un equipo de negocio, y cumple los
casos borde de la spec: más tickets que el tope dan sub-score 0, y más días que el horizonte
dan 100.

**Alternatives considered**: curvas no lineales (logarítmica para tickets) o tramos por
puntos de corte. Se descartaron porque agregan parámetros sin un requisito que los pida;
pueden incorporarse más adelante como otra estrategia de normalización configurable.

## R2. Agregación y redondeo del score

**Decision**: score = Σ(peso × sub-score) / Σ(pesos), calculado con aritmética racional
exacta (`fractions.Fraction`) y redondeado al entero más cercano, con los empates hacia
arriba (*half-up*). Los sub-scores se exponen redondeados a 2 decimales, solo para mostrarlos.

**Rationale**: `round()` de Python redondea los empates al par (*banker's rounding*), y la
aritmética de punto flotante puede convertir un 74,5 exacto en 74,4999…, lo que cambiaría
el nivel de un cliente que está en el umbral. Con `Fraction` el resultado es exacto y
reproducible (FR-008). Al dividir por la suma de pesos, los pesos no necesitan sumar 100.

**Alternatives considered**: `decimal.Decimal` con `ROUND_HALF_UP` (equivalente, pero
requiere configurar la precisión) y `float` con `round()` (descartado por lo anterior).

## R3. Pesos: escala libre normalizada

**Decision**: los pesos son números ≥ 0 en cualquier escala (p. ej., 25/25/25/25 o 1/1/1/1).
Se rechaza la configuración si alguno es negativo o si todos son 0.

**Rationale**: así no se obliga a quien configura a que la suma dé exactamente 100, que es una
fuente frecuente de errores al editar a mano, y el resultado es el mismo.

**Alternatives considered**: exigir que los pesos sumen 1 o 100. Se descartó porque solo
agrega una validación que el usuario puede violar sin ganar nada.

## R4. Umbrales y asignación de nivel

**Decision**: dos umbrales enteros, `top` y `at_risk`, con `0 ≤ at_risk < top ≤ 100`.
Nivel = `Top` si score ≥ top, `En riesgo` si score < at_risk, `Estable` en otro caso. Los
valores del enum de nivel son exactamente `"Top"`, `"Estable"` y `"En riesgo"`.

**Rationale**: así funciona el caso borde de la spec (un score igual al umbral sube de
nivel) y se evitan solapamientos.

## R5. Validación de la cartera sin cortar la evaluación

**Decision**: el endpoint de cartera valida con Pydantic la **estructura** de la solicitud
(una lista de objetos con `client_id` y un objeto `metrics`). Después valida las métricas de
**cada** cliente por separado con `ClientMetrics.model_validate`. Si un cliente falla, su
resultado lleva el error y el resto se evalúa igual (FR-014). Si falla la estructura (por
ejemplo, el body no es una lista), la respuesta es 422.

**Rationale**: si se validara toda la cartera con un solo modelo, un único cliente inválido
produciría un 422 para la solicitud entera y violaría FR-014. La validación sigue siendo
Pydantic y sigue ocurriendo en el límite, así que cumple el Principio V.

## R6. Validación estricta de métricas

**Decision**: las métricas usan `StrictInt` con límites tomados de `METRIC_RANGES`. Se
rechazan `5.0`, `"5"`, `true`, `null`, campos faltantes y campos extra (`extra="forbid"`).

**Rationale**: la spec y la constitución piden rechazar decimales y no numéricos. En modo no
estricto, Pydantic convertiría `"5"` y `5.0` en 5 sin avisar.

## R7. Cuándo se aplica un cambio de configuración

**Decision**: la API carga `config/scoring.json` al iniciar (la ruta se puede cambiar con la
variable de entorno `HEALTH_SCORE_CONFIG`). Si es inválido, el servicio no arranca y muestra
el error. Para aplicar un cambio hay que reiniciar el servicio. `GET /config` muestra la
configuración activa. Las funciones de la biblioteca reciben la configuración como
parámetro, así que cada interfaz decide cuál usar.

**Rationale**: es el enfoque más simple y predecible: no hay estado cambiante ni recargas a
mitad de una cartera. Cumple SC-004 (aplicar un cambio en < 5 min sin desarrollo): se edita
el JSON y se reinicia.

**Alternatives considered**: recargar el archivo en cada solicitud o al detectar cambios en
el archivo. Se descartaron porque una configuración inválida guardada a medias rompería
solicitudes en curso y porque agregan complejidad sin requisito.

## R8. "Usable desde cualquier interfaz"

**Decision**: se entregan dos interfaces: la **biblioteca Python** (`health_score`) y la
**API HTTP** documentada en OpenAPI. Una UI gráfica queda fuera de esta feature.

**Rationale**: la API HTTP la puede consumir cualquier lenguaje, planilla o frontend. Una UI
exigiría justificar otro framework (Principio I) y no la pide ningún criterio de aceptación.
La paridad entre interfaces se verifica con un test (SC-005).

## R9. Origen de la cartera almacenada

**Decision**: el protocolo `ClientRepository` define `list_clients()` y `get_client(id)`. La
implementación `LocalJsonClientRepository` lee `data/clients.json`, valida cada registro con
Pydantic y conserva los registros inválidos como errores, para que se reporten igual que en
R5.

**Rationale**: cumple el Principio IV. Integrar más adelante Google Sheets u otra API solo
requeriría escribir otro repositorio.
