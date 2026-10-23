---

description: "Lista de tareas de la spec 004: CRUD de clientes desde el dashboard"
---

# Tasks: CRUD de Clientes desde el Dashboard

**Input**: documentos de diseño en `specs/004-client-crud-ui/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ui-client-crud.md](contracts/ui-client-crud.md), [quickstart.md](quickstart.md)

**Tests**: la spec los pide (FR-025). En cada historia se escriben primero y deben fallar antes de implementar.

**Organization**: tareas agrupadas por historia de usuario. Todo el código está en `frontend/src/`; el backend (`src/`, `tests/`) **no se modifica** (FR-023).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: otro archivo, sin dependencias pendientes.
- **[Story]**: historia de la spec (US1 … US5).

## Convenciones para todas las tareas

- Textos en español neutro con tuteo, como el resto del dashboard ("Introduce", "Inténtalo").
- Solo CUIL sintéticos (FR-026): libre `20900000244` (`20-90000024-4`), duplicado `20900000015` (C-001, `20-90000001-5`), dígito inválido `20900000016`.
- Estilos con utilidades de Tailwind y componentes de `@/components/ui`; sin dependencias npm nuevas (plan, Principio I).
- Comentarios solo para explicar el porqué (constitución, Principio I).
- En pruebas que renderizan `<App />`, el encabezado ya tiene un enlace "Nuevo cliente": acotar las búsquedas con `within(screen.getByRole("main"))` cuando haga falta.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: tipos del contrato, utilidades de prueba y piezas visuales sin lógica de negocio.

Orden: T003 primero (T001 importa sus tipos); T002 en paralelo con ambas.

- [X] T003 En `frontend/src/api/types.ts` agregar (después de `ClientMetrics`): `export interface ClientData { cuil: string; name: string | null; metrics: ClientMetrics }` (sin `client_id`: lo genera el servicio) y `export interface ClientRecord extends ClientData { client_id: string }` (el `cuil` llega sin guiones). Es solo tipos; lo usan T001 y las pruebas de T004.
- [X] T001 En `frontend/src/test/fixtures.ts` (después de T003), hacer que `stubFetch` construya la respuesta con `new Response(null, { status })` cuando `status === 204` o `route.body === undefined` (el constructor de `Response` rechaza cuerpo con 204), y agregar `export const clientRecordFixture: ClientRecord = { client_id: "3f2b8c1e-9a4d-4e7b-8c21-5d6f0a9b1c2d", cuil: "20900000244", name: "Cliente Ficticio", metrics: { usage: 60, support_tickets: 3, nps: 7, days_to_renewal: 90 } }`.
- [X] T002 [P] Crear `frontend/src/components/ui/alert-dialog.tsx` con el componente estándar de shadcn/ui (estilo new-york) sobre `import { AlertDialog as AlertDialogPrimitive } from "radix-ui"`: exportar `AlertDialog`, `AlertDialogTrigger`, `AlertDialogPortal`, `AlertDialogOverlay`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`; `AlertDialogAction`/`AlertDialogCancel` usan `buttonVariants()` / `buttonVariants({ variant: "secondary" })` de `@/components/ui/button`. Mismo patrón de `data-slot` y clases de animación que `components/ui/sheet.tsx`, con overlay `bg-black/40` y contenido centrado `w-[min(32rem,calc(100vw-2rem))]` para que no desborde a 375 px (FR-027).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tipos, cliente HTTP, rótulo y formulario compartido que usan todas las historias.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Pruebas de la fase

- [X] T004 [P] Agregar a `frontend/src/api/client.test.ts` (research R2, data-model "Errores"):
  - `createClient(data)` hace `POST /api/clients` con el cuerpo exacto `{ cuil, name, metrics }` (sin `client_id`) y devuelve el `ClientRecord` del 201.
  - `updateClient("C-002", data)` hace `PUT /api/clients/C-002`; `updateClient("a/b", …)` codifica el id (`/api/clients/a%2Fb`).
  - `deleteClient("C-001")` hace `DELETE /api/clients/C-001` y resuelve sin error con un 204 sin cuerpo.
  - 422 con `loc: ["body","metrics","usage"]` → `fieldErrors.usage`; `["body","cuil"]` → `fieldErrors.cuil`; `["body","name"]` → `fieldErrors.name`; `["body","metrics"]` y `["body","client_id"]` → `formErrors`. Varios errores a la vez → todos presentes.
  - El 422 de `POST /api/score` con `loc: ["body","nps"]` sigue dando `fieldErrors.nps` (prueba existente, sin cambios).
  - 409 con `detail: "El CUIL '20900000015' ya está registrado en otro cliente"` en `createClient` y en `updateClient` → `ApiError` con `status 409` y `fieldErrors.cuil` igual al `detail`; 409 con `detail: "Ya existe un cliente con el identificador 'x'"` → `formErrors: [detail]`.
  - 404 en `updateClient`/`deleteClient` → `ApiError` con `status 404`.
- [X] T005 [P] Agregar a `frontend/src/lib/display.test.ts`: `CUIL_LABEL === "CUIT/CUIL"`.

### Implementación de la fase

