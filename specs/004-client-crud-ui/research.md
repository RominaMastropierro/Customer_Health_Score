# Research: CRUD de Clientes desde el Dashboard

Sin `NEEDS CLARIFICATION` pendientes. Cada decisión indica qué requisito resuelve.

## R1. Sin cambios en el servicio

- **Decisión**: se usan tal cual `POST /clients`, `PUT /clients/{id}`, `DELETE /clients/{id}`,
  `GET /clients/{id}/score`, `GET /portfolio` y `GET /metrics` de la spec 003
  ([contrato](../003-client-persistence-crud/contracts/http-api-changes.md)). No se toca
  `src/health_score` ni sus pruebas.
- **Rationale**: FR-023. La API ya valida CUIL (formato y dígito verificador), métricas,
  unicidad y existencia, con mensajes en español.
- **Alternativas**: cambiar los mensajes del servicio a "CUIT/CUIL" (descartado por FR-029:
  queda como mejora posterior del servicio).

## R2. Cliente HTTP: funciones nuevas y errores por campo

- **Decisión**: en `frontend/src/api/client.ts` se agregan `createClient(data)`,
  `updateClient(id, data)` y `deleteClient(id)`, más los tipos `ClientData` y `ClientRecord` en
  `api/types.ts`. `request<T>` acepta respuestas sin cuerpo (204) para `DELETE` mediante una
  variante `requestNoContent`. `validationError` se amplía para leer las ubicaciones que
  devuelve `/clients`:

  | `loc` del 422 | Campo del formulario |
  |---------------|----------------------|
  | `["body", "<métrica>"]` (`POST /score`, sin cambios) | `<métrica>` |
  | `["body", "metrics", "<métrica>"]` | `<métrica>` |
  | `["body", "cuil"]` | `cuil` |
  | `["body", "name"]` | `name` |
  | cualquier otro (`["body"]`, `["body","metrics"]`, campo extra) | aviso general (`formErrors`) |

  El tipo de `ApiError.fieldErrors` pasa a `Partial<Record<FormField, string>>`, con
  `FormField = MetricName | "cuil" | "name"`. Los usos actuales siguen compilando porque solo
  leen claves de métricas.
- **409**: `createClient` y `updateClient` convierten el 409 en `fieldErrors.cuil` con el
  `detail` del servicio (FR-013). El único otro 409 posible es la colisión de UUID en el alta,
  que la spec 003 considera prácticamente imposible; se distingue porque su `detail` no
  menciona "CUIL", y entonces va a `formErrors`.
- **Rationale**: FR-012, FR-013, FR-016. Hoy `validationError` solo reconoce `loc` de dos
  niveles, así que los errores de métricas de `/clients` terminarían como aviso general.
- **Alternativas**: un parser separado para `/clients` (duplicaría la lógica; descartado).

## R3. Validación en el dashboard: solo lo evidente

- **Decisión**: antes de guardar, el dashboard bloquea solo (a) CUIT/CUIL vacío y (b) métricas
  vacías o no numéricas (la misma regla que ya usa "Calcular"). **No** se comprueba la forma
  del CUIL ni el dígito verificador en el frontend.
- **Rationale**: FR-021 lo permite pero no lo exige. Comprobar la forma en el frontend
  duplicaría una regla que vive en `health_score/cuil.py` (Principio VI) y el mensaje del
  servicio ya es claro y llega en una sola ida y vuelta.
- **Alternativas**: regex de forma en `lib/display.ts` (mejora de UX marginal a cambio de una
  segunda definición de la regla; se puede sumar después si hace falta).

## R4. Rótulo único "CUIT/CUIL"

- **Decisión**: constante `CUIL_LABEL = "CUIT/CUIL"` en `frontend/src/lib/display.ts`, junto a
  `formatCuil` y `matchesCuil`. Se usa en la cabecera de la tabla, el `title` del buscador, el
  campo de los formularios, el diálogo de eliminación, las confirmaciones, el aviso "Falta el
  CUIT/CUIL" y como `aria-label` del valor en tarjetas y detalle.
- **Rationale**: FR-028 en un único lugar; cambiar el rótulo otra vez es tocar una línea.

## R5. Alta: snapshot de lo calculado

- **Decisión**: `NewClientPage` guarda, junto al resultado, una copia de los valores del
  formulario con que se calculó (`calculatedFrom`). "Guardar en cartera" se habilita si hay
  resultado, `values.cuil.trim() !== ""` y `values` es igual a `calculatedFrom` (comparación
  campo a campo de strings). Al guardar se envían exactamente esos valores.
