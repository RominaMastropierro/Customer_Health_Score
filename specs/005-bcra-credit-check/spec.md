# Feature Specification: Consulta de Situación Crediticia en el BCRA al Dar de Alta un Cliente

**Feature Branch**: `005-bcra-credit-check`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Consulta de situación crediticia en la Central de Deudores del BCRA al dar de alta un cliente. En el formulario existente para agregar un cliente, el usuario ingresa un CUIT/CUIL en el campo correspondiente. Cuando el campo pierde el foco (blur): normalizar el CUIT/CUIL eliminando guiones, espacios y otros separadores permitidos; validar que tenga 11 dígitos y comprobar su dígito verificador mediante el algoritmo correspondiente; si el valor es inválido, mostrar un mensaje claro de validación y no realizar ninguna consulta; si es válido, enviar una solicitud al endpoint de nuestro backend encargado de consultar la situación crediticia; mientras se realiza la consulta, mostrar un indicador de carga y evitar solicitudes duplicadas para el mismo valor; cuando llegue la respuesta, mostrar un mensaje comprensible para el usuario; si el usuario modifica el CUIT/CUIL después de una consulta, invalidar el resultado anterior y consultar nuevamente cuando corresponda. No realizar la consulta directamente desde el navegador a la API del BCRA: el front consulta a un endpoint de nuestra API, y nuestra API consulta la API pública del BCRA (Central de Deudores v1.0, endpoint GET api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/{identificacion}, documentado en central-deudores-v1.md en la raíz del repo) e interpreta la respuesta (situación 1 a 5 por entidad, montos en miles de pesos, días de atraso, respuestas 400/404/500) para producir el texto que se muestra en pantalla."

## Clarifications

### Session 2026-10-26

- Q: ¿Cómo se compatibiliza quitar separadores para la consulta con el formato que acepta el alta (solo 11 dígitos o `XX-XXXXXXXX-X`)? → A: El campo acepta los mismos formatos que el alta: 11 dígitos, con o sin guiones (`XX-XXXXXXXX-X`), y el valor se conserva en el formulario tal como se escribió, como en la spec 004. El único separador permitido es el guion en sus posiciones canónicas; espacios, puntos u otros caracteres son un error de formato. Para consultar al BCRA, que exige 11 dígitos sin guiones, se quitan los guiones.
- Q: ¿Cómo se compatibiliza la consulta de datos reales del BCRA con el Principio IX (solo datos ficticios)? → A: Se enmienda la constitución con `/speckit-constitution` para permitir consultar fuentes públicas oficiales con datos reales en tiempo de uso, sin persistirlos ni registrarlos. Las pruebas, los datos de ejemplo y las demostraciones siguen siendo solo ficticios.

**Depende de**: [003-client-persistence-crud](../003-client-persistence-crud/spec.md) (regla del CUIT/CUIL: formato y dígito verificador) y [004-client-crud-ui](../004-client-crud-ui/spec.md) (pantalla "Nuevo cliente" con el campo "CUIT/CUIL"). Fuente externa: Central de Deudores del BCRA, método "Deudas", descripta en [central-deudores-v1.md](../../central-deudores-v1.md). Requiere la enmienda del Principio IX de la constitución (Clarifications) antes de implementarse.

**Cambia de la spec 004**: FR-021 de la spec 004 reservaba el dígito verificador al servicio. Esta feature lo comprueba también en el dashboard, solo para decidir si consulta al BCRA (FR-003); guardar el cliente sigue validándose en el servicio sin cambios.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver la situación crediticia del CUIT al terminar de escribirlo (Priority: P1)

Una persona de Customer Success está dando de alta un cliente en "Nuevo cliente". Escribe el CUIT en el campo "CUIT/CUIL" y pasa al campo siguiente. Debajo del campo aparece un indicador "Consultando situación en el BCRA…" y, unos segundos después, un mensaje en español que resume lo que informa la Central de Deudores: a nombre de quién figura, la peor situación informada, en cuántas entidades tiene deuda, el monto total y si hay atrasos o situaciones especiales. Con eso decide si continúa con el alta.

**Why this priority**: es el valor central de la feature: conocer el riesgo crediticio del cliente en el momento del alta, sin salir del dashboard ni consultar otro sitio.