- [X] T006 En `frontend/src/api/client.ts` (research R2):
  - Exportar `type FormField = MetricName | "cuil" | "name"` y cambiar `ApiError.fieldErrors` (propiedad y parámetro del constructor) a `Partial<Record<FormField, string>>`.
  - En `validationError`, mapear `["body", m]` (m métrica) y `["body", "metrics", m]` → `fieldErrors[m]`; `["body", "cuil"]` → `fieldErrors.cuil`; `["body", "name"]` → `fieldErrors.name`; el resto → `formErrors`. Conservar `??=` (primer mensaje por campo).
  - `request<T>`: si `response.status === 204`, devolver `undefined as T` antes de exigir cuerpo (hoy lanza "Respuesta inesperada").
  - Agregar `createClient(data: ClientData)`, `updateClient(clientId: string, data: ClientData)` (con `encodeURIComponent`) y `deleteClient(clientId: string): Promise<void>`. Ninguna recibe `signal`: las escrituras no se cancelan al salir de la pantalla (research R7). El cuerpo se arma campo a campo como en `postScore` (no se reenvían claves extra).
  - En `createClient` y `updateClient`, capturar `ApiError` 409: si `message` incluye `"CUIL"` → relanzar con `fieldErrors: { cuil: message }`; si no → `formErrors: [message]`. Comentar el porqué (el único otro 409 es la colisión de UUID).
  Hace pasar T004.
- [X] T007 [P] En `frontend/src/lib/display.ts`, junto a `formatCuil`, agregar `export const CUIL_LABEL = "CUIT/CUIL"` con un comentario: único lugar del rótulo (FR-028); el dato sigue siendo `cuil`. Hace pasar T005.
- [X] T008 Crear `frontend/src/components/ClientFields.tsx` (research R6) moviendo desde `frontend/src/pages/new-client/ScoreForm.tsx` el componente `Field`, `integerOptions` y los campos Nombre, Uso (slider + input), Tickets, Días y NPS **sin cambiar** rótulos, ids, `aria-*` ni comportamiento. Exportar `type ClientFormValues = { cuil: string; name: string } & Record<MetricName, string>` y `type ClientFormErrors = Partial<Record<FormField, string>>`. Props: `ranges`, `values`, `fieldErrors`, `onChange(field, value)`, `idPrefix?: string` (para que alta y edición no repitan ids si conviven). Agregar como **primer** campo, antes de "Nombre", el CUIT/CUIL (contrato "Campo CUIT/CUIL"): `<Field id="cuil" label={CUIL_LABEL} hint="Con o sin guiones" error={fieldErrors.cuil}>` con `<Input id="cuil" type="text" inputMode="numeric" autoComplete="off" placeholder="XX-XXXXXXXX-X" value={values.cuil} onChange={(e) => onChange("cuil", e.target.value)} />` y `aria-invalid`/`aria-describedby="cuil-error"` cuando hay error. El valor se guarda tal cual: sin reformatear, sin `trim`, conserva ceros (FR-001). Mostrar también `fieldErrors.name` bajo Nombre. Exportar además `blankMetricErrors(values: ClientFormValues): ClientFormErrors`, que devuelve `"Introduce un número entero"` para cada métrica vacía (tras `trim`) o con `Number.isNaN(Number(raw))`, y `{}` si no hay ninguna: es el único lugar de esta comprobación previa, que usan el alta y la edición (FR-021).
- [X] T009 Modificar `frontend/src/pages/new-client/ScoreForm.tsx` para usar `ClientFields`: `FormValues` pasa a ser `ClientFormValues` y `ScoreFormState.fieldErrors` a `ClientFormErrors`; conserva el encabezado "Datos del cliente", el aviso de `formErrors`, el botón "Calcular score"/"Calculando" y el texto "Los datos no se guardarán automáticamente.". En `frontend/src/pages/new-client/NewClientPage.tsx`, agregar `cuil: ""` a `EMPTY` y reemplazar el bucle de `submit()` que arma `missing` por `blankMetricErrors(form.values)` (mismo mensaje y mismo comportamiento). Las pruebas existentes de `NewClientPage.test.tsx` deben seguir pasando salvo la de la línea ~100 (se ajusta en T013, a continuación).
- [X] T013 Ajustar la prueba existente "no muestra CUIL en el resultado de un cliente no guardado" en `frontend/src/pages/new-client/NewClientPage.test.tsx` (FR-024 b): reemplazar `document.body` por el panel de resultado (`within(screen.getByText("Resultado").closest("[aria-live]") as HTMLElement)`), manteniendo las dos aserciones (`/CUIL/` y `/\d{2}-\d{8}-\d/`). No cambiar nada más de esa prueba. Va en esta fase porque el campo CUIT/CUIL de T008/T009 hace fallar la versión actual.

**Checkpoint**: `npm test` en verde y `npm run build` sin errores de tipos.

---

## Phase 3: User Story 1 — Guardar en la cartera un cliente nuevo (Priority: P1) 🎯 MVP

**Goal**: desde "Nuevo cliente", escribir el CUIT, calcular y guardar; el cliente aparece en la cartera sin recargar.

**Independent Test**: con la cartera cargada, completar CUIT `20-90000024-4` y métricas, calcular, guardar y ver el aviso de confirmación y la cartera recargada (quickstart §2).

### Tests for User Story 1 ⚠️

