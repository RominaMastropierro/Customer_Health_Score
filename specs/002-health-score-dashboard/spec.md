# Feature Specification: Pantallas del Dashboard de Salud de Clientes

**Feature Branch**: `002-health-score-dashboard`

**Created**: 2026-10-11

**Status**: Draft

**Input**: User description: "quiero implementar las pantallas para la API de la spec 001. Usa como material de referencia la informacion del folther docs\front_desing_assets\B2B SaaS Dashboard Design"

**Depende de**: [001-customer-health-scoring](../001-customer-health-scoring/spec.md) (motor de scoring y su interfaz de servicio).

**Referencia visual**: `docs/front_desing_assets/B2B SaaS Dashboard Design` (prototipo con datos simulados). El prototipo define la estructura, la navegación, los estados y el estilo visual; los datos, reglas y resultados provienen exclusivamente de la interfaz de servicio de la spec 001.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver la salud de toda la cartera (Priority: P1)

Una persona de Customer Success abre la aplicación y ve, en la pantalla "Cartera", un resumen de la cartera almacenada: total de clientes, cantidad y porcentaje por nivel (Top, Estable, En riesgo) y cantidad de registros inválidos, un gráfico de distribución por nivel y una tabla con todos los clientes (nombre, identificador, score, nivel). Puede buscar por nombre o identificador, filtrar por nivel y ordenar por score para decidir a quién contactar primero.

**Why this priority**: es la pantalla de inicio y la que entrega el valor operativo principal (priorizar cuentas). Por sí sola ya es un MVP útil.

**Independent Test**: con la cartera de datos ficticios cargada en el sistema, se abre la pantalla y se verifica que los totales, la distribución y la tabla coinciden con lo que devuelve el servicio de evaluación de cartera, y que búsqueda, filtro y orden funcionan.

**Acceptance Scenarios**:

1. **Given** una cartera almacenada de N clientes, **When** se abre la pantalla Cartera, **Then** se muestra el total N, el conteo por nivel y el de inválidos tal como los informa el servicio, y la suma de los conteos es igual a N.
2. **Given** la pantalla Cartera cargada, **When** se escribe parte del nombre o del identificador en el buscador, **Then** la tabla muestra solo los clientes que coinciden y el contador de resultados se actualiza.
3. **Given** la pantalla Cartera cargada, **When** se filtra por "En riesgo" y se ordena por score ascendente, **Then** la tabla muestra solo clientes En riesgo, del score más bajo al más alto.
4. **Given** un cliente con datos inválidos en la cartera, **When** se muestra la tabla, **Then** aparece con la marca "Inválido", sin score (se muestra "—"), y al consultar su marca se ven los mensajes de error que devolvió el servicio.
5. **Given** que el servicio no responde o devuelve un error, **When** se abre la pantalla, **Then** se muestra un estado de error con la opción "Reintentar", sin datos parciales ni inventados.
6. **Given** una cartera vacía, **When** se abre la pantalla, **Then** se muestra un estado vacío con conteos en cero, sin error.

---

### User Story 2 - Calcular el score de un cliente nuevo (Priority: P1)

Una persona de Customer Success abre la pantalla "Nuevo cliente", ingresa las cuatro métricas (uso con un control deslizante de 0 a 100 %, tickets de soporte de los últimos 30 días, NPS con selector de 0 a 10 y días hasta la renovación) y pulsa "Calcular score". Ve el score en un indicador circular, el nivel y el desglose de los cuatro sub-scores.

**Why this priority**: es la otra capacidad central de la spec 001 (US1) y permite evaluar clientes que todavía no están en la cartera.

**Independent Test**: se ingresan métricas conocidas (p. ej., uso 90, 0 tickets, NPS 9, 300 días), se calcula y se verifica que el score, nivel y sub-scores mostrados son idénticos a los que devuelve el servicio para las mismas métricas.

**Acceptance Scenarios**:

1. **Given** métricas válidas, **When** se pulsa "Calcular score", **Then** se muestran el score (0–100), el nivel y los cuatro sub-scores devueltos por el servicio, sin recalcular nada en la pantalla.
2. **Given** una métrica que el servicio rechaza (p. ej., tickets con decimales o días negativos), **When** se pulsa "Calcular score", **Then** el error se muestra junto al campo correspondiente, con un mensaje comprensible, y no se muestra ningún score.
3. **Given** un cálculo en curso, **When** se espera la respuesta, **Then** el botón queda deshabilitado y se muestra un indicador de "Calculando" hasta recibir el resultado o el error.
4. **Given** un nombre opcional ingresado, **When** se muestra el resultado, **Then** el resultado se titula con ese nombre; el nombre no modifica el cálculo.
5. **Given** que no se calculó nada aún, **When** se abre la pantalla, **Then** el panel de resultado muestra un estado inicial que invita a completar los datos.