**Independent Test**: con el servicio del BCRA simulado para que devuelva deudas de un CUIT sintético, se escribe ese CUIT, se sale del campo y se verifica que aparece el indicador de carga, que se hace exactamente una consulta a nuestro servicio (nunca al BCRA desde el navegador) y que el mensaje muestra la denominación, la peor situación, la cantidad de entidades, el monto total y los atrasos.

**Acceptance Scenarios**:

1. **Given** la pantalla "Nuevo cliente", **When** se escribe un CUIT válido (p. ej. `20-90000024-4`) y el campo pierde el foco, **Then** se muestra junto al campo un indicador de carga con el texto "Consultando situación en el BCRA…" y se envía una única consulta a nuestro servicio.
2. **Given** una consulta en curso, **When** llega una respuesta con deudas, **Then** el indicador desaparece y se muestra un mensaje con: la denominación informada; la peor situación entre todas las entidades del último período, con su número y su descripción en lenguaje claro (p. ej. "Situación 1 · Normal"); la cantidad de entidades que informan deuda; el monto total en pesos (convertido desde miles de pesos) y el período informado (mes y año).
3. **Given** una respuesta donde todas las entidades informan situación 1 y 0 días de atraso, **When** se muestra el mensaje, **Then** se presenta con un tono positivo (p. ej. "Sin problemas de pago informados").
4. **Given** una respuesta donde alguna entidad informa situación 2 o mayor, **When** se muestra el mensaje, **Then** se presenta con un tono de alerta proporcional (2 advertencia; 3 a 5 riesgo), indica cuál es la peor situación y qué entidad la informa, y muestra el máximo de días de atraso cuando es mayor que 0.
5. **Given** una respuesta donde alguna entidad marca refinanciaciones, recategorización obligatoria, situación jurídica, irrecuperable por disposición técnica, información en revisión o en proceso judicial, **When** se muestra el mensaje, **Then** se indica cada una de esas marcas en lenguaje claro.
6. **Given** el mensaje con el resumen, **When** la persona quiere ver el detalle, **Then** puede desplegar la lista de entidades con su situación, monto y días de atraso.
7. **Given** cualquier resultado de la consulta, **When** se completa el resto del formulario, **Then** calcular el score y guardar en cartera funcionan igual que antes: el resultado del BCRA es informativo, no modifica el score ni bloquea el alta.

---

### User Story 2 - Detectar un CUIT mal escrito sin consultar al BCRA (Priority: P1)

La persona escribe un CUIT con un dígito equivocado, con menos dígitos o con letras. Al salir del campo ve un mensaje claro junto al campo que explica qué está mal, y no se hace ninguna consulta.

**Why this priority**: evita consultas inútiles al BCRA (que limita el tráfico por dirección IP) y da una corrección inmediata, antes de llegar a guardar.

**Independent Test**: se escriben valores con 10 dígitos, con 12, con letras y con dígito verificador incorrecto; en cada caso, al salir del campo, se verifica el mensaje junto al campo y que no se hizo ninguna solicitud a nuestro servicio.

**Acceptance Scenarios**:

1. **Given** el campo "CUIT/CUIL", **When** se escribe un valor que no tiene la forma de 11 dígitos ni de `XX-XXXXXXXX-X` (p. ej. `20-9000002-4`, `209000002`, `20A90000024`, `20-900000244` o `20 90000024 4`) y el campo pierde el foco, **Then** se muestra junto al campo "El CUIT/CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)" y no se realiza ninguna consulta.
2. **Given** un mensaje de formato visible, **When** se mira el campo, **Then** conserva el valor tal como se escribió: el dashboard no lo reformatea ni lo corrige.
3. **Given** el campo "CUIT/CUIL", **When** se escribe un valor de 11 dígitos con dígito verificador incorrecto (p. ej. `20900000245`), **Then** se muestra junto al campo "El dígito verificador del CUIT/CUIL no es válido" y no se consulta.
4. **Given** el campo "CUIT/CUIL" vacío, **When** pierde el foco, **Then** no se muestra error ni se consulta (el campo vacío solo se señala al guardar, como hoy).
5. **Given** un mensaje de validación visible, **When** se corrige el valor y el campo pierde el foco con un CUIT válido, **Then** el mensaje desaparece y se realiza la consulta.
6. **Given** un mensaje de validación, **When** se lo navega con un lector de pantalla, **Then** el campo queda marcado como inválido y asociado al mensaje.