- [X] T010 [P] [US1] Agregar a `frontend/src/pages/new-client/NewClientPage.test.tsx` un `describe("Guardar en cartera (US1, spec 004)")` (usar `RESULT`, `fill` y `renderForm`; agregar un helper que escriba el CUIT con `user.type(screen.getByLabelText("CUIT/CUIL"), …)`):
  - el primer campo del formulario es un `textbox` con nombre accesible "CUIT/CUIL", placeholder `XX-XXXXXXXX-X` y ayuda "Con o sin guiones", y aparece antes de "Nombre" en el orden del documento;
  - escribir `20-90000024-4` y luego `00012345678` deja el valor exactamente así (sin reformateo, conserva ceros);
  - sin CUIT, tras calcular, "Guardar en cartera" está deshabilitado y muestra "Falta el CUIT/CUIL"; ya no existe el texto "Disponible próximamente";
  - con CUIT, calcular y luego cambiar el nombre → deshabilitado con "Vuelve a calcular para guardar"; recalcular → habilitado;
  - guardar envía `POST /api/clients` con `{"cuil":"20-90000024-4","name":"Cliente Ficticio","metrics":{…números…}}` (sin `client_id`); nombre vacío o de solo espacios → `"name": null`;
  - con 201 (`clientRecordFixture`), llama a `onClientsChanged` y a `onSaved` con el registro, el formulario vuelve a vacío (CUIT, nombre y métricas) y desaparece el resultado;
  - si la pantalla se desmonta antes de que llegue el 201 (respuesta controlada con una promesa que se resuelve a mano y `unmount()`), se llama a `onClientsChanged` pero **no** a `onSaved`;
  - con `POST /api/clients` → `pending()`, el botón muestra "Guardando", está deshabilitado y un segundo clic no agrega otra llamada (contar `calls` con clave `POST /api/clients` === 1).
- [X] T011 [P] [US1] Crear `frontend/src/components/Notice.test.tsx`: renderiza el texto con `role="status"`; con `action` muestra un enlace con su `label` y `href`; el botón "Cerrar aviso" llama a `onClose`.
- [X] T012 [P] [US1] Agregar a `frontend/src/App.test.tsx` (crear si no existe; `stubFetch` con `GET /api/portfolio`, `GET /api/metrics`, `POST /api/clients` 201 y `window.location.hash = "#/nuevo"`): tras guardar, se muestra "Cliente guardado: Cliente Ficticio · 20-90000024-4" con el enlace "Ver en la cartera" a `#/cartera/3f2b8c1e-9a4d-4e7b-8c21-5d6f0a9b1c2d`; `GET /api/portfolio` se pidió una vez más después del `POST` (FR-018); el aviso desaparece al navegar a otra página. Con `name: null` en la respuesta, el aviso dice "Cliente guardado: Cliente nuevo · 20-90000024-4". Respuesta tardía (caso límite "el servicio tarda"): con `POST /api/clients` resuelto a mano, guardar, navegar a `#/cartera`, resolver la promesa → se volvió a pedir `GET /api/portfolio` y **no** aparece "Cliente guardado".

### Implementation for User Story 1

- [X] T014 [P] [US1] Crear `frontend/src/components/Notice.tsx`: props `{ text: string; action?: { label: string; href: string }; onClose: () => void }`; usa `Alert` y `AlertDescription` de `@/components/ui/alert` con `role="status"`, icono `CheckCircle2` de lucide (`aria-hidden`), el enlace de la acción (estilo `buttonVariants({ variant: "secondary", size: "sm" })`) y un botón de icono `X` con `aria-label="Cerrar aviso"`. Hace pasar T011.
- [X] T015 [US1] Modificar `frontend/src/pages/new-client/ScoreResultPanel.tsx` (contrato "Guardar en cartera"): nuevas props `canSave: boolean`, `saveHint?: string`, `saving: boolean`, `onSave: () => void`. El botón "Guardar en cartera" queda `disabled={!canSave || saving}`; si `saving`, muestra `Loader2` con `animate-spin` y "Guardando"; si hay `saveHint`, lo muestra como texto secundario (donde estaba "Disponible próximamente", que se elimina) con `id="save-hint"` y `aria-describedby="save-hint"` en el botón.
- [X] T016 [US1] Modificar `frontend/src/pages/new-client/NewClientPage.tsx` (research R5, data-model "Estados de la pantalla Nuevo cliente"):
  - Props opcionales `onClientsChanged?: () => void` y `onSaved?: (record: ClientRecord) => void` (las pruebas existentes renderizan `<NewClientPage />` sin props). Son dos props distintas porque el refresco de la cartera debe ocurrir siempre que el alta se completó, y el aviso solo si la persona sigue en esta pantalla (caso límite "el servicio tarda").
  - Al calcular con éxito, guardar `calculatedFrom = form.values` junto a `result`.
  - `missingCuil = form.values.cuil.trim() === ""`; `stale = calculatedFrom` distinto de `form.values` (comparar cada clave). `canSave = result !== null && !missingCuil && !stale`; `saveHint = missingCuil ? "Falta el CUIT/CUIL" : stale ? "Vuelve a calcular para guardar" : undefined`.
  - `save()`: si `saving`, no hace nada (evita doble envío, FR-019); `createClient({ cuil: calculatedFrom.cuil, name: calculatedFrom.name.trim() || null, metrics: { …Number(…) } })` — el `cuil` **sin** `trim`. Una ref `mounted` (en `true` mientras la pantalla está montada) decide qué se hace al llegar la respuesta (research R7).
  - Éxito: `onClientsChanged?.()` siempre; si `mounted.current`, además `setForm` a `EMPTY` sin errores, `result = null`, `calculatedFrom = null` y `onSaved?.(record)`. Si la pantalla ya se desmontó, no se toca el estado ni se llama a `onSaved`.
  - Pasar a `ScoreResultPanel` `canSave`, `saveHint`, `saving` y `onSave={save}`.
  Hace pasar los casos de éxito de T010.