---

### User Story 3 - Ver el detalle de un cliente de la cartera (Priority: P2)

Desde la tabla de la cartera, la persona selecciona un cliente (clic o tecla Enter) y se abre un panel lateral de detalle con nombre, identificador, nivel, score en indicador circular, el desglose de sub-scores y, si el registro es inválido, la lista de errores por campo.

**Why this priority**: explica *por qué* un cliente tiene su nivel (sub-scores), lo que permite actuar; depende de la US1.

**Independent Test**: se selecciona un cliente conocido y se verifica que el detalle coincide con la respuesta del servicio de evaluación de ese cliente; se simula un identificador inexistente y se verifica el estado "Cliente no encontrado".

**Acceptance Scenarios**:

1. **Given** la tabla de la cartera, **When** se selecciona un cliente válido, **Then** el panel muestra su score, nivel y los cuatro sub-scores según el servicio.
2. **Given** un cliente inválido, **When** se abre su detalle, **Then** no se muestra score y se listan los errores por campo.
3. **Given** que el servicio responde que el cliente no existe, **When** se abre el detalle, **Then** se muestra "Cliente no encontrado" y un botón para volver a la cartera.
4. **Given** el panel abierto, **When** se pulsa cerrar, se pulsa Escape o se hace clic fuera del panel, **Then** el panel se cierra y la cartera conserva búsqueda, filtro y orden.

---

### User Story 4 - Ver clientes agrupados por categoría (Priority: P2)

En la pantalla "Por categoría", la persona ve una columna por nivel (Top, Estable, En riesgo) más una columna "Inválido", cada una con su cantidad y porcentaje y tarjetas de cliente que indican nombre, identificador, score y su métrica más débil (el sub-score más bajo). Cada columna puede colapsarse o expandirse.

**Why this priority**: facilita repartir el trabajo del equipo por nivel; reutiliza los datos de la US1.

**Independent Test**: con la cartera ficticia, se verifica que cada cliente aparece en la columna de su nivel, que los conteos coinciden con la pantalla Cartera y que la métrica más débil corresponde al menor sub-score.

**Acceptance Scenarios**:

1. **Given** la cartera cargada, **When** se abre "Por categoría", **Then** cada cliente aparece exactamente en una columna y los conteos coinciden con el resumen de la pantalla Cartera.
2. **Given** una columna sin clientes, **When** se muestra, **Then** indica "Sin clientes en esta categoría".
3. **Given** una tarjeta de cliente inválido, **When** se muestra, **Then** indica la cantidad de errores de validación en lugar de la métrica más débil.

---

### User Story 5 - Consultar la configuración activa (Priority: P3)

La persona puede ver, en modo solo lectura, la configuración de scoring vigente: peso de cada métrica, umbrales de Top y En riesgo, tope de tickets y horizonte de renovación, para entender cómo se calculan los resultados que está viendo.

**Why this priority**: aporta transparencia y explicabilidad, pero no es necesaria para operar.

**Independent Test**: se compara lo mostrado con la configuración que devuelve el servicio; se modifica el archivo de configuración, se recarga y se verifica que la pantalla refleja los nuevos valores.

**Acceptance Scenarios**:

1. **Given** la configuración por defecto, **When** se abre la vista de configuración, **Then** muestra pesos 25 % cada uno, Top = 75, En riesgo = 50, tope de tickets = 10 y horizonte = 180 días.
2. **Given** la vista de configuración, **When** se la observa, **Then** no ofrece ningún control para editar valores.

---

### Edge Cases

- El servicio tarda en responder: cada pantalla muestra un estado de carga; nunca muestra valores de ejemplo mientras espera.
- El servicio no está disponible o devuelve un error inesperado: estado de error con "Reintentar"; en "Nuevo cliente" se conservan los valores ingresados.
- Búsqueda o filtro sin coincidencias: la tabla muestra un estado vacío específico ("Sin resultados") distinto del de cartera vacía.
- Score exactamente en un umbral: la pantalla muestra el nivel que devuelve el servicio, sin reinterpretarlo.
- Un cliente sin nombre: se muestra su identificador en lugar del nombre, y las iniciales del avatar salen del identificador.
- Un cliente con varios errores de validación: se muestran todos, cada uno con su campo y mensaje.
- Campo de métrica vacío o con texto en "Nuevo cliente": el envío se bloquea o el error del servicio se muestra en ese campo; nunca se envía un valor inventado.
- Cambio de pantalla mientras hay una solicitud en curso: el resultado tardío no debe aparecer en otra pantalla.
- Pantallas angostas (móvil): la navegación pasa a una barra inferior y la tabla se puede desplazar horizontalmente sin romper el diseño.

