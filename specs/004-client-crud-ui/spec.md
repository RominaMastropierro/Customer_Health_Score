# Feature Specification: CRUD de Clientes desde el Dashboard

**Feature Branch**: `004-client-crud-ui`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "CRUD de clientes desde el dashboard (frontend). La spec 003 dejó la API completa (POST/GET/PUT/DELETE /clients, con CUIL validado, client_id UUID generado por el servicio, errores 404/409/422) pero dejó explícitamente fuera de alcance que el frontend permita crear, editar o eliminar clientes; hoy el dashboard solo lee la cartera y muestra el CUIL, y el botón "Guardar en cartera" de "Calcular nuevo cliente" sigue deshabilitado con "Disponible próximamente". Esta feature completa el CRUD en la interfaz: (1) dar de alta un cliente desde el dashboard ingresando CUIL (con o sin guiones), nombre opcional y las cuatro métricas, habilitando "Guardar en cartera" en la pantalla Nuevo cliente; (2) editar CUIL, nombre y métricas de un cliente existente desde su detalle; (3) eliminar un cliente desde su detalle con confirmación explícita; (4) mostrar los errores de la API por campo en español (422 por métrica y por CUIL, 409 por CUIL duplicado, 404 por cliente inexistente, error de conexión); (5) refrescar la cartera, el resumen por nivel y la vista por categorías inmediatamente después de cada alta, edición o baja. Sin cambios en la API ni en el scoring; reglas de validación siguen siendo del servidor (el cliente puede pre-validar formato como mejora de UX, reutilizando un único lugar). Incluye pruebas automatizadas del frontend. Datos ficticios únicamente. Sin autenticación."

## Clarifications

### Session 2026-10-22

- Q: ¿Cómo se ingresa la identificación fiscal del cliente en "Nuevo cliente"? → A: Con un campo de texto propio, rotulado "CUIT/CUIL", ubicado como primer campo del formulario (antes del nombre), donde se escribe el CUIT del cliente con o sin guiones. CUIT y CUIL comparten formato y dígito verificador, así que el valor se guarda en el mismo dato `cuil` de la spec 003, sin cambios en el servicio. El mismo campo se usa en el formulario de edición.
- Q: ¿Cómo se rotula la identificación fiscal en el resto del dashboard? → A: "CUIT/CUIL" en todas las pantallas: cabecera de la columna de la cartera, texto del buscador, formularios de alta y edición, diálogo de eliminación y confirmaciones. Solo cambia el texto visible; el dato sigue siendo `cuil` y el servicio no cambia.

**Depende de**: [002-health-score-dashboard](../002-health-score-dashboard/spec.md) (pantallas del dashboard) y [003-client-persistence-crud](../003-client-persistence-crud/spec.md) (operaciones de alta, consulta, edición y baja de clientes, reglas del CUIL y formato de errores). Esta feature cierra lo que la spec 003 dejó fuera de alcance: "Cambiar el frontend para ofrecer crear, editar o eliminar clientes".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guardar en la cartera un cliente nuevo (Priority: P1)

Una persona de Customer Success abre "Nuevo cliente", escribe el CUIT del cliente en el campo "CUIT/CUIL" (con o sin guiones), un nombre opcional y las cuatro métricas, calcula el score y, si está conforme, pulsa "Guardar en cartera". El cliente queda guardado, aparece de inmediato en la cartera, en el resumen por nivel y en la vista por categorías, y la persona puede abrir su detalle desde la confirmación.

**Why this priority**: es el primer paso de gestión real desde la interfaz y el que hoy está anunciado como "Disponible próximamente". Sin alta no hay nada que editar ni eliminar.

**Independent Test**: con la cartera cargada, se completa el formulario con un CUIL sintético libre y métricas válidas, se calcula, se guarda y se verifica que la cartera pasa a tener un cliente más, con ese CUIL formateado, el mismo score que mostró el cálculo y los conteos por nivel actualizados, sin recargar la página.