- [X] T017 [US1] Modificar `frontend/src/App.tsx` (research R7, R8): estado `notice: { text: string; action?: { label: string; href: string } } | null`; renderizar `<Notice …>` arriba del contenido de `<main>` cuando hay aviso; limpiarlo en un `useEffect` cuando cambia `route.page`. Pasar a `NewClientPage` `onClientsChanged={portfolio.reload}` y `onSaved={(record) => setNotice({ text: \`Cliente guardado: ${record.name ?? "Cliente nuevo"} · ${formatCuil(record.cuil)}\`, action: { label: "Ver en la cartera", href: toHash({ page: "cartera", clientId: record.client_id }) } })}` (`onSaved` solo arma el aviso; el refresco va por `onClientsChanged`). Se usa `"Cliente nuevo"` y no `displayName`, porque `displayName` cae en el `client_id` (un UUID) cuando no hay nombre, y la spec pide "Cliente nuevo" en la confirmación del alta (US1, escenario 4; mismo texto que el título del resultado). Hace pasar T012.

**Checkpoint**: US1 se demuestra sola: alta exitosa con aviso y cartera recargada.

---

## Phase 4: User Story 2 — Ver y corregir los errores del alta y la edición (Priority: P1)

**Goal**: los rechazos del servicio se ven junto a cada campo, en español, sin perder lo escrito.

**Independent Test**: guardar con CUIT de dígito inválido, CUIT duplicado, métrica fuera de rango y servicio caído; ver el mensaje en el lugar correcto y los datos intactos (quickstart §3).

### Tests for User Story 2 ⚠️

- [X] T018 [P] [US2] Agregar a `frontend/src/pages/new-client/NewClientPage.test.tsx` un `describe("Errores al guardar (US2, spec 004)")`, con CUIT y métricas calculadas y luego "Guardar en cartera":
  - 422 `loc ["body","cuil"]`, `msg "el dígito verificador del CUIL no es válido"` → el texto aparece bajo el campo CUIT/CUIL, que tiene `aria-invalid="true"` y `aria-describedby="cuil-error"`; no se llama a `onSaved`;
  - 422 `["body","cuil"]` con el mensaje de formato → bajo CUIT/CUIL;
  - 409 `detail "El CUIL '20900000015' ya está registrado en otro cliente"` → bajo CUIT/CUIL;
  - 422 con `["body","cuil"]` y `["body","metrics","usage"]` a la vez → ambos campos marcados;
  - 422 con `loc ["body"]` → aviso general del formulario con el `msg`;
  - 503 y fallo de red (`fetch` que rechaza) → aviso "No pudimos guardar los cambios. Inténtalo de nuevo."; el CUIT, el nombre y las métricas conservan lo escrito;
  - tras un error en CUIT/CUIL, escribir en ese campo borra su mensaje y conserva el de `usage`;
  - "Guardar en cartera" con CUIT vacío no es posible (botón deshabilitado, cubierto en T010) y nunca llama a `POST /api/clients`.

### Implementation for User Story 2

- [X] T019 [US2] En `frontend/src/pages/new-client/NewClientPage.tsx`, manejar el error de `save()`: si `ApiError` con `status` 422 o 409 → `setForm` con `fieldErrors` y `formErrors` del error (conservando `values`); cualquier otro → estado `saveError = true`, que muestra arriba del formulario un `Alert` `variant="destructive"` con "No pudimos guardar los cambios. Inténtalo de nuevo." (separado del aviso existente de cálculo "No pudimos calcular el score…"). Al guardar de nuevo se limpian `saveError`, `fieldErrors` y `formErrors`. Tras un 422/409, `calculatedFrom` se conserva, así el botón sigue habilitado si la persona solo corrige y recalcula. Verificar que `change()` ya limpia solo el error de su campo (hoy lo hace) también para `cuil` y `name`. Hace pasar T018.

**Checkpoint**: US1 + US2 forman el MVP: alta completa con errores claros.

---

## Phase 5: User Story 3 — Editar un cliente desde su detalle (Priority: P2)

**Goal**: "Editar" en el detalle, con el formulario precargado; guardar recalcula y refresca todo.

**Independent Test**: editar NPS y nombre de C-002, guardar y ver el detalle, la tabla, las tarjetas y los conteos actualizados (quickstart §4).

### Tests for User Story 3 ⚠️