## Requirements *(mandatory)*

### Functional Requirements

**Navegación y estructura**

- **FR-001**: La aplicación MUST ofrecer tres pantallas principales accesibles desde una barra de navegación: "Cartera" (inicio), "Por categoría" y "Nuevo cliente", más un panel lateral de detalle de cliente y una vista de configuración de solo lectura.
- **FR-002**: En pantallas angostas la navegación MUST trasladarse a una barra inferior con las mismas tres secciones.
- **FR-003**: La aplicación MUST ofrecer modo claro y modo oscuro, conmutables por la persona usuaria.

**Origen de los datos y reglas**

- **FR-004**: Todos los scores, niveles, sub-scores, conteos, errores de validación y valores de configuración mostrados MUST provenir de la interfaz de servicio de la spec 001; las pantallas MUST NOT calcular scores, asignar niveles ni redefinir rangos o umbrales.
- **FR-005**: Las pantallas MUST NOT mostrar datos simulados o de ejemplo en ningún estado; todo dato mostrado es el que devuelve el servicio (que a su vez son datos ficticios, según la spec 001).
- **FR-006**: La validación previa en la pantalla (p. ej., limitar el selector de NPS a 0–10) MAY existir como ayuda, pero la pantalla MUST mostrar y respetar los errores que devuelve el servicio como fuente de verdad.

**Cartera (US1)**

- **FR-007**: La pantalla Cartera MUST mostrar indicadores de total de clientes, cantidad y porcentaje por nivel y cantidad de inválidos, tomados del resumen de cartera del servicio.
- **FR-008**: La pantalla Cartera MUST mostrar un gráfico de distribución de clientes por nivel (incluyendo inválidos) con leyenda de cantidad y porcentaje.
- **FR-009**: La tabla de clientes MUST mostrar por fila: nombre (o identificador si no tiene nombre), identificador, score (o "—" si es inválido) y nivel con distintivo de color; y MUST permitir búsqueda por nombre o identificador, filtro por nivel (incluido "Inválido") y orden ascendente/descendente por score.
- **FR-010**: Las filas de clientes inválidos MUST permitir consultar sus mensajes de error.
- **FR-011**: Cada fila MUST poder seleccionarse con el mouse o el teclado para abrir el detalle del cliente.
- **FR-012**: La tabla y el panel de detalle MUST mostrar también las métricas originales del cliente (uso, tickets, NPS, días hasta renovación), incluidos los valores tal como fueron recibidos en los registros inválidos (p. ej., uso 120). Para esto, la interfaz de servicio de la spec 001 MUST ampliarse para devolver las métricas originales junto a cada resultado de cliente de la cartera almacenada y del detalle; esta ampliación MUST ser aditiva (no cambia score, nivel, sub-scores ni errores) y MUST reflejarse en el contrato y los tests de la spec 001.

**Nuevo cliente (US2)**

- **FR-013**: La pantalla Nuevo cliente MUST ofrecer: un nombre opcional (solo para titular el resultado), uso con control deslizante 0–100 %, tickets de soporte y días hasta renovación como números enteros, y NPS con un selector de 0 a 10.
- **FR-014**: Al calcular, la pantalla MUST enviar solo las cuatro métricas al servicio y mostrar score, nivel y los cuatro sub-scores devueltos.
- **FR-015**: Los errores de validación devueltos por el servicio MUST mostrarse junto al campo afectado, con un mensaje en español comprensible para personas no técnicas.
- **FR-016**: Mientras se calcula, la acción MUST deshabilitarse y mostrar un indicador de progreso.
- **FR-017**: El resultado calculado MUST NOT guardarse en la cartera; la pantalla MUST indicar que los datos no se guardan.

**Detalle de cliente (US3)**

- **FR-018**: El panel de detalle MUST obtener los datos del servicio de evaluación de un cliente de la cartera y mostrar nombre, identificador, nivel, score y sub-scores; o, si es inválido, la lista de errores por campo.
- **FR-019**: Si el servicio indica que el cliente no existe, el panel MUST mostrar "Cliente no encontrado" con una acción para volver.
- **FR-020**: El panel MUST cerrarse con botón, tecla Escape o clic fuera de él, conservando el estado de búsqueda, filtro y orden de la cartera.