---

### User Story 3 - Cambiar el CUIT después de una consulta (Priority: P2)

La persona consultó un CUIT y luego se da cuenta de que era otro. Al empezar a modificarlo, el resultado anterior desaparece para que no se confunda con el del nuevo valor; al salir del campo se consulta el CUIT nuevo.

**Why this priority**: sin esto, la pantalla podría mostrar la situación crediticia de un CUIT distinto del que se va a guardar, lo que lleva a decisiones equivocadas.

**Independent Test**: se consulta un CUIT, se modifica el campo y se verifica que el resultado desaparece de inmediato; se sale del campo con otro CUIT válido y se verifica una consulta nueva cuyo resultado corresponde al nuevo valor.

**Acceptance Scenarios**:

1. **Given** un resultado visible para un CUIT, **When** se modifica el contenido del campo, **Then** el resultado desaparece de inmediato.
2. **Given** una consulta en curso para un CUIT, **When** se modifica el campo, **Then** la consulta en curso se descarta y su respuesta, si llega, no se muestra.
3. **Given** un resultado para `20-90000024-4`, **When** el campo pierde el foco con el mismo CUIT escrito de otra forma (p. ej. `20900000244`), **Then** no se repite la consulta y se vuelve a mostrar el resultado de ese CUIT.
4. **Given** un CUIT ya consultado, **When** el campo pierde el foco varias veces sin cambiar el valor, **Then** no se realizan consultas adicionales.
5. **Given** una consulta en curso para un CUIT, **When** el campo pierde el foco otra vez con el mismo CUIT, **Then** no se envía una segunda solicitud.
6. **Given** un alta guardada con éxito, **When** el formulario se vacía, **Then** el resultado de la consulta también desaparece.

---

### User Story 4 - Entender cuando no hay datos o el BCRA no responde (Priority: P2)

Si el BCRA no tiene información del CUIT, la persona lo ve como un mensaje neutro ("no registra deudas informadas"), no como un error. Si el BCRA no responde o falla, ve un aviso que lo explica y puede reintentar, sin que eso le impida seguir con el alta.

**Why this priority**: el caso "sin datos" es frecuente (personas o empresas sin financiaciones) y no debe alarmar; las fallas del servicio externo no deben bloquear el trabajo.

**Independent Test**: con el BCRA simulado devolviendo "sin datos", error del servidor, demora excesiva y respuesta mal formada, se verifica en cada caso el mensaje, la opción de reintentar cuando corresponde y que calcular y guardar siguen disponibles.

**Acceptance Scenarios**:

1. **Given** un CUIT válido sin información en la Central de Deudores, **When** llega la respuesta, **Then** se muestra un mensaje neutro: "El BCRA no registra deudas informadas para este CUIT/CUIL".
2. **Given** que el BCRA responde con un error, no responde dentro del tiempo límite o devuelve una respuesta que no se puede interpretar, **When** termina la consulta, **Then** se muestra "No pudimos consultar la situación en el BCRA en este momento" con una acción "Reintentar", y el resto del formulario sigue funcionando.
3. **Given** que el BCRA rechaza la consulta por exceso de tráfico, **When** termina la consulta, **Then** se muestra el mismo aviso de no disponibilidad, que invita a reintentar en unos minutos.
4. **Given** que nuestro servicio no está disponible, **When** termina la consulta, **Then** se muestra el aviso general de no disponibilidad con "Reintentar".
5. **Given** el aviso de no disponibilidad, **When** se pulsa "Reintentar", **Then** se repite la consulta para el mismo CUIT con su indicador de carga.

---

### Edge Cases