- [X] T020 [P] [US3] Agregar a `frontend/src/lib/useHashRoute.test.ts` (research R10): con un `blocker` que devuelve `true`, un cambio de hash a `#/categorias` se revierte a la ruta anterior (`window.location.hash` vuelve a `#/cartera/C-001`), `route` no cambia y `pendingRoute` queda en `{ page: "categorias" }`; `confirmPending()` navega a la ruta pendiente y la limpia, aunque el `blocker` siga devolviendo `true`; `cancelPending()` la limpia sin navegar; tras `allowNext()`, el siguiente cambio de hash pasa aunque el `blocker` devuelva `true`, y el posterior vuelve a bloquearse; sin `blocker` (o devolviendo `false`) navega normalmente.
- [X] T021 [P] [US3] Agregar a `frontend/src/pages/client-detail/ClientDetailSheet.test.tsx` un `describe("Editar cliente (US3, spec 004)")` (stub con `GET /api/metrics`, `GET /api/clients/C-001/score` y `PUT /api/clients/C-001`; abrir con `#/cartera/C-001` y `<App />`):
  - el detalle muestra los botones "Editar" y "Eliminar";
  - "Editar" muestra el formulario con CUIT/CUIL `20-90000001-5`, nombre "Acme Ficticia" y las métricas de la fixture; el identificador `C-001` se ve y no es un campo editable; "Guardar cambios" está deshabilitado;
  - cambiar NPS y guardar → `PUT /api/clients/C-001` con `{ cuil: "20-90000001-5", name, metrics }`; tras el 200 vuelve a modo lectura, se pidió otra vez `GET /api/clients/C-001/score` y `GET /api/portfolio`, y se muestra "Cambios guardados: Acme Ficticia";
  - guardar sin tocar el CUIT es válido (no hay error);
  - borrar el CUIT/CUIL y guardar → "Falta el CUIT/CUIL" bajo el campo y no hay `PUT` (FR-021);
  - con una respuesta de score con `name: null`, el formulario precarga el nombre vacío; guardar envía `"name": null` (US3, escenario 10);
  - 409 → mensaje bajo CUIT/CUIL y el formulario sigue abierto con lo escrito; 422 de métrica → bajo la métrica;
  - "Cancelar" vuelve a modo lectura sin `PUT`;
  - con cambios, Escape (cerrar el panel) abre "¿Descartar cambios?"; "Seguir editando" mantiene el formulario; "Descartar" cierra el panel;
  - abierto desde la tabla (`#/cartera`, clic en "Acme Ficticia", así el cierre usa `history.back()`), con cambios, cerrar y "Descartar" → el panel se cierra y el hash queda en `#/cartera` (el bloqueo no vuelve a frenar el cierre);
  - con cambios, hacer clic en el enlace "Por categoría" del encabezado abre el mismo diálogo y la página no cambia hasta confirmar;
  - `PUT` → 404 → "Cliente no encontrado" con "Volver a la cartera" y se recarga `GET /api/portfolio`;
  - 503 → aviso "No pudimos guardar los cambios. Inténtalo de nuevo." y los datos escritos se conservan;
  - con `PUT` → `pending()`, "Guardar cambios" muestra "Guardando" y queda deshabilitado.

### Implementation for User Story 3

- [X] T022 [US3] Modificar `frontend/src/lib/useHashRoute.ts` (research R10): `useHashRoute(blocker?: () => boolean)` guarda el `blocker` en una ref; en `onChange`, si `blocker?.()` es `true`, restaurar la ruta actual con `window.history.replaceState(null, "", toHash(current))` (sin disparar otro `hashchange`), guardar la ruta pedida en `pendingRoute` y no actualizar `route`. Devolver además `pendingRoute`, `allowNext()` (activa un flag en una ref para que el siguiente `hashchange` pase sin consultar el `blocker`; se consume en ese evento), `confirmPending()` (llama a `allowNext()` y navega a la pendiente) y `cancelPending()`. Comentar el porqué de `allowNext`: las navegaciones que inicia la app tras "Descartar" no pueden depender de que React ya haya actualizado el estado que lee el `blocker`. Hace pasar T020.
- [X] T023 [P] [US3] Crear `frontend/src/pages/client-detail/ClientEditForm.tsx`: props `{ clientId: string; initial: ClientFormValues; onSaved: (record: ClientRecord) => void; onNotFound: () => void; onCancel: () => void; onDirtyChange: (dirty: boolean) => void }`. Carga rangos con `useApi(getMetrics, [])` (loading/error con `StatePanel bare`). Renderiza el identificador como texto (`Identificador` · `clientId`, no editable), `ClientFields` con `idPrefix="edit-"`, el aviso de `formErrors` y los botones "Guardar cambios" (deshabilitado si `!dirty || saving`; "Guardando" con `Loader2`) y "Cancelar" (`variant="secondary"`). `dirty` = algún campo distinto de `initial`, comparando `cuil` sin guiones solo para decidir si hubo cambios (data-model); informar cambios con `onDirtyChange`. Guardar: si `values.cuil.trim() === ""` → `fieldErrors.cuil = "Falta el CUIT/CUIL"` (junto al campo: en la edición no hay un cálculo previo que habilite el botón); sumar `blankMetricErrors(values)` de `ClientFields`; si hay algún error, mostrarlos y no llamar al servicio; si no, `updateClient(clientId, { cuil: values.cuil, name: values.name.trim() || null, metrics })`; 200 → `onSaved`; 404 → `onNotFound`; 422/409 → errores por campo; otro → `Alert` destructivo "No pudimos guardar los cambios. Inténtalo de nuevo.".
- [X] T024 [US3] Modificar `frontend/src/pages/client-detail/ClientDetailSheet.tsx` (data-model "Estados del detalle"):
  - Nuevas props `onClientsChanged: () => void`, `onNotice: (text: string) => void`, `onDirtyChange: (dirty: boolean) => void` (las conecta T025).
  - `Body` tiene modo `"view" | "edit"` y un estado `notFound`. En modo lectura, debajo del `LevelBadge`, botones "Editar" (`variant="secondary"`, icono `Pencil`) y "Eliminar" (lo conecta US4; en esta fase puede omitirse).
  - "Editar" → `ClientEditForm` con `initial = { cuil: formatCuil(client.cuil) === "—" ? "" : formatCuil(client.cuil), name: client.name ?? "", usage: String(client.metrics?.usage ?? ""), … }`.
  - `onSaved` → volver a `"view"`, `reload()` del `useApi` del detalle, `onClientsChanged()`, `onNotice(\`Cambios guardados: ${displayName(record)}\`)`, `onDirtyChange(false)`.
  - `onNotFound` → `notFound = true` (reutiliza el bloque existente "Cliente no encontrado" + "Volver a la cartera") y `onClientsChanged()`.
  - Cerrar el panel (X, Escape, overlay) sigue llamando a `onClose` como hoy; la decisión de pedir confirmación la toma `App` (T025). Al desmontar `ClientEditForm` (Cancelar, guardar o salir del modo edición), llamar a `onDirtyChange(false)`.
