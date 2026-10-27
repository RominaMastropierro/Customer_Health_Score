# Quickstart: validar el dashboard de punta a punta

Guía para comprobar que la feature funciona. No contiene código de implementación; los
formatos están en [contracts/](contracts/) y [data-model.md](data-model.md).

## Requisitos

- Python 3.12+ con el paquete instalado (`pip install -e ".[dev]"`, ver [README](../../README.md)).
- Node.js 20+ y npm.

## 1. Backend: cambios de la spec 001

```powershell
pytest
```

Resultado esperado: la suite completa pasa, incluidos los tests nuevos de
[http-api-changes.md](contracts/http-api-changes.md) (C1 `metrics`, C2 mensajes en español,
C3 `GET /metrics`).

```powershell
uvicorn health_score.api.app:app_from_env --factory --reload
```

Verificación manual en `http://127.0.0.1:8000/docs`:

| Paso | Esperado |
|------|----------|
| `GET /portfolio` | cada elemento de `results` trae `metrics`; los inválidos traen los valores originales |
| `GET /metrics` | 4 elementos; `usage` 0–100, `nps` 0–10, `support_tickets` y `days_to_renewal` con `max: null` |
| `POST /score` con `nps: 11` | 422 con `msg` "debe ser un entero entre 0 y 10" |

## 2. Frontend

```powershell
cd frontend
npm install
npm test          # Vitest: contrato de la API cliente, estados y pantallas
npm run dev       # http://localhost:5173, con proxy /api → 127.0.0.1:8000
```

Con la API corriendo (paso 1), abrir `http://localhost:5173`.

## 3. Escenarios de aceptación

| # | Historia | Acción | Resultado esperado |
|---|----------|--------|--------------------|
| 1 | US1 | Abrir la app | Pantalla Cartera. Los KPIs coinciden con `summary` de `GET /portfolio`; Top + Estable + En riesgo + Inválido = Total |
| 2 | US1 | Buscar "C-00" y luego filtrar "En riesgo"; ordenar ↑ | Solo clientes En riesgo que coinciden, del score más bajo al más alto; el contador se actualiza |
| 3 | US1 | Ver una fila inválida | Score "—", distintivo "Inválido", métricas originales visibles; el tooltip muestra los errores |
| 4 | US3 | Enter sobre una fila | Se abre el panel; score, nivel y sub-scores iguales a `GET /clients/<id>/score`. Escape cierra y el filtro sigue aplicado |
| 5 | US3 | Abrir `#/cartera/NO-EXISTE` | Panel "Cliente no encontrado" + "Volver a la cartera" |
| 6 | US4 | Ir a Por categoría | 4 columnas con los mismos conteos que Cartera; las tarjetas muestran la métrica más débil o la cantidad de errores; las columnas se colapsan |
| 7 | US2 | Nuevo cliente: uso 90, tickets 0, NPS 9, días 300 → Calcular | Score y nivel "Top" idénticos a `POST /score` con esas métricas |
| 8 | US2 | Tickets "2.5" → Calcular | Error en español bajo "Tickets de soporte"; no se muestra score; los demás valores se conservan |
| 9 | US5 | Ir a Configuración | Pesos 25 % ×4, Top 75, En riesgo 50, tope 10, horizonte 180; sin controles de edición |
| 10 | Edge | Detener la API y pulsar "Reintentar" | Estado de error; al levantar la API y reintentar, cargan los datos |
| 11 | Edge | Usar `HEALTH_SCORE_CLIENTS` con un archivo `[]` | Estado vacío y KPIs en 0, sin error |
| 12 | FR-003 | Botón de tema | Alterna claro/oscuro; la preferencia se mantiene al recargar |
| 13 | SC-006 | DevTools a 360 px de ancho | Barra inferior visible; sin scroll horizontal de página; la tabla se desplaza dentro de su contenedor |

## 4. Configuración alternativa

1. Copiar `config/scoring.json` a un archivo temporal y bajar `thresholds.top` a 70.
2. Reiniciar la API con `HEALTH_SCORE_CONFIG` apuntando a ese archivo.
3. Recargar la UI. Configuración muestra Top 70, y los clientes con score 70–74 pasan a Top en
   Cartera y en Por categoría, sin haber tocado el frontend.

## 5. Rendimiento (SC-004)

Generar una cartera ficticia de 1.000 clientes, apuntar `HEALTH_SCORE_CLIENTS` a ella y medir
en DevTools (Performance): la pantalla debe mostrar los datos en menos de 3 s y la búsqueda
responder en menos de 0,5 s.