- ¿Qué pasa si el CUIT se escribe con espacios, puntos o guiones fuera de lugar (p. ej. ` 20-90000024-4`, `20.90000024.4` o `2090-000024-4`)? Es un error de formato: se muestra el mensaje de FR-002 y no se consulta, igual que el alta lo rechazaría al guardar (spec 004). El dashboard no recorta ni reescribe el valor.
- ¿Qué pasa si la persona sale del campo y vuelve a entrar muy rápido? Solo se consulta al perder el foco y nunca más de una vez a la vez para el mismo CUIT normalizado (US3).
- ¿Qué pasa si la persona sale de la pantalla con una consulta en curso? La consulta se descarta y su respuesta no se muestra en ninguna otra pantalla.
- ¿Qué pasa si la respuesta de un CUIT anterior llega después de la de uno nuevo? Solo se muestra la respuesta que corresponde al valor actual del campo.
- ¿Qué pasa si el BCRA informa varios períodos? Se usa el más reciente para el resumen.
- ¿Qué pasa si una entidad informa una situación fuera de 1 a 5 o un monto ausente? Esa entidad se muestra con "Situación no informada" o "Monto no informado" y no se usa para calcular la peor situación ni el total; el resto del resumen se muestra igual.
- ¿Qué pasa si el BCRA informa 0 días de atraso? Según el manual, 0 significa "No aplicable": no se muestra atraso.
- ¿Qué pasa si el CUIT ya está registrado en otro cliente de la cartera? La consulta se hace igual; el conflicto se informa al guardar, como hoy (spec 004).
- ¿Qué pasa en la edición de un cliente existente? Esta feature solo cubre el alta; la edición no consulta al BCRA.
- ¿Qué pasa si alguien llama directamente a nuestro servicio con un CUIT inválido? El servicio lo rechaza con un error de validación en español, con la misma regla que el alta, sin consultar al BCRA.
- ¿Qué pasa en pantallas angostas? El indicador, el mensaje y el detalle por entidad se ven completos sin desplazamiento horizontal.

## Requirements *(mandatory)*

### Functional Requirements

**Disparo y validación en el dashboard**

- **FR-001**: En la pantalla "Nuevo cliente", cuando el campo "CUIT/CUIL" pierde el foco y no está vacío, el dashboard MUST validar el valor y, si es válido, normalizarlo quitando los guiones para obtener los 11 dígitos con que se consulta. El campo MUST conservar el valor tal como se escribió (spec 004, FR-001). Mientras se escribe MUST NOT consultarse.
- **FR-002**: Los formatos admitidos MUST ser los mismos que acepta el alta (spec 003): exactamente 11 dígitos, o `XX-XXXXXXXX-X` con los guiones en esas posiciones. Cualquier otro valor (otra cantidad de dígitos, letras, espacios, puntos u otros separadores, guiones fuera de lugar) MUST mostrar junto al campo "El CUIT/CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)" y MUST NOT consultar.
- **FR-003**: Si el formato es válido, el dashboard MUST comprobar el dígito verificador con el mismo algoritmo oficial (módulo 11) que usa el servicio; si no es válido, MUST mostrar "El dígito verificador del CUIT/CUIL no es válido" y MUST NOT consultar. Esta comprobación MUST definirse en un único lugar del dashboard y MUST verificarse con los mismos casos de prueba que la regla del servicio (constitución, Principio VI).
- **FR-004**: Un campo vacío al perder el foco MUST NOT mostrar error ni consultar.

**Consulta**

- **FR-005**: Si el valor es válido, el dashboard MUST pedir la situación crediticia a nuestro servicio enviando el CUIT normalizado (11 dígitos, sin guiones). El navegador MUST NOT comunicarse directamente con el BCRA.
- **FR-006**: Mientras la consulta está en curso, el dashboard MUST mostrar junto al campo un indicador de carga accesible ("Consultando situación en el BCRA…") y MUST NOT enviar otra solicitud para el mismo CUIT normalizado.
- **FR-007**: Si el campo pierde el foco con el mismo CUIT normalizado que ya tiene un resultado visible, MUST NOT repetirse la consulta.
- **FR-008**: Al modificar el contenido del campo, el dashboard MUST quitar de inmediato el resultado anterior y descartar cualquier consulta en curso; una respuesta que no corresponde al valor actual del campo MUST NOT mostrarse.
- **FR-009**: Al guardar el alta con éxito o al salir de la pantalla, el resultado y cualquier consulta en curso MUST descartarse.

**Servicio: consulta e interpretación**