- **Motivo visible del deshabilitado** (FR-003): "Falta el CUIT/CUIL" o "Vuelve a calcular para
  guardar", como texto secundario dentro del botón, en el mismo lugar que hoy ocupa
  "Disponible próximamente", y como `aria-describedby`.
- **Cuerpo enviado** (FR-004): `{ cuil: values.cuil, name: values.name.trim() || null,
  metrics: { ...Number(...) } }`. El CUIL se envía sin `trim` (spec, casos límite).
- **Tras el éxito** (FR-005): se limpia el formulario y el resultado, se muestra el aviso de
  confirmación (R8) con la acción "Ver en la cartera" → `#/cartera/{client_id}`, y se llama a
  `onClientsChanged()` (R7).
- **Rationale**: FR-003 exige que lo guardado coincida con lo mostrado; un snapshot es más
  simple que invalidar el resultado en cada `onChange`.

## R6. Formulario compartido de alta y edición

- **Decisión**: se extraen los campos de `ScoreForm` a `frontend/src/components/ClientFields.tsx`
  (CUIT/CUIL, nombre, uso, tickets, días, NPS), con los mismos controles, mensajes de error y
  atributos `aria-invalid`/`aria-describedby` de hoy. `ScoreForm` (alta) y el nuevo
  `ClientEditForm` (detalle) lo reutilizan; cada uno pone sus propios botones.
- El campo CUIT/CUIL es un `Input` de `type="text"`, `inputMode="numeric"`,
  `autoComplete="off"`, `placeholder="XX-XXXXXXXX-X"`, con la ayuda "Con o sin guiones" (FR-001).
  `inputMode="numeric"` solo cambia el teclado en móviles; el valor sigue siendo texto.
- **Rationale**: un único lugar para los campos (Principio VI de forma laxa, Principio I);
  pruebas existentes de `NewClientPage` siguen encontrando los mismos rótulos.
- **Alternativas**: un formulario de edición escrito aparte (duplicado); reutilizar
  `ScoreForm` entero en el detalle (arrastra textos y botones del cálculo).

## R7. Actualizar la cartera tras cada operación

- **Decisión**: `App` ya tiene una única carga de la cartera (`useApi(getPortfolio)`),
  compartida por Cartera y Por categoría. Se expone `onClientsChanged = portfolio.reload` a
  `NewClientPage` y a `ClientDetailSheet`. El detalle recarga además su propio
  `getClientScore` tras editar (vuelve a modo lectura con los datos que devuelve el servicio,
  FR-008, FR-020).
- Las solicitudes de escritura **no** se cancelan al desmontar la pantalla: si la persona se
  va mientras guarda, la operación termina, no se muestran mensajes en otra pantalla (se
  ignora el resultado con una ref `mounted`) y `onClientsChanged()` se llama igual (caso
  límite "el servicio tarda").
- **Rationale**: FR-018, SC-003. Sin estado global nuevo ni biblioteca de caché.
- **Alternativas**: React Query/SWR (dependencia nueva injustificada, Principio I);
  actualizar la cartera en memoria con la respuesta (obligaría a recalcular conteos en el
  frontend, prohibido por FR-020/Principio II).

## R8. Confirmaciones: aviso en línea, sin biblioteca de toasts

- **Decisión**: un estado `notice` en `App` (`{ tone: "success" | "info", text, action? }`)
  que se muestra arriba del contenido con el `Alert` de shadcn existente, `role="status"`, botón
  de cerrar, y que se limpia al cambiar de página o al mostrar otro aviso. Lo usan alta
  ("Cliente guardado: Cliente Ficticio · 20-90000024-4", acción "Ver en la cartera"), edición y
  eliminación.
- **Rationale**: FR-005, FR-008, FR-011 sin dependencias nuevas; accesible con lectores de
  pantalla.
- **Alternativas**: `sonner` (toast de shadcn): dependencia nueva solo para avisos;
  descartada por Principio I.

## R9. Diálogo de confirmación: AlertDialog de shadcn

- **Decisión**: se agrega `frontend/src/components/ui/alert-dialog.tsx` (componente estándar de
  shadcn/ui, estilo new-york) sobre `AlertDialog` del paquete `radix-ui`, que ya es dependencia.
  Se usa para: (a) confirmar la eliminación (FR-010, FR-011), (b) confirmar descartar cambios
  sin guardar (FR-009). Radix maneja foco inicial, trampa de foco, Escape y retorno del foco
  (FR-027). El botón de confirmar eliminación usa la variante `destructive` de `Button`.