**Acceptance Scenarios**:

1. **Given** la pantalla "Nuevo cliente", **When** se abre, **Then** el formulario muestra como primer campo un input de texto vacío rotulado "CUIT/CUIL", con el ejemplo de formato `XX-XXXXXXXX-X` y una ayuda que indica que se puede escribir con o sin guiones, seguido del nombre y las cuatro métricas; el botón "Guardar en cartera" ya no muestra "Disponible próximamente".
2. **Given** el campo "CUIT/CUIL", **When** se escribe `20-90000024-4` o `20900000244`, **Then** el valor se ve exactamente como se escribió (incluidos ceros iniciales y guiones), sin que el campo lo reformatee, lo recorte ni lo trate como número.
3. **Given** un formulario con el campo "CUIT/CUIL" vacío y métricas válidas, **When** se pulsa "Calcular", **Then** el score se calcula igual que antes (el CUIT no es necesario para calcular) y "Guardar en cartera" queda deshabilitado con una indicación de que falta el CUIT/CUIL.
4. **Given** un CUIT sintético no registrado (p. ej. `20-90000024-4`) y métricas válidas ya calculadas, **When** se pulsa "Guardar en cartera", **Then** se muestra una confirmación en español con el nombre (o "Cliente nuevo") y el CUIT/CUIL con guiones, y una acción para ver el cliente en la cartera.
5. **Given** un alta exitosa, **When** se navega a la cartera o a la vista por categorías, **Then** el cliente nuevo aparece con su CUIL, score y nivel, y el total y los conteos por nivel incluyen al cliente nuevo, sin recargar la página.
6. **Given** un alta exitosa, **When** se pulsa la acción de ver el cliente, **Then** se abre su detalle en la cartera con su identificador generado por el servicio.
7. **Given** un resultado calculado, **When** se modifica cualquier campo del formulario (incluido el CUIT/CUIL) antes de guardar, **Then** "Guardar en cartera" se deshabilita hasta volver a calcular, de modo que lo guardado siempre coincide con el resultado que se muestra.
8. **Given** un alta en curso, **When** se pulsa "Guardar en cartera" otra vez, **Then** no se envía una segunda solicitud (el botón queda deshabilitado e indica que se está guardando).
9. **Given** un alta exitosa, **When** se vuelve al formulario, **Then** queda vacío y listo para otro cliente, y no es posible volver a guardar el mismo cliente por accidente.

---

### User Story 2 - Ver y corregir los errores del alta y la edición (Priority: P1)

Cuando el servicio rechaza un alta o una edición, la persona ve junto a cada campo afectado un mensaje claro en español que explica qué falla, sin perder lo que ya escribió, y puede corregir y reintentar.

**Why this priority**: sin una presentación clara de los errores, el alta y la edición son inutilizables ante cualquier dato mal cargado (por ejemplo, un CUIL con un dígito equivocado), y la persona perdería su trabajo.

**Independent Test**: se intenta guardar con un CUIL de dígito verificador inválido, con un CUIL ya registrado, con una métrica fuera de rango y con el servicio caído; en cada caso se verifica el mensaje junto al campo correcto (o el aviso general), que los datos escritos se conservan y que la cartera no cambia.

**Acceptance Scenarios**:

1. **Given** un CUIL con dígito verificador inválido (p. ej. `20900000016`), **When** se guarda, **Then** se muestra junto al campo CUIT/CUIL el mensaje del servicio que indica que el dígito verificador no es válido, y no se crea nada.
2. **Given** un CUIL con formato incorrecto (p. ej. 10 dígitos, letras o guiones mal ubicados), **When** se guarda, **Then** se muestra junto al campo CUIT/CUIL un mensaje que indica el formato esperado (`XX-XXXXXXXX-X` o 11 dígitos).
3. **Given** un CUIL ya registrado en otro cliente, con o sin guiones, **When** se guarda, **Then** se muestra junto al campo CUIT/CUIL que ese CUIL ya está registrado en otro cliente, y no se crea ni se modifica nada.
4. **Given** una métrica fuera de rango que llegara al servicio, **When** se guarda, **Then** se muestra el mensaje de rango junto a esa métrica, con el mismo texto que ya usa el dashboard.
5. **Given** varios campos inválidos a la vez (p. ej. CUIL y una métrica), **When** se guarda, **Then** se marcan todos los campos con error, no solo el primero.
6. **Given** el servicio no disponible o un error inesperado, **When** se guarda, **Then** se muestra un aviso general en español que invita a reintentar, los datos escritos se conservan y no se muestra ninguna confirmación.
7. **Given** un campo marcado con error, **When** se modifica ese campo, **Then** su mensaje de error desaparece; los mensajes de los demás campos se mantienen hasta el siguiente intento.
8. **Given** cualquier mensaje de error por campo, **When** se lo navega con un lector de pantalla, **Then** el campo queda marcado como inválido y asociado a su mensaje.

---

### User Story 3 - Editar un cliente desde su detalle (Priority: P2)

Una persona de Customer Success abre el detalle de un cliente, pulsa "Editar", ve el formulario con el CUIL, el nombre y las métricas actuales, corrige lo necesario y guarda. El detalle, la cartera, el resumen y la vista por categorías reflejan de inmediato los nuevos valores y el score recalculado. El identificador del cliente se muestra pero no se puede cambiar.

**Why this priority**: mantener los datos al día es necesario para que el score sirva (p. ej. tras una nueva encuesta NPS o para corregir un CUIL mal cargado), pero se puede demostrar una vez que existe el alta.

**Independent Test**: se edita la métrica NPS y el nombre de un cliente de la carga inicial, se guarda y se verifica que el detalle, la fila de la tabla, la tarjeta por categoría y los conteos por nivel muestran los valores nuevos y el score recalculado por el servicio.

**Acceptance Scenarios**:

1. **Given** el detalle de un cliente, **When** se pulsa "Editar", **Then** se muestra un formulario con su CUIL (con guiones), su nombre y sus cuatro métricas actuales precargados, y su identificador visible y no editable.
2. **Given** el formulario de edición con valores válidos, **When** se guarda, **Then** se muestra una confirmación, el detalle vuelve a modo lectura con los nuevos datos y el score y nivel recalculados por el servicio.
3. **Given** una edición exitosa que cambia el nivel del cliente, **When** se mira la cartera y la vista por categorías, **Then** el cliente aparece en su nuevo nivel y los conteos por nivel se actualizan, sin recargar la página.
4. **Given** el formulario de edición, **When** se guarda sin cambiar el CUIL, **Then** se acepta (su propio CUIL no es un conflicto).
5. **Given** el formulario de edición, **When** se cambia el CUIL por el de otro cliente o por uno inválido, **Then** se muestra el error junto al campo CUIT/CUIL (US2) y el cliente conserva sus datos anteriores.
6. **Given** el formulario de edición con cambios sin guardar, **When** se pulsa "Cancelar", **Then** se descartan los cambios y el detalle vuelve a mostrar los datos guardados.
7. **Given** el formulario de edición con cambios sin guardar, **When** se intenta cerrar el detalle o navegar a otra pantalla, **Then** se pide confirmación antes de descartar los cambios.
8. **Given** el formulario de edición sin cambios, **When** se mira el botón de guardar, **Then** está deshabilitado (no hay nada que guardar).
9. **Given** un cliente que fue eliminado mientras se editaba, **When** se guarda, **Then** se informa que el cliente ya no existe, no se crea uno nuevo, se ofrece volver a la cartera y la cartera se actualiza.
10. **Given** un cliente cuyo nombre estaba vacío, **When** se edita, **Then** el nombre puede quedar vacío y el cliente se sigue mostrando con el nombre de reemplazo que ya usa el dashboard.

---

### User Story 4 - Eliminar un cliente con confirmación (Priority: P2)