- **FR-010**: Nuestro servicio MUST ofrecer una operación documentada que recibe un CUIT/CUIL, lo valida con la regla única de la spec 003 (rechazando un valor inválido con un error de validación en español y sin consultar al BCRA) y consulta, con los 11 dígitos sin guiones que exige el BCRA, el método "Deudas" de la Central de Deudores del BCRA.
- **FR-011**: El servicio MUST interpretar la respuesta del BCRA y devolver al dashboard un resultado ya interpretado, con uno de estos estados: **con deudas**, **sin datos** o **no disponible**. El dashboard solo presenta ese resultado; MUST NOT interpretar la respuesta del BCRA por su cuenta.
- **FR-012**: Para el estado **con deudas**, el servicio MUST tomar el período más reciente y devolver: CUIT, denominación, período, peor situación (1 a 5) con su descripción, cantidad de entidades, monto total en pesos (los montos del BCRA vienen en miles de pesos), máximo de días de atraso (0 se trata como "no aplicable"), las marcas especiales presentes (refinanciaciones, recategorización obligatoria, situación jurídica, irrecuperable por disposición técnica, en revisión, proceso judicial) y el detalle por entidad (nombre, situación, monto y días de atraso).
- **FR-013**: Las descripciones de cada situación MUST definirse en un único lugar del servicio, a partir del manual del BCRA: 1 "Normal", 2 "Con seguimiento especial / Riesgo bajo", 3 "Con problemas / Riesgo medio", 4 "Con alto riesgo de insolvencia / Riesgo alto", 5 "Irrecuperable".
- **FR-014**: El servicio MUST devolver **sin datos** cuando el BCRA indica que no encontró datos para la identificación.
- **FR-015**: El servicio MUST devolver **no disponible** cuando el BCRA responde con error, rechaza por exceso de tráfico, no responde dentro de un tiempo límite de 10 segundos o devuelve una respuesta con una estructura que no se puede interpretar. El servicio MUST NOT exponer al dashboard los mensajes técnicos del BCRA.
- **FR-016**: La respuesta del BCRA MUST validarse en el servicio antes de interpretarla (constitución, Principio V).
- **FR-017**: La comunicación con el BCRA MUST realizarse a través de una interfaz de acceso propia, de modo que las pruebas puedan reemplazarla por una simulada y que cambiar de fuente no requiera tocar la UI (constitución, Principio IV).

**Presentación**

- **FR-018**: El dashboard MUST presentar el resultado en español y en lenguaje claro según FR-012 a FR-015 y los escenarios de US1 y US4, con un tono visual según la peor situación (1 positivo, 2 advertencia, 3 a 5 riesgo; sin datos neutro; no disponible con la acción "Reintentar").
- **FR-019**: El monto total MUST mostrarse en pesos con formato local (separador de miles), y el período como mes y año (p. ej. "julio 2024").
- **FR-020**: El indicador y el resultado MUST anunciarse a las tecnologías de asistencia sin mover el foco, y MUST usarse en pantallas angostas sin desplazamiento horizontal.
- **FR-021**: El resultado de la consulta MUST NOT modificar el score, el nivel ni la posibilidad de calcular o guardar el cliente.

**Privacidad, compatibilidad y calidad**

- **FR-022**: El resultado de la consulta MUST NOT guardarse junto al cliente ni en ningún almacenamiento, y el servicio MUST NOT registrar en sus logs el CUIT consultado, la denominación ni los datos de deuda. Mostrar datos reales en tiempo de uso se apoya en la enmienda del Principio IX de la constitución (Clarifications); esta feature MUST NOT implementarse antes de esa enmienda.
- **FR-023**: Las pruebas automatizadas MUST NOT llamar al BCRA real: MUST usar una fuente simulada y CUIT sintéticos (prefijo `20`, cuerpos `9000xxxx`, como en la spec 003).
- **FR-024**: Las pruebas MUST cubrir: normalización con y sin guiones (se consulta siempre con 11 dígitos sin guiones); rechazo de espacios, puntos y guiones fuera de lugar; validación de longitud, caracteres y dígito verificador (con los mismos casos en el dashboard y en el servicio); consulta al perder el foco; no consulta con valor inválido o vacío; indicador de carga; una sola solicitud por CUIT; invalidación al modificar; descarte de respuestas tardías; interpretación de con deudas (peor situación, total, atrasos, marcas, varios períodos, entidad con datos incompletos), sin datos y no disponible (error, tráfico, demora, respuesta mal formada); y el reintento.
- **FR-025**: Las pantallas y flujos existentes MUST seguir funcionando igual; las pruebas existentes del dashboard y del servicio MUST seguir pasando sin cambiar sus expectativas.
- **FR-026**: Si la aplicación se ejecuta en contenedores, el acceso de salida del servicio a internet MUST limitarse a lo necesario para consultar al BCRA, y la excepción a la red interna MUST documentarse según la constitución (Contenedores y despliegue).

