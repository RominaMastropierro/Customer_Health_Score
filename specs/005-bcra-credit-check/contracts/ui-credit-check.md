# Contrato de UI: consulta al BCRA en "Nuevo cliente"

Solo en `NewClientPage`. La edición (`ClientEditForm`) no cambia.

## Disparo

| Evento en el campo "CUIT/CUIL" | Efecto |
|--------------------------------|--------|
| `change` | `reset()`: desaparece el resultado y se aborta la consulta en curso; se limpia `fieldErrors.cuil` (comportamiento existente) |
| `blur` con el campo vacío | nada |
| `blur` con formato inválido | `fieldErrors.cuil` = "El CUIT/CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)"; sin solicitud |
| `blur` con dígito verificador inválido | `fieldErrors.cuil` = "El dígito verificador del CUIT/CUIL no es válido"; sin solicitud |
| `blur` válido, con el mismo CUIT en curso o ya consultado | nada |
| `blur` válido, con un CUIT nuevo | `POST /api/credit-status` con `{ "cuil": "<11 dígitos>" }` |

El valor del campo nunca se reescribe (spec 004, FR-001).

## Presentación (bajo el campo, dentro de `ClientFields` vía `cuilStatus`)

Es un contenedor `role="status"` con `aria-live="polite"`, así se anuncia sin mover el foco
(FR-022). El `Alert` de adentro se usa con `role={undefined}`, para no anidar una segunda
región con anuncio asertivo.

| Estado | Contenido | Estilo |
|--------|-----------|--------|
| `loading` | `Loader2` girando + "Consultando situación en el BCRA…" | `text-muted-foreground` |
| `done` · `with_debts` · `positive` | `message` + "Fuente: Central de Deudores del BCRA" | `Alert` con tokens `top` |
| `done` · `with_debts` · `warning` | ídem | `Alert` con tokens `stable` |
| `done` · `with_debts` · `risk` | ídem | `Alert` con tokens `risk` |
| `done` · `with_debts` · `null` | ídem | `Alert` neutro |
| `done` · `no_data` | `message` | `Alert` neutro |
| `done` · `bcra_unavailable` / `summary_unavailable` | `message` + botón "Reintentar" | `Alert` neutro con ícono de advertencia |
| `failed` (red / servicio caído / 28 s sin respuesta) | "No pudimos consultar la situación en el BCRA en este momento. Inténtalo de nuevo en unos minutos." + "Reintentar" | ídem |

- El `message` se muestra como texto plano. Se respetan los saltos de línea, pero no se
  interpreta HTML ni Markdown.
- Los colores salen de los tokens existentes (`top`, `stable`, `risk`) a través de
  `TONE_CLASSES` (`lib/display.ts`). No se agregan estilos ad hoc.
- Calcular y "Guardar en cartera" no dependen del estado de la consulta (FR-023).
- Tras un alta exitosa, el formulario se vacía y se llama `clear()`; al salir de la
  pantalla también (FR-009).

## Componentes y archivos

| Archivo | Cambio |
|---------|--------|
| `lib/cuit.ts` (+ `.test.ts`) | NUEVO: `validateCuit` y textos de FR-002/FR-003 |
| `api/types.ts` | + `CreditStatus`, `CreditStatusKind`, `CreditTone` |
| `api/client.ts` | + `getCreditStatus(cuil, signal)` |
| `pages/new-client/useCreditCheck.ts` | NUEVO: estado, dedupe, abort, retry |
| `pages/new-client/CreditStatusPanel.tsx` | NUEVO: presentación de la tabla anterior |
| `components/ClientFields.tsx` | + props opcionales `onCuilBlur`, `cuilStatus` |
| `pages/new-client/NewClientPage.tsx` | conecta blur → validación → `check`, `change` → `reset` |
| `pages/new-client/NewClientPage.test.tsx` | + escenarios de US1–US4 |