Una persona de Customer Success abre el detalle de un cliente dado de baja y pulsa "Eliminar". Un diálogo le pide confirmar, mostrando el nombre y el CUIL del cliente y avisando que la acción no se puede deshacer. Al confirmar, el cliente desaparece de la cartera, del resumen y de la vista por categorías, y el detalle se cierra.

**Why this priority**: completa el ciclo de gestión; es menos frecuente que crear o editar y es la única acción destructiva, por eso exige confirmación.

**Independent Test**: se elimina un cliente de la carga inicial confirmando el diálogo y se verifica que deja de aparecer en la tabla, en las tarjetas y en los conteos; se repite cancelando el diálogo y se verifica que nada cambia.

**Acceptance Scenarios**:

1. **Given** el detalle de un cliente, **When** se pulsa "Eliminar", **Then** se abre un diálogo de confirmación que muestra su nombre y su CUIT/CUIL con guiones y avisa que la eliminación es definitiva.
2. **Given** el diálogo de confirmación, **When** se cancela (botón, tecla Escape o clic fuera), **Then** no se elimina nada y el detalle sigue abierto.
3. **Given** el diálogo de confirmación, **When** se confirma, **Then** el cliente se elimina, el detalle se cierra, se vuelve a la cartera y se muestra una confirmación en español con el nombre del cliente eliminado.
4. **Given** una eliminación exitosa, **When** se mira la cartera y la vista por categorías, **Then** el cliente ya no aparece, y el total y los conteos por nivel bajan en uno, sin recargar la página.
5. **Given** un cliente que ya había sido eliminado por otra vía, **When** se confirma su eliminación, **Then** se informa que el cliente ya no existe y la cartera se actualiza (el resultado final es el mismo: el cliente no está).
6. **Given** el servicio no disponible, **When** se confirma la eliminación, **Then** se muestra un aviso general, el cliente no desaparece de la pantalla y se puede reintentar.
7. **Given** una eliminación en curso, **When** se vuelve a pulsar confirmar, **Then** no se envía una segunda solicitud.
8. **Given** que se eliminan todos los clientes, **When** se mira la cartera, **Then** se muestra el estado vacío existente del dashboard y la pantalla sigue funcionando.

---

### User Story 5 - Accesos al alta desde la cartera (Priority: P3)

Desde la cartera, la persona encuentra una acción visible "Nuevo cliente" que la lleva directamente al formulario de alta, sin tener que buscarla en la navegación.

**Why this priority**: mejora la descubribilidad del alta, pero el flujo ya es posible desde la navegación existente.

**Independent Test**: desde la cartera se pulsa "Nuevo cliente" y se verifica que se abre la pantalla de alta con el formulario vacío.

**Acceptance Scenarios**:

1. **Given** la pantalla de la cartera, **When** se pulsa "Nuevo cliente", **Then** se abre la pantalla "Nuevo cliente" con el formulario vacío.
2. **Given** la cartera vacía, **When** se muestra el estado vacío, **Then** ofrece la acción para crear el primer cliente.

---

### Edge Cases