**Por categoría (US4)**

- **FR-021**: La pantalla MUST mostrar una columna por nivel más una columna "Inválido", cada una con cantidad, porcentaje sobre el total y tarjetas de cliente; las columnas MUST poder colapsarse y expandirse.
- **FR-022**: Cada tarjeta de cliente válido MUST indicar su métrica más débil (la de menor sub-score según el servicio); las de clientes inválidos MUST indicar la cantidad de errores.

**Configuración (US5)**

- **FR-023**: La aplicación MUST mostrar en modo solo lectura la configuración activa devuelta por el servicio: pesos (como porcentaje del total), umbrales de Top y En riesgo, tope de tickets y horizonte de renovación.

**Estados y accesibilidad**

- **FR-024**: Cada pantalla que depende del servicio MUST tener estados explícitos de carga, error (con "Reintentar") y vacío.
- **FR-025**: Los niveles MUST distinguirse por texto además de por color, y todas las acciones MUST ser operables con teclado y tener etiquetas accesibles.
- **FR-026**: Los textos de la interfaz MUST estar en español.

### Key Entities

- **Vista de cartera**: resumen (total, conteo por nivel, inválidos) y lista de resultados por cliente, tal como los entrega el servicio de evaluación de cartera.
- **Resultado de cliente**: identificador, nombre opcional, métricas originales tal como se recibieron y, o bien score + nivel + sub-scores, o bien lista de errores por campo.
- **Formulario de evaluación**: las cuatro métricas ingresadas manualmente más un nombre opcional que solo se usa para titular el resultado.
- **Configuración visible**: pesos, umbrales, tope de tickets y horizonte de renovación vigentes, en solo lectura.
- **Grupo de visualización**: Top, Estable, En riesgo e Inválido. "Inválido" es una agrupación de la interfaz para registros con errores, no un nivel del motor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 100 % de los casos verificados, el score, nivel, sub-scores y conteos que muestran las pantallas son idénticos a los que devuelve el servicio para la misma entrada.
- **SC-002**: Una persona de Customer Success identifica los 5 clientes con menor score de la cartera en menos de 30 segundos desde que abre la aplicación.
- **SC-003**: Una persona obtiene el score de un cliente nuevo en menos de 1 minuto desde que abre la pantalla "Nuevo cliente", incluyendo la carga de datos.
- **SC-004**: La pantalla Cartera con 1.000 clientes muestra sus datos en menos de 3 segundos y la búsqueda o el filtro responden en menos de 0,5 segundos.
- **SC-005**: El 100 % de los errores de validación devueltos por el servicio se muestran asociados al campo correcto.
- **SC-006**: Todas las pantallas se pueden usar completas con teclado y sin desplazamiento horizontal de la página en anchos de 360 px en adelante (salvo la tabla, que se desplaza dentro de su contenedor).
- **SC-007**: Ninguna pantalla muestra datos simulados, de ejemplo o calculados por la propia interfaz.

## Assumptions

- La interfaz de servicio de la spec 001 está disponible y es la única fuente de datos; esta funcionalidad no agrega reglas de negocio nuevas.
- La única excepción es la ampliación aditiva del servicio de la spec 001 para devolver las métricas originales (FR-012), decidida para mantener la fidelidad con el prototipo. Se actualizarán el contrato, la implementación y los tests de la spec 001 con el mismo flujo de Spec Kit.
- Un registro inválido puede traer métricas no numéricas o ausentes; en ese caso la pantalla muestra el valor tal como llegó, o "—" si falta.
- Las personas usuarias son internas; no se requiere inicio de sesión ni permisos (igual que la spec 001).
- La edición de pesos y umbrales desde la interfaz queda fuera de alcance: el servicio solo permite consultarla y la spec 001 define que se edita en la configuración externa.
- La evaluación de una cartera enviada por la persona (carga de un archivo o lista) queda fuera de alcance; la pantalla Cartera muestra la cartera almacenada.
- "Guardar en cartera" desde "Nuevo cliente" queda fuera de alcance, porque el servicio no lo ofrece; el prototipo lo muestra deshabilitado como "Disponible próximamente" y puede mantenerse así.
- El prototipo de referencia usa datos, pesos, umbrales y una fórmula simulados que difieren de la spec 001 (p. ej., umbrales 80/60); se toma solo su diseño, navegación y estados, nunca sus valores.
- El indicador "Actualizado ahora" del prototipo refleja el momento de la última carga exitosa de la cartera.
- La preferencia de modo claro/oscuro puede recordarse en el navegador de la persona; no se persiste en el servidor.