- [X] T025 [US3] Modificar `frontend/src/App.tsx`:
  - Estado `detailDirty` (con una ref espejo para leerlo en callbacks) y `discardFrom: "close" | null`. `const { route, navigate, pendingRoute, allowNext, confirmPending, cancelPending } = useHashRoute(() => detailDirtyRef.current)`.
  - Renombrar el `closeClient` actual a `doCloseClient` y crear `closeClient`: si `detailDirtyRef.current`, `setDiscardFrom("close")` y no cierra; si no, `doCloseClient()`.
  - Un `AlertDialog` "¿Descartar cambios?" / "Los cambios sin guardar se perderán.", abierto cuando `pendingRoute !== null || discardFrom === "close"`, con "Seguir editando" (`AlertDialogCancel` → `cancelPending()` y `setDiscardFrom(null)`) y "Descartar" (`AlertDialogAction`): primero `detailDirtyRef.current = false` y `setDetailDirty(false)`; luego, si `discardFrom === "close"`, `setDiscardFrom(null)`, `allowNext()` y `doCloseClient()` (que puede navegar con `history.back()`); si no, `confirmPending()`. Pasar a `ClientDetailSheet` `onClientsChanged={portfolio.reload}`, `onNotice={(text) => setNotice({ text })}` y `onDirtyChange={setDetailDirty}`. Hace pasar T021.

**Checkpoint**: US3 funciona sobre la cartera de la carga inicial, sin depender del alta.

---

## Phase 6: User Story 4 — Eliminar un cliente con confirmación (Priority: P2)

**Goal**: "Eliminar" en el detalle con diálogo de confirmación; el cliente desaparece de todas las vistas.

**Independent Test**: eliminar C-001 confirmando y ver la cartera sin él; repetir cancelando y ver que nada cambia (quickstart §5).

### Tests for User Story 4 ⚠️

- [X] T026 [P] [US4] Agregar a `frontend/src/pages/client-detail/ClientDetailSheet.test.tsx` un `describe("Eliminar cliente (US4, spec 004)")` (stub con `DELETE /api/clients/C-001`):
  - "Eliminar" abre un `alertdialog` titulado "¿Eliminar cliente?" que contiene "Acme Ficticia", "CUIT/CUIL 20-90000001-5" y "Esta acción no se puede deshacer";
  - cancelar con el botón "Cancelar", con Escape y con clic en el overlay no llama a `DELETE` y el detalle sigue abierto; al cerrar, el foco vuelve al botón "Eliminar";
  - confirmar ("Eliminar cliente") → `DELETE /api/clients/C-001` una sola vez; el panel se cierra, `window.location.hash` es `#/cartera`, se muestra "Cliente eliminado: Acme Ficticia" y se volvió a pedir `GET /api/portfolio`;
  - con `DELETE` → `pending()`, el botón muestra "Eliminando", está deshabilitado y un segundo clic no agrega otra llamada;
  - `DELETE` → 404 → "Cliente no encontrado" y se recarga la cartera;
  - `DELETE` → 503 → dentro del diálogo, "No pudimos eliminar el cliente. Inténtalo de nuevo."; el cliente sigue en la cartera y se puede reintentar.
- [X] T027 [P] [US4] Agregar a `frontend/src/pages/portfolio/PortfolioPage.test.tsx`: con `GET /api/portfolio` devolviendo `summary.total === 0` y `results: []`, se muestra el estado vacío existente "Aún no hay clientes" y la pantalla no falla (US4, escenario 8).

### Implementation for User Story 4

- [X] T028 [P] [US4] Crear `frontend/src/pages/client-detail/DeleteClientDialog.tsx` (research R11, contrato "Diálogos"): props `{ clientId: string; name: string; cuil: string | null | undefined; onDeleted: () => void; onNotFound: () => void }`. Botón disparador "Eliminar" (`variant="secondary"`, icono `Trash2`, `AlertDialogTrigger asChild`). Contenido: título "¿Eliminar cliente?", descripción `{name} · {CUIL_LABEL} {formatCuil(cuil)}. Esta acción no se puede deshacer.`, "Cancelar" (`AlertDialogCancel`) y "Eliminar cliente" (`Button variant="destructive"`; no usar `AlertDialogAction`, que cierra el diálogo antes de que termine la llamada). Cancelar con clic fuera: `onPointerDownOutside={() => setOpen(false)}` en el contenido controlado (Radix no lo hace por defecto, research R9). Confirmar: si `deleting`, no hace nada; `deleteClient(clientId)` → `onDeleted()`; 404 → cerrar y `onNotFound()`; otro error → `Alert` destructivo dentro del diálogo "No pudimos eliminar el cliente. Inténtalo de nuevo." y botón habilitado otra vez.
- [X] T029 [US4] En `frontend/src/pages/client-detail/ClientDetailSheet.tsx`, mostrar `DeleteClientDialog` junto a "Editar" en modo lectura, con `name={displayName(client)}` y `cuil={client.cuil}`; `onNotFound` → mismo comportamiento que en la edición. Nueva prop `onDeleted: (name: string) => void`.
- [X] T030 [US4] En `frontend/src/App.tsx`, pasar `onDeleted={(name) => { openedFromTable.current = false; navigate({ page: "cartera" }, { replace: true }); setNotice({ text: \`Cliente eliminado: ${name}\` }); portfolio.reload() }}`. Comprobar que el `useEffect` que limpia `notice` al cambiar de página no borra este aviso (la página sigue siendo `cartera`). Hace pasar T026 y T027.