- ¿Qué pasa si el CUIL se escribe con espacios al inicio o al final? Se envía tal como se escribió y el servicio lo rechaza por formato (spec 003); el mensaje se muestra junto al campo. El dashboard no recorta ni reescribe el CUIL en silencio.
- ¿Qué pasa si el CUIL empieza con cero? Se trata siempre como texto: se conservan los ceros iniciales al escribir, al enviar y al mostrar.
- ¿Qué pasa si el mismo CUIL se escribe en otro formato que el de un cliente existente (`20900000015` vs `20-90000001-5`)? El servicio lo detecta como duplicado y se muestra el error de CUIL ya registrado.
- ¿Qué pasa si se intenta guardar sin CUIT/CUIL? En el alta, "Guardar en cartera" queda deshabilitado con el motivo "Falta el CUIT/CUIL" (FR-003); en la edición, al pulsar "Guardar cambios" se muestra "Falta el CUIT/CUIL" junto al campo. En ningún caso se llama al servicio.
- ¿Qué pasa si una métrica no es un número entero al guardar? Se aplica el mismo bloqueo que hoy tiene "Calcular" (solo se bloquea lo que no es un número); el resto de las reglas las valida el servicio.
- ¿Qué pasa si el servicio tarda en responder? El botón muestra que la operación está en curso y queda deshabilitado; no se duplican solicitudes. Si la persona sale de la pantalla, la respuesta tardía no muestra mensajes en otra pantalla, y la cartera se actualiza igual si la operación se completó.
- ¿Qué pasa si se abre el detalle de un cliente recién eliminado desde un enlace guardado o desde el historial del navegador? Se muestra el estado existente "Cliente no encontrado".
- ¿Qué pasa si se edita un cliente que otra persona modificó mientras tanto? Se guardan los valores enviados (gana la última escritura); no hay detección de ediciones concurrentes en esta versión.
- ¿Qué pasa si la actualización de la cartera tras una operación exitosa falla (p. ej. el servicio se cae justo después)? La operación se informa como exitosa; la cartera muestra su estado de error existente con la opción de reintentar.
- ¿Qué pasa si el nombre tiene solo espacios? Se trata como nombre vacío y el cliente se muestra con el nombre de reemplazo existente.
- ¿Qué pasa si un cliente de la cartera tiene datos inválidos (registro con errores)? Se puede eliminar; la edición se ofrece con los valores disponibles y el servicio valida lo que se guarde.
- ¿Qué pasa si el servicio devuelve un error de validación sobre un campo que el formulario no muestra? Se presenta como aviso general del formulario, sin perder el mensaje.
- ¿Qué pasa en pantallas angostas? Los formularios de alta y edición y el diálogo de confirmación se usan completos sin desplazamiento horizontal, como el resto del dashboard.

## Requirements *(mandatory)*

### Functional Requirements

**Alta (Nuevo cliente)**

- **FR-001**: La pantalla "Nuevo cliente" MUST incluir, como primer campo del formulario y antes del nombre, un input de texto rotulado "CUIT/CUIL" donde se escribe el CUIT del cliente, con el ejemplo de formato `XX-XXXXXXXX-X` y una ayuda que indica que se acepta con o sin guiones. El campo MUST tratar el valor como texto: no lo reformatea mientras se escribe, no recorta espacios, conserva ceros iniciales y no usa controles numéricos (flechas ni conversión a número). Además del CUIT/CUIL, el formulario conserva el nombre opcional y las cuatro métricas existentes. El valor se guarda en el dato `cuil` del cliente (spec 003), que admite CUIT y CUIL porque comparten formato y dígito verificador.
- **FR-002**: Calcular el score MUST seguir funcionando sin CUIT/CUIL y con el mismo comportamiento de la spec 002; el CUIT/CUIL solo es necesario para guardar.
- **FR-003**: El botón "Guardar en cartera" MUST habilitarse cuando hay un resultado calculado, el CUIT/CUIL no está vacío y el formulario no cambió desde el último cálculo; en cualquier otro caso MUST estar deshabilitado e indicar el motivo (falta el CUIL, o hay que volver a calcular). El texto "Disponible próximamente" MUST eliminarse.
- **FR-004**: Al guardar, el dashboard MUST enviar al servicio el CUIL tal como se escribió, el nombre (vacío o solo espacios se envía como ausente) y las cuatro métricas, y MUST NOT enviar un identificador: lo genera el servicio.
- **FR-005**: Tras un alta exitosa, el dashboard MUST mostrar una confirmación en español con el nombre (o el nombre de reemplazo) y el CUIT/CUIL con guiones, ofrecer una acción para abrir el detalle del cliente creado en la cartera, y dejar el formulario vacío.

**Edición**

