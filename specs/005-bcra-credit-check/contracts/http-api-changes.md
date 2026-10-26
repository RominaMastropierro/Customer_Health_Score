# Contrato HTTP: `POST /credit-status`

Cambio **aditivo**: ningún endpoint existente cambia. Se documenta en OpenAPI con modelos
Pydantic y sus códigos de respuesta (Principio VIII).

## Solicitud

```http
POST /credit-status
Content-Type: application/json

{ "cuil": "20-90000024-4" }
```

- `cuil`: 11 dígitos, o `XX-XXXXXXXX-X` (tipo `Cuil`, la misma regla que `POST /clients`).
- El dashboard envía siempre los 11 dígitos sin guiones (FR-005). El servicio acepta igual
  ambos formatos y al BCRA siempre le envía los 11 dígitos (FR-010).
- El CUIT va en el cuerpo y no en la URL, para que no quede en los access logs (research R1).

## Respuestas

### 200 `CreditStatus`

```json
{ "status": "with_debts", "tone": "warning", "message": "<texto redactado por el modelo>" }
```

```json
{ "status": "no_data", "tone": null, "message": "El BCRA no registra deudas informadas para este CUIT/CUIL." }
```

```json
{ "status": "bcra_unavailable", "tone": null, "message": "No pudimos consultar la situación en el BCRA en este momento. Intentá de nuevo en unos minutos." }
```

```json
{ "status": "summary_unavailable", "tone": null, "message": "No pudimos preparar el resumen de la situación en el BCRA. Intentá de nuevo en unos minutos." }
```

Los cuatro casos son 200 porque la consulta se resolvió; `status` dice qué mostrar (research R2).

### 422: CUIT inválido o cuerpo mal formado

El formato es el mismo de toda la API (handler `spanish_validation_errors`):

```json
{ "detail": [ { "loc": ["body", "cuil"], "msg": "el dígito verificador del CUIL no es válido", "type": "cuil_check_digit" } ] }
```

No se consulta ni al BCRA ni al modelo.

## Llamada saliente al BCRA (no expuesta)

```http
GET https://api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/20900000244
```

| Respuesta del BCRA | Resultado |
|--------------------|-----------|
| 200 con períodos y entidades válidos | se pide el texto al modelo |
| 200 sin períodos, o sin entidades en el más reciente | `no_data` |
| 404 | `no_data` |
| 400, 429, 5xx, timeout (10 s), sin conexión, JSON inválido o con otra estructura | `bcra_unavailable` |

## Llamada saliente al modelo (no expuesta)

`anthropic.Anthropic().with_options(timeout=15.0, max_retries=0).messages.create(...)`, con
`model` = `HEALTH_SCORE_SUMMARY_MODEL` (por defecto `claude-opus-5-5`),
`output_config={"effort": "low"}`, `max_tokens=2000`, `system` = el prompt (con
`cache_control`), y un mensaje del usuario con `<respuesta_bcra>` y `<datos_calculados>`
(research R8). Fallas → `summary_unavailable` (research R6).

## Configuración nueva (variables de entorno)

| Variable | Default | Uso |
|----------|---------|-----|
| `HEALTH_SCORE_BCRA_URL` | `https://api.bcra.gob.ar/CentralDeDeudores/v1.0` | Base del BCRA (un servidor simulado en demos) |
| `HEALTH_SCORE_SUMMARY_PROMPT` | `config/prompts/bcra-summary.md` | Prompt versionado |
| `HEALTH_SCORE_SUMMARY_MODEL` | `claude-opus-5-5` | Modelo de Claude |
| `ANTHROPIC_API_KEY_FILE` | sin definir | Ruta del secreto con la API key (Docker: `/run/secrets/anthropic_api_key`) |

## Compatibilidad

- `EXPECTED_ENDPOINTS` de `tests/contract/test_http_api.py` no cambia; se agrega una prueba
  propia para `/credit-status` (modelo de respuesta, `summary`, `description`, 422 declarado).
- `create_app(config, repository)` suma dos parámetros opcionales, `credit_source` y
  `summarizer`. Las pruebas existentes lo llaman sin ellos y siguen funcionando: sin ellos,
  `/credit-status` responde `bcra_unavailable` o `summary_unavailable`, y nunca sale a la red.
