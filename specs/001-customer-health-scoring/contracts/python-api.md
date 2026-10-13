# Contract: Interfaz pública de la biblioteca `health_score`

Este contrato vale para cualquier interfaz que use el motor directamente (scripts, notebooks,
otra UI). Todo lo que no se exporta desde `health_score/__init__.py` es interno.

## Funciones

### `load_config(path: str | os.PathLike) -> ScoringConfig`

Lee y valida un JSON de configuración ([scoring-config.schema.json](scoring-config.schema.json)).

- Lanza `ConfigError` si el archivo no existe, no es JSON válido o incumple alguna regla
  (ver [data-model.md](../data-model.md#scoringconfig)). El mensaje indica la ruta del campo y
  el motivo.
- Nunca devuelve una configuración parcial ni completa valores con defaults implícitos.

### `score_client(metrics: ClientMetrics, config: ScoringConfig) -> ScoreResult`

Es una función pura y determinista: no hace I/O, no usa la fecha y no tiene estado global.
Asume que la entrada ya está validada (Principio V), es decir, que `ClientMetrics` y
`ScoringConfig` ya pasaron por Pydantic.

### `score_portfolio(clients: Iterable[ClientInput], config: ScoringConfig) -> PortfolioResult`

- `ClientInput` es un `Client` válido o un registro inválido que trae sus `FieldError`.
- Devuelve un resultado por cliente en el mismo orden de entrada, con `summary` calculado.
- Un cliente inválido no interrumpe la evaluación del resto.

### `classify(score: int, config: ScoringConfig) -> HealthLevel`

Asigna el nivel a un score (R4). Se expone para que las interfaces puedan mostrar los
umbrales sin duplicar la regla.

## Tipos exportados

`ClientMetrics`, `Client`, `ScoringConfig`, `ScoreResult`, `SubScores`, `HealthLevel`,
`ClientScoreResult`, `PortfolioResult`, `FieldError`, `ConfigError`, `Metric`,
`METRIC_RANGES`. Sus campos se describen en [data-model.md](../data-model.md).

## Garantías

1. Con las mismas métricas y la misma configuración, `score_client` devuelve siempre el mismo
   `ScoreResult`.
2. `0 ≤ score ≤ 100` y `0 ≤ sub_score ≤ 100` para toda entrada válida.
3. El resultado de la biblioteca es idéntico al de la API HTTP para la misma entrada y la
   misma configuración (SC-005).