- **FR-006**: El detalle de un cliente MUST ofrecer la acción "Editar", que muestra un formulario con el mismo campo "CUIT/CUIL" de FR-001 (precargado con guiones), el nombre y las cuatro métricas actuales, y el identificador visible y no editable.
- **FR-007**: El formulario de edición MUST permitir guardar solo si hay cambios respecto de los datos guardados, y MUST ofrecer "Cancelar", que descarta los cambios y vuelve al modo lectura.
- **FR-008**: Tras una edición exitosa, el detalle MUST volver a modo lectura mostrando los datos, el score y el nivel que devuelve el servicio, y se MUST mostrar una confirmación en español.
- **FR-009**: Si hay cambios sin guardar, cerrar el detalle o navegar a otra pantalla MUST pedir confirmación antes de descartarlos.

**Eliminación**

- **FR-010**: El detalle de un cliente MUST ofrecer la acción "Eliminar", que abre un diálogo de confirmación con el nombre y el CUIT/CUIL con guiones del cliente y un aviso de que la eliminación es definitiva; la acción de confirmar MUST distinguirse visualmente como destructiva.
- **FR-011**: Cancelar el diálogo (botón, Escape o clic fuera) MUST NOT eliminar nada. Confirmar MUST eliminar el cliente, cerrar el detalle, volver a la cartera y mostrar una confirmación en español.

**Errores**

- **FR-012**: Los errores de validación que devuelve el servicio (CUIL con formato incorrecto, dígito verificador inválido, CUIL faltante, métricas fuera de rango o con tipo inválido) MUST mostrarse junto al campo correspondiente, con el mensaje en español del servicio, marcando todos los campos con error a la vez.
- **FR-013**: Un CUIL ya registrado en otro cliente (conflicto) MUST mostrarse como error del campo CUIT/CUIL con el mensaje del servicio.
- **FR-014**: Si el cliente no existe al editar o eliminar, el dashboard MUST informarlo en español, MUST NOT crear un cliente, MUST ofrecer volver a la cartera y MUST actualizar la cartera.
- **FR-015**: Un error de conexión, de servicio no disponible o inesperado MUST mostrarse como aviso general en español con la opción de reintentar; los datos escritos MUST conservarse.
- **FR-016**: Los errores que el formulario no puede asociar a un campo visible MUST mostrarse como aviso general del formulario.
- **FR-017**: Cada campo con error MUST quedar marcado como inválido y asociado a su mensaje para tecnologías de asistencia; modificar un campo MUST limpiar solo su propio error.

**Coherencia y actualización**

- **FR-018**: Tras cada alta, edición o eliminación exitosa, la cartera, el resumen por nivel, la vista por categorías y el detalle MUST reflejar el cambio de inmediato, sin recargar la página.
- **FR-019**: Mientras una operación de guardar o eliminar está en curso, su botón MUST quedar deshabilitado e indicar el progreso, y MUST NOT enviarse solicitudes duplicadas.
- **FR-020**: El score y el nivel mostrados tras guardar MUST ser los que calcula el servicio; el dashboard MUST NOT calcular scores, niveles ni conteos por su cuenta (constitución, Principio II).

**Rótulo "CUIT/CUIL" en todo el dashboard**

- **FR-028**: Todo texto visible del dashboard que nombra la identificación fiscal del cliente MUST decir "CUIT/CUIL": la cabecera de la columna de la tabla de la cartera, el texto de ayuda del buscador ("Buscar por nombre, ID o CUIT/CUIL"), el campo de los formularios de alta y edición, el diálogo de eliminación, las confirmaciones y los avisos propios del dashboard (p. ej. "Falta el CUIT/CUIL"). Donde hoy el valor se muestra sin rótulo (tarjetas por categoría y encabezado del detalle), MUST tener un nombre accesible "CUIT/CUIL" para lectores de pantalla. El cambio es solo de texto: el dato, su formato con guiones, la búsqueda y el servicio no cambian.
- **FR-029**: Los mensajes de error por campo que devuelve el servicio se muestran tal como llegan (pueden decir "CUIL"); el dashboard MUST NOT reescribirlos.

**Validación en el dashboard**