**Checkpoint**: crear → editar → eliminar se completa solo con el dashboard (SC-002).

---

## Phase 7: User Story 5 — Accesos al alta desde la cartera (Priority: P3)

**Goal**: botón "Nuevo cliente" en la cartera y en su estado vacío.

**Independent Test**: desde la cartera, "Nuevo cliente" abre el formulario vacío (quickstart §7).

### Tests for User Story 5 ⚠️

- [X] T031 [P] [US5] Agregar a `frontend/src/pages/portfolio/PortfolioPage.test.tsx`: dentro de `main`, existe un enlace "Nuevo cliente" con `href="#/nuevo"`; con la cartera vacía, el estado vacío también contiene ese enlace; al hacer clic (con `<App />`) se ve el encabezado "Datos del cliente" y el campo CUIT/CUIL vacío.

### Implementation for User Story 5

- [X] T032 [P] [US5] En `frontend/src/components/StatePanel.tsx`, agregar la prop opcional `action?: ReactNode`, renderizada debajo de la descripción (antes de "Reintentar"). Los usos existentes no cambian.
- [X] T033 [US5] En `frontend/src/pages/portfolio/PortfolioPage.tsx`: la `action` del `PageHeader` pasa a ser un contenedor `flex gap-2` con el botón "Actualizado …" existente y `<Button asChild><a href="#/nuevo"><Plus aria-hidden="true" />Nuevo cliente</a></Button>`; el `StatePanel type="empty"` recibe `action` con el mismo enlace. Hace pasar T031.

**Checkpoint**: todas las historias funcionan de forma independiente.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: rótulo "CUIT/CUIL" en todo el dashboard (FR-028), accesibilidad y verificación final.

- [X] T034 [P] Ajustar en `frontend/src/pages/portfolio/PortfolioPage.test.tsx` la prueba existente "muestra la columna CUIL con guiones…" (FR-024 a): `getByRole("columnheader", { name: "CUIT/CUIL" })`; el resto de la prueba no cambia. Agregar una aserción: el buscador tiene `title="Buscar por nombre, ID o CUIT/CUIL"`.
- [X] T035 [P] Agregar a `frontend/src/pages/categories/CategoriesPage.test.tsx` y `frontend/src/pages/client-detail/ClientDetailSheet.test.tsx`: el valor `20-90000001-5` tiene nombre accesible "CUIT/CUIL 20-90000001-5" (`getByLabelText("CUIT/CUIL 20-90000001-5")`).
- [X] T036 En `frontend/src/pages/portfolio/ClientsTable.tsx`, usar `CUIL_LABEL` en la cabecera (`<TableHead>{CUIL_LABEL}</TableHead>`) y en el `title` del buscador (`` `Buscar por nombre, ID o ${CUIL_LABEL}` ``). Hace pasar T034.
- [X] T037 [P] En `frontend/src/pages/categories/ClientCard.tsx` y `frontend/src/pages/client-detail/ClientDetailSheet.tsx`, agregar al `<span className="font-mono">` del CUIL `aria-label={\`${CUIL_LABEL} ${formatCuil(…)}\`}`. Hace pasar T035.
- [X] T038 Revisar con `grep -rn "CUIL" frontend/src --include=*.tsx` que ningún texto visible diga "CUIL" solo (fuera de comentarios, nombres de variables y mensajes que vienen del servicio, FR-029).
- [X] T039 Revisar accesibilidad (FR-027, SC-008) en `frontend/src/components/ClientFields.tsx`, `frontend/src/pages/client-detail/ClientEditForm.tsx` y `frontend/src/pages/client-detail/DeleteClientDialog.tsx`: todo campo tiene `label` asociado; los errores usan `aria-invalid` + `aria-describedby`; al entrar en modo edición el foco va al campo CUIT/CUIL; al volver a modo lectura, al botón "Editar". Con el navegador a 375 px, el panel de edición y los diálogos no generan desplazamiento horizontal.
- [X] T040 Ejecutar en `frontend/`: `npm test` y `npm run build`; todo en verde. Ejecutar `pytest` en la raíz: sin cambios y en verde (SC-007). Confirmar con `git diff --stat` que no hay cambios en `src/` ni `tests/`.
- [ ] T041 Recorrer [quickstart.md](quickstart.md) §1–§7 con una base nueva y registrar cualquier diferencia como tarea pendiente en este archivo. Medir a mano: alta completa en menos de 1 minuto (SC-001), ciclo crear → editar → eliminar en menos de 3 minutos (SC-002) y flujos con teclado a 375 px sin desplazamiento horizontal (SC-008).
- [X] T042 [P] Actualizar `README.md` (sección del dashboard): se pueden crear clientes desde "Nuevo cliente" con su CUIT/CUIL (con o sin guiones), y editarlos o eliminarlos desde su detalle.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. Dentro de la fase, T003 va antes que T001.
- **Foundational (Phase 2)**: depende de Setup. Termina con T013 (ajuste de la prueba "sin CUIL"). Bloquea todas las historias.
- **US1 (Phase 3)**: depende de Phase 2.
- **US2 (Phase 4)**: depende de US1 (los errores se muestran en el flujo de guardar de `NewClientPage`). Para la edición, US3 reutiliza el mismo manejo.
- **US3 (Phase 5)**: depende de Phase 2 y de T014/T017 (aviso en `App`). No depende del alta: se prueba sobre la cartera de la carga inicial.
- **US4 (Phase 6)**: depende de Phase 2, de T002 (AlertDialog) y de T024 (botones del detalle). Puede ir antes que US3 si se mueve la creación de los botones de T024 a T029.
- **US5 (Phase 7)**: depende solo de Phase 2.
- **Polish (Phase 8)**: T034–T038 dependen solo de T007; T039–T041, de todas las historias.