- Cancelar el diálogo de eliminación con clic fuera: `AlertDialog` de Radix no se cierra al
  hacer clic fuera por diseño; se agrega `onEscapeKeyDown`/`onPointerDownOutside` → cancelar,
  para cumplir el escenario 2 de US4 (cancelar con botón, Escape o clic fuera).
- **Rationale**: constitución, *Frontend*: componentes de shadcn/ui antes que propios; sin
  dependencias nuevas.

## R10. Edición dentro del detalle y cambios sin guardar

- **Decisión**: `ClientDetailSheet` tiene modo `"view" | "edit"`. "Editar" carga los rangos con
  `getMetrics` (como "Nuevo cliente") y precarga el formulario desde la respuesta de
  `GET /clients/{id}/score` que ya está en pantalla: `cuil` formateado con `formatCuil`,
  `name ?? ""` y las cuatro métricas como texto. No hace falta `GET /clients/{id}`.
- "Guardar" se habilita solo si hay cambios (comparación con los valores iniciales, FR-007).
  El CUIL precargado con guiones y el original sin guiones representan el mismo valor; si la
  persona no lo toca, no cuenta como cambio.
- **Cambios sin guardar** (FR-009): con `dirty === true`,
  - cerrar el panel (X, Escape, clic en el overlay) llama a `onOpenChange(false)`, que en
    lugar de cerrar abre el AlertDialog "¿Descartar cambios?";
  - navegar por los enlaces del encabezado o el historial cambia el hash: `useHashRoute`
    recibe un `blocker` opcional (`() => boolean`). Si bloquea, el hook restaura el hash
    anterior con `history.replaceState`, guarda la ruta pedida y `App` abre el mismo diálogo;
    "Descartar" navega a la ruta pendiente.
- **404 al guardar o eliminar** (FR-014): se muestra el estado "Cliente no encontrado" que ya
  existe en el detalle (con "Volver a la cartera") y se llama a `onClientsChanged()`.
- **Rationale**: no se agregan pantallas (Assumptions) ni biblioteca de ruteo.

## R11. Eliminación

- **Decisión**: "Eliminar" en el encabezado del detalle (modo lectura) abre el AlertDialog con
  nombre (`displayName`) y CUIT/CUIL (`formatCuil`), el texto "Esta acción no se puede
  deshacer" y los botones "Cancelar" / "Eliminar cliente". Al confirmar: `deleteClient(id)`;
  durante la llamada el botón muestra "Eliminando" y queda deshabilitado (FR-019); con 204 →
  `onDeleted(name)` en `App`, que navega a `#/cartera` con `replace`, muestra el aviso
  "Cliente eliminado: <nombre>" y recarga la cartera. Con 404 → igual que R10. Con otro error →
  aviso de error dentro del diálogo y se puede reintentar (US4, escenario 6).

## R12. Acceso "Nuevo cliente" desde la cartera

- **Decisión**: `PortfolioPage` suma un botón-enlace "Nuevo cliente" (`href="#/nuevo"`, icono
  `Plus`, como en la navegación) en la acción del `PageHeader`, junto a "Actualizado …".
  `StatePanel` acepta un `action?: ReactNode` opcional; el estado vacío de la cartera lo usa
  con el mismo enlace (FR-022). Los demás usos de `StatePanel` no cambian.

## R13. Pruebas

- **Decisión**: Vitest + Testing Library con `stubFetch` (ya soporta método y ruta; se le
  agregan rutas `POST /api/clients`, `PUT /api/clients/<id>`, `DELETE /api/clients/<id>`).
  Las respuestas 204 se simulan con `status: 204` y sin cuerpo; `stubFetch` hoy crea
  `new Response("", {status})`, que con 204 debe ser `new Response(null, {status: 204})`
  (el constructor rechaza cuerpo con 204): se ajusta en `fixtures.ts`.
- CUIL de prueba sintéticos (FR-026): libre `20900000244` (`20-90000024-4`), duplicado el de
  C-001 `20900000015`, dígito inválido `20900000016`.
- Ajustes de pruebas existentes (FR-024): `PortfolioPage.test.tsx:107` busca la cabecera
  `CUIT/CUIL`; `NewClientPage.test.tsx:100` acota `not.toHaveTextContent(/CUIL/)` y el patrón
  de CUIL con guiones al panel de resultado (`within(...)`).