- **FR-021**: Antes de llamar al servicio, el dashboard MAY bloquear solo lo evidente como mejora de uso: CUIL vacío al guardar, métricas vacías o no numéricas, y opcionalmente un CUIL que no tenga la forma de 11 dígitos o `XX-XXXXXXXX-X`. Esa comprobación de forma MUST definirse en un único lugar del dashboard. El dígito verificador y los rangos de las métricas MUST validarlos solo el servicio; los rangos que se muestran como ayuda MUST seguir obteniéndose del servicio, como hoy.

**Accesos**

- **FR-022**: La cartera MUST ofrecer una acción visible "Nuevo cliente" que lleve a la pantalla de alta; el estado vacío de la cartera MUST ofrecer la misma acción.

**Compatibilidad y calidad**

- **FR-023**: La feature MUST NOT requerir cambios en el servicio ni en el scoring; usa las operaciones de clientes definidas en la spec 003 tal como están.
- **FR-024**: Las pantallas y flujos existentes (cartera, búsqueda por nombre, identificador y CUIL, vista por categorías, detalle, calcular sin guardar, configuración) MUST seguir funcionando igual; sus pruebas existentes MUST seguir pasando sin cambiar sus expectativas, con dos excepciones que esta feature cambia a propósito: (a) la prueba de la cartera que busca la cabecera de columna "CUIL" pasa a buscar "CUIT/CUIL" (FR-028); (b) la prueba de "Nuevo cliente" que verifica que no aparece el texto "CUIL" en toda la pantalla pasa a verificarlo solo en el panel de resultado, porque el formulario ahora tiene el campo "CUIT/CUIL" (FR-001). En ambos casos se conserva la intención original de la prueba.
- **FR-025**: La feature MUST incluir pruebas automatizadas del dashboard que cubran: presencia, rótulo, posición y ayuda del campo "CUIT/CUIL" en "Nuevo cliente" y en la edición, y que conserva el valor tal como se escribe; el rótulo "CUIT/CUIL" en la cabecera de la tabla, el buscador y el diálogo de eliminación, y el nombre accesible en tarjetas y detalle; alta exitosa y su reflejo en la cartera; guardar deshabilitado sin CUIL o con el formulario cambiado tras calcular; errores de CUIL (formato, dígito verificador, duplicado), de métricas y de conexión; edición exitosa, sin cambios, cancelada y con cliente inexistente; eliminación confirmada, cancelada y con cliente inexistente; prevención de envíos duplicados; y la acción "Nuevo cliente" desde la cartera.
- **FR-026**: Todos los datos de ejemplo, pruebas y demostraciones MUST ser ficticios; los CUIL usados MUST ser sintéticos, generados con la regla de la spec 003 (prefijo `20`, cuerpos `9000xxxx`), nunca números reales.
- **FR-027**: Los formularios, el diálogo de confirmación y los mensajes MUST poder usarse con teclado (incluido el foco inicial y el retorno del foco al cerrar el diálogo) y en pantallas angostas sin desplazamiento horizontal.

### Key Entities *(include if feature involves data)*