### Key Entities *(include if feature involves data)*

- **Consulta crediticia**: el CUIT normalizado que se consulta y su estado en el dashboard (sin consultar, validación fallida, consultando, con resultado). Existe solo mientras la persona está en "Nuevo cliente" y no se guarda.
- **Situación crediticia**: el resultado interpretado que devuelve nuestro servicio: estado (con deudas, sin datos, no disponible) y, si hay deudas, CUIT, denominación, período, peor situación con su descripción, cantidad de entidades, monto total en pesos, máximo de días de atraso, marcas especiales y detalle por entidad.
- **Deuda por entidad**: lo que informa cada entidad en el período: nombre de la entidad, situación (1 a 5), monto, días de atraso y marcas especiales.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 95 % de las consultas con el BCRA respondiendo con normalidad, la persona ve el resultado en menos de 5 segundos desde que sale del campo.
- **SC-002**: El 100 % de los CUIT inválidos probados (longitud, caracteres, dígito verificador) muestra el mensaje de validación y produce cero consultas.
- **SC-003**: Salir del campo varias veces, o con una consulta en curso, con el mismo CUIT produce exactamente una consulta en el 100 % de los casos.
- **SC-004**: En el 100 % de los casos probados, la pantalla nunca muestra la situación de un CUIT distinto del que está escrito en el campo.
- **SC-005**: Ante cualquier falla del BCRA (error, tráfico, demora, respuesta mal formada), la persona ve un aviso comprensible en menos de 12 segundos y puede completar el alta igual en el 100 % de los casos.
- **SC-006**: Una persona sin conocimientos de la normativa del BCRA entiende, a partir del mensaje, si el cliente tiene deudas, cuán grave es su peor situación y el monto total, sin consultar otra fuente.
- **SC-007**: Ninguna solicitud del navegador se dirige al BCRA y ningún dato de la consulta queda guardado ni registrado.
- **SC-008**: El 100 % de las pruebas existentes y nuevas pasa sin usar el BCRA real.

## Assumptions

- La consulta solo se ofrece en el alta ("Nuevo cliente"); la edición de un cliente existente queda fuera de alcance.
- Solo se usa el método "Deudas" (último período informado). Los métodos "Históricas" (24 meses) y "Cheques Rechazados" del manual quedan fuera de alcance.
- El resultado es informativo: no se incorpora al scoring, no cambia los pesos ni los niveles, no bloquea el alta y no se guarda.
- La API pública del BCRA no requiere autenticación y limita el tráfico por dirección IP; no se agrega caché persistente. Evitar consultas repetidas para el mismo CUIT dentro de la pantalla (FR-006, FR-007) alcanza para esta versión.
- El tiempo límite de 10 segundos para la consulta al BCRA es un valor razonable para una API pública; se ajusta en el plan si hiciera falta.
- La peor situación se calcula sobre todas las entidades del período más reciente; el monto total es la suma de los montos de esas entidades.
- La denominación que informa el BCRA se muestra pero no se copia al campo "Nombre" del formulario.
- La enmienda del Principio IX solo habilita consultar fuentes públicas oficiales en tiempo de uso; no habilita guardar datos reales ni usarlos en pruebas, ejemplos o demostraciones.
- Los mensajes de validación del dashboard dicen "CUIT/CUIL", siguiendo el rótulo de la spec 004 (FR-028); los mensajes del servicio para guardar no cambian.
- No hay autenticación ni permisos, como en las specs anteriores.
- Las decisiones técnicas (cliente HTTP, forma exacta de la operación del servicio, componentes de la interfaz, configuración de red de los contenedores) se definen en el plan, respetando el stack de la constitución.