### Within Each User Story

- Pruebas primero, deben fallar.
- Componentes nuevos [P] antes de conectar en `App.tsx`.
- `App.tsx` se toca en T017, T025 y T030: hacerlas en ese orden, no en paralelo.
- `ClientDetailSheet.tsx` se toca en T024, T029 y T037: secuencial.

### Parallel Opportunities

- Setup: T002 en paralelo con T003 → T001.
- Foundational: T004, T005 y T007 en paralelo; T006 tras T004; T008 tras T006 y T007; T009 tras T008; T013 tras T009.
- US1: T010, T011 y T012 (pruebas) en paralelo; T014 en paralelo con T015.
- US3: T020, T021 y T023 en paralelo.
- US4: T026, T027 y T028 en paralelo.
- US5 completo en paralelo con US3/US4 (otros archivos, salvo `PortfolioPage.test.tsx`, compartido con T027 y T034).
- Polish: T034, T035, T037 y T042 en paralelo.

---

## Parallel Example: User Story 1

```bash
# Pruebas de US1 juntas:
Task: "T010 Guardar en cartera en frontend/src/pages/new-client/NewClientPage.test.tsx"
Task: "T011 Notice en frontend/src/components/Notice.test.tsx"
Task: "T012 Aviso y recarga en frontend/src/App.test.tsx"

# Componentes de US1 en paralelo:
Task: "T014 Notice en frontend/src/components/Notice.tsx"
Task: "T015 Botón Guardar en frontend/src/pages/new-client/ScoreResultPanel.tsx"
```

## Parallel Example: User Story 3 y 4

```bash
Task: "T020 blocker en frontend/src/lib/useHashRoute.test.ts"
Task: "T023 ClientEditForm en frontend/src/pages/client-detail/ClientEditForm.tsx"
Task: "T028 DeleteClientDialog en frontend/src/pages/client-detail/DeleteClientDialog.tsx"
```

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Phase 1 + Phase 2 (tipos, cliente HTTP, rótulo, `ClientFields` con CUIT/CUIL).
2. Phase 3 (US1): guardar en cartera.
3. Phase 4 (US2): errores por campo. US1 sin US2 deja a la persona sin saber por qué falla un CUIT, por eso el MVP incluye ambas.
4. **Validar**: quickstart §2–§3 y `npm test`.

### Incremental Delivery

1. MVP (US1 + US2) → demo del alta.
2. US3 → demo de la edición.
3. US4 → demo del ciclo completo (SC-002).
4. US5 + Polish → accesos, rótulo "CUIT/CUIL" en todas las pantallas y verificación final.

---

## Notes

- [P] = otro archivo, sin dependencias pendientes.
- Las únicas pruebas existentes que cambian son las de T013 y T034 (FR-024); cualquier otra que falle indica una regresión.
- El backend no se toca: si una tarea parece requerir cambiar `src/health_score`, revisar la spec (FR-023) antes de seguir.
- Hacer commit por tarea o por grupo lógico.

## Notas de implementación (2026-10-23)

- **T041, pendiente en parte**: se verificó el contrato de punta a punta a través del proxy de Vite contra la API real con una base temporal (alta 201 con CUIT con guiones, 409 por CUIL duplicado, 422 en `["body","cuil"]` y en `["body","metrics","usage"]`, edición 200 con score recalculado, baja 204, baja repetida 404, conteos 20 → 21 → 20). Falta el recorrido manual en el navegador de quickstart §2–§7: pantallas, teclado, 375 px y tiempos de SC-001, SC-002 y SC-008.
- **T013**: el panel de resultado ahora contiene el motivo "Falta el CUIT/CUIL" de "Guardar en cartera". La prueba conserva su intención (ningún valor de CUIL en el resultado) y admite esa única mención, solo dentro del botón.
- **T015**: el motivo del botón deshabilitado va dentro del propio botón, así forma parte de su nombre accesible; no hace falta `aria-describedby`.
- **T027**: la cartera vacía ya estaba cubierta por la prueba existente "muestra el estado vacío con cartera vacía"; no se duplicó.
- **T028**: Radix ignora `onPointerDownOutside` en `AlertDialogContent`. `components/ui/alert-dialog.tsx` suma la prop opcional `onOverlayClick`, que usa `DeleteClientDialog` para cancelar con un clic fuera.
- **T035/T037**: en lugar de `aria-label` sobre un `<span>` (ARIA no lo admite en elementos sin rol), el valor lleva el prefijo visualmente oculto `<span className="sr-only">CUIT/CUIL </span>`.
- **Configuración**: `frontend/vite.config.ts` sube `testTimeout` a 15 s. Las pruebas de interacción con jsdom superaban los 5 s por defecto al correr en paralelo; la prueba existente que mueve el slider 90 veces fallaba por tiempo, no por comportamiento.
- Resultado final: `npm test` 133 pruebas en verde (había 67), `npm run build` sin errores de tipos, `pytest` 324 en verde y sin cambios en `src/` ni `tests/`.