- **Cliente**: el mismo de la spec 003 (identificador generado por el servicio e inmutable, CUIL único, nombre opcional, cuatro métricas). El dashboard lo crea, lo edita y lo elimina, pero no guarda ninguna copia propia.
- **Borrador de cliente**: los valores que la persona escribe en el formulario de alta o edición antes de guardar (CUIL tal como se escribió, nombre, métricas). Se descarta al guardar con éxito, al cancelar o al confirmar que se descartan los cambios.
- **Error de operación**: lo que el dashboard muestra cuando el servicio rechaza una operación: errores por campo (validación y CUIL duplicado), cliente inexistente o error general (conexión o servicio).
- **Confirmación de operación**: mensaje breve en español que informa que un alta, edición o eliminación se completó, con el nombre del cliente afectado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona completa el alta de un cliente (escribir datos, calcular y guardar) en menos de 1 minuto, y lo ve en la cartera sin recargar la página en el 100 % de los casos.
- **SC-002**: Una persona completa el ciclo crear → editar → eliminar un cliente usando solo el dashboard, sin usar la documentación de la API, en menos de 3 minutos.
- **SC-003**: Tras el 100 % de las altas, ediciones y eliminaciones exitosas, el total, los conteos por nivel, la tabla, las tarjetas por categoría y el detalle coinciden con lo que devuelve el servicio en la siguiente consulta.
- **SC-004**: El 100 % de los errores probados (CUIL con formato incorrecto, dígito verificador inválido, CUIL duplicado con y sin guiones, cada métrica fuera de rango, cliente inexistente, servicio no disponible) se muestra en español junto al campo correcto o como aviso general, conserva los datos escritos y no modifica la cartera.
- **SC-005**: Ninguna eliminación ocurre sin pasar por el diálogo de confirmación: el 100 % de las cancelaciones (botón, Escape, clic fuera) deja la cartera intacta.
- **SC-006**: Pulsar repetidamente guardar o confirmar mientras una operación está en curso produce exactamente una operación en el 100 % de los casos (cero clientes duplicados).
- **SC-007**: El 100 % de las pruebas automatizadas existentes del dashboard y del servicio pasa sin cambiar sus expectativas (salvo las dos excepciones de FR-024), y las pruebas nuevas de FR-025 pasan completas.
- **SC-008**: Los flujos de alta, edición y eliminación se completan solo con teclado y en una pantalla de 375 px de ancho sin desplazamiento horizontal.

## Assumptions

- La API de clientes de la spec 003 (alta, consulta, edición y eliminación, con sus mensajes en español y códigos 404, 409, 422 y 503) está implementada y no cambia; esta feature es solo de interfaz.
- No hay autenticación ni permisos: cualquier persona que use el dashboard puede crear, editar y eliminar, igual que en las specs anteriores.
- El alta se hace desde la pantalla "Nuevo cliente" existente, reutilizando su formulario, en lugar de crear una pantalla nueva; la edición y la eliminación se hacen desde el detalle del cliente existente, sin pantallas nuevas.
- Para guardar se exige haber calculado antes, porque así lo plantea la pantalla actual ("Calcular nuevo cliente" → "Guardar en cartera") y asegura que lo guardado coincide con el resultado que la persona vio.
- Los clientes son empresas, por eso el formulario pide el CUIT; el rótulo "CUIT/CUIL" deja claro que también se acepta un CUIL. Ambos se validan con las mismas reglas de la spec 003 y se guardan en el mismo dato `cuil`. No se distingue entre CUIT y CUIL (no se validan prefijos por tipo de persona). En todo el dashboard se usa el rótulo "CUIT/CUIL" (FR-028); los mensajes de error del servicio siguen diciendo "CUIL" porque el servicio no cambia en esta feature, y unificarlos queda para una mejora posterior del servicio.
- La edición reemplaza CUIL, nombre y métricas completos (como el servicio); no hay edición parcial campo por campo.
- No hay detección de ediciones concurrentes: si dos personas editan el mismo cliente, prevalece la última que guarda.
- La eliminación es definitiva; no hay papelera, deshacer ni historial, igual que en la spec 003.
- El CUIL se presenta siempre con guiones usando el formateo único que ya existe en el dashboard (spec 003); el servicio lo devuelve sin guiones.
- Los mensajes de error por campo se toman del servicio; el dashboard solo agrega textos propios para los casos que bloquea antes de enviar (CUIL vacío, métrica no numérica) y para los avisos generales.
- Paginación, ordenamiento, filtros nuevos, edición masiva, importación o exportación de clientes, y la edición de la configuración del scoring siguen fuera de alcance.
- Las decisiones de diseño concretas (componentes de diálogo y notificaciones, cómo se comparte la actualización de la cartera entre pantallas) se definen en el plan de implementación, respetando el stack de frontend de la constitución.
