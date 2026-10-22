# Contrato HTTP: cambios de la spec 003

Cambio aditivo (FR-020): `POST /score`, `POST /portfolio/score`, `GET /portfolio`,
`GET /clients/{client_id}/score`, `GET /config` y `GET /metrics` conservan rutas, campos de
entrada, campos de salida existentes y códigos. La única novedad es el campo `cuil` en las
respuestas de la cartera almacenada (FR-034), con esquemas nuevos que extienden los anteriores:
`StoredPortfolioResult` y `StoredClientScoreResult`. `ClientScoreResult` y `PortfolioResult`
no cambian. Además, los endpoints que leen la base declaran 503 si no está disponible.

| Endpoint | `cuil` en cada resultado |
|----------|--------------------------|
| `GET /portfolio` | CUIL del cliente persistido (11 dígitos) |
| `GET /clients/{client_id}/score` | CUIL del cliente persistido (11 dígitos) |
| `POST /portfolio/score` | ausente: la respuesta no cambia (cartera enviada en la solicitud; la entrada **no** acepta `cuil`) |
| `POST /score` | no aplica: devuelve `ScoreResult`, sin cambios |

Ejemplo de un resultado de `GET /portfolio` (campos previos sin cambios):

```json
{
  "client_id": "C-001",
  "cuil": "20900000015",
  "name": "Acme Ficticia",
  "metrics": {"usage": 90, "support_tickets": 0, "nps": 9, "days_to_renewal": 300},
  "result": {"score": 95, "level": "Top", "sub_scores": {"usage": 90.0, "support_tickets": 100.0, "nps": 90.0, "renewal": 100.0}},
  "errors": null
}
```

Formato de errores, igual que las specs anteriores:
- 422: `{"detail": [{"loc": [...], "msg": "<español>", "type": "..."}]}`
- 404 / 409: `{"detail": "<mensaje en español>"}`

## Esquemas

`ClientData` (cuerpo de `POST /clients` y `PUT /clients/{client_id}`)

```json
{
  "cuil": "20900000244",
  "name": "Cliente Ficticio",
  "metrics": {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}
}
```

El cuerpo **no** lleva `client_id`: si se envía → 422 "campo no permitido".

`ClientRecord` (respuesta): `client_id` + los campos de `ClientData`; `cuil` siempre sin
guiones. En un alta, `client_id` es el UUID v4 generado por el servicio:

```json
{
  "client_id": "3f2b8c1e-9a4d-4e7b-8c21-5d6f0a9b1c2d",
  "cuil": "20900000244",
  "name": "Cliente Ficticio",
  "metrics": {"usage": 60, "support_tickets": 3, "nps": 7, "days_to_renewal": 90}
}
```

`cuil` en la entrada: texto de 11 dígitos, o `XX-XXXXXXXX-X`; se normaliza a 11 dígitos.

## Endpoints nuevos

| Método y ruta | Éxito | Errores |
|---------------|-------|---------|
| `POST /clients` | 201 `ClientRecord` + `Location: /clients/{client_id}` | 409 CUIL ya existe (o id generado ya existente); 422 |
| `GET /clients` | 200 `list[ClientRecord]` (orden de alta) | — |
| `GET /clients/{client_id}` | 200 `ClientRecord` | 404 |
| `PUT /clients/{client_id}` | 200 `ClientRecord` | 404; 409 CUIL de otro cliente; 422 |
| `DELETE /clients/{client_id}` | 204 sin cuerpo | 404 |

### Mensajes

| Caso | Código | `detail` / `msg` |
|------|--------|------------------|
| Cliente inexistente | 404 | `Cliente 'C-999' no encontrado` |
| `client_id` generado ya existente | 409 | `Ya existe un cliente con el identificador '<uuid>'` |
| CUIL duplicado | 409 | `El CUIL '20900000015' ya está registrado en otro cliente` |
| CUIL con formato incorrecto (loc `["body","cuil"]`) | 422 | `el CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)` |
| Dígito verificador inválido | 422 | `el dígito verificador del CUIL no es válido` |
| CUIL faltante / campo extra (incluido `client_id`) | 422 | `campo obligatorio` / `campo no permitido` |
| Métrica fuera de rango | 422 | el mensaje de rango existente (`range_message`) |

Todos los errores de validación se informan juntos (FR-017). 422 tiene prioridad sobre 409.

## Casos de ejemplo

| Entrada `cuil` | Resultado |
|----------------|-----------|
| `"20900000015"` | válido |
| `"20-90000001-5"` | válido, se guarda como `20900000015` |
| `"20900000016"` | 422 dígito verificador |
| `"2090000001"` (10), `"209000000150"` (12) | 422 formato |
| `"2090000001A"`, `" 20900000015"`, `"20-9000000-15"`, `20900000015` (número JSON), `null`, `""` | 422 formato |
| `"20900000015"` ya registrado en otro cliente | 409 |
| Cuerpo sin `cuil` | 422 campo obligatorio |

## Configuración de entorno

| Variable | Default | Uso |
|----------|---------|-----|
| `HEALTH_SCORE_DB` | `data/health_score.db` | Archivo SQLite de la cartera (nuevo) |
| `HEALTH_SCORE_CLIENTS` | `data/clients.json` | Ahora es el archivo de la carga inicial |
| `HEALTH_SCORE_CONFIG` | `config/scoring.json` | Sin cambios |
