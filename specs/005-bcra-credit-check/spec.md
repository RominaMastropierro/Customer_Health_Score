# Feature Specification: Consulta de Situación Crediticia en el BCRA al Dar de Alta un Cliente

**Feature Branch**: `005-bcra-credit-check`

**Created**: 2026-10-24

**Status**: Draft

**Input**: User description: "Consulta de situación crediticia en la Central de Deudores del BCRA al dar de alta un cliente. En el formulario existente para agregar un cliente, el usuario ingresa un CUIT/CUIL en el campo correspondiente. Cuando el campo pierde el foco (blur): normalizar el CUIT/CUIL eliminando guiones, espacios y otros separadores permitidos; validar que tenga 11 dígitos y comprobar su dígito verificador mediante el algoritmo correspondiente; si el valor es inválido, mostrar un mensaje claro de validación y no realizar ninguna consulta; si es válido, enviar una solicitud al endpoint de nuestro backend encargado de consultar la situación crediticia; mientras se realiza la consulta, mostrar un indicador de carga y evitar solicitudes duplicadas para el mismo valor; cuando llegue la respuesta, mostrar un mensaje comprensible para el usuario; si el usuario modifica el CUIT/CUIL después de una consulta, invalidar el resultado anterior y consultar nuevamente cuando corresponda. No realizar la consulta directamente desde el navegador a la API del BCRA: el front consulta a un endpoint de nuestra API, y nuestra API consulta la API pública del BCRA (Central de Deudores v1.0, endpoint GET api.bcra.gob.ar/CentralDeDeudores/v1.0/Deudas/{identificacion}, documentado en central-deudores-v1.md en la raíz del repo) e interpreta la respuesta (situación 1 a 5 por entidad, montos en miles de pesos, días de atraso, respuestas 400/404/500) para producir el texto que se muestra en pantalla."

**Ampliación (2026-10-26)**: "El ciclo de vida de esta funcionalidad debe ser el siguiente: el usuario ingresa un CUIT en el front; el front le solicita a la API información del cliente con el CUIT ingresado; la API toma el CUIT que envía el front y consulta a la API del BCRA enviando el CUIT sin guiones; la API del BCRA contesta con la información en formato JSON; la API arma una respuesta amigable para el usuario basándose en un prompt que desarrollaremos; la API envía la información al front, en texto entendible para el usuario."

## Clarifications

### Session 2026-10-26

- Q: ¿Cómo se compatibiliza quitar separadores para la consulta con el formato que acepta el alta (solo 11 dígitos o `XX-XXXXXXXX-X`)? → A: El campo acepta los mismos formatos que el alta: 11 dígitos, con o sin guiones (`XX-XXXXXXXX-X`), y el valor se conserva en el formulario tal como se escribió, como en la spec 004. El único separador permitido es el guion en sus posiciones canónicas; espacios, puntos u otros caracteres son un error de formato. Para consultar al BCRA, que exige 11 dígitos sin guiones, se quitan los guiones.
- Q: ¿Cómo se compatibiliza la consulta de datos reales del BCRA con el Principio IX (solo datos ficticios)? → A: Se enmienda la constitución con `/speckit-constitution` para permitir consultar fuentes públicas oficiales con datos reales en tiempo de uso, sin persistirlos ni registrarlos. Las pruebas, los datos de ejemplo y las demostraciones siguen siendo solo ficticios.
- Q: ¿Quién redacta el texto que ve la persona? → A: Nuestro servicio, con un modelo de IA guiado por un prompt propio, a partir de la respuesta del BCRA. El dashboard muestra el texto tal como llega; no interpreta la respuesta del BCRA.
- Q: ¿Qué datos de la respuesta del BCRA se envían al modelo de IA? → A: La respuesta completa del BCRA, incluidos el CUIT y la denominación. Por eso la enmienda del Principio IX también debe cubrir el envío de esos datos reales al proveedor del modelo.
- Q: ¿Qué debe decir el texto? → A: Solo describir en lenguaje claro lo que informa el BCRA (situación, montos, atrasos, marcas), sin recomendar acciones ni opinar sobre si conviene operar con el cliente. La decisión comercial es de la persona.
- Q: ¿Qué se muestra si el BCRA respondió pero el modelo de IA falla o tarda demasiado? → A: Un aviso de error ("No pudimos preparar el resumen de la situación en el BCRA") con la acción "Reintentar", igual que cuando falla el BCRA. No hay texto alternativo armado con una plantilla.

**Depende de**: [003-client-persistence-crud](../003-client-persistence-crud/spec.md) (regla del CUIT/CUIL: formato y dígito verificador) y [004-client-crud-ui](../004-client-crud-ui/spec.md) (pantalla "Nuevo cliente" con el campo "CUIT/CUIL"). Fuentes externas: Central de Deudores del BCRA, método "Deudas", descripta en [central-deudores-v1.md](../../central-deudores-v1.md), y un proveedor de modelo de IA para redactar el texto. Requiere la enmienda del Principio IX de la constitución (Clarifications) antes de implementarse.

**Cambia de la spec 004**: FR-021 de la spec 004 reservaba el dígito verificador al servicio. Esta feature lo comprueba también en el dashboard, solo para decidir si consulta al BCRA (FR-003); guardar el cliente sigue validándose en el servicio sin cambios.

## Ciclo de vida de una consulta

1. La persona escribe un CUIT/CUIL en el campo "CUIT/CUIL" de "Nuevo cliente" y sale del campo.
2. El dashboard lo valida y, si es válido, pide a nuestro servicio la situación crediticia de ese CUIT.
3. Nuestro servicio vuelve a validar el CUIT y consulta al BCRA con los 11 dígitos sin guiones.
4. El BCRA responde con la información en formato JSON (o con "sin datos" o con un error).
5. Nuestro servicio valida la respuesta y, si hay deudas, le pide al modelo de IA un texto amigable, guiado por el prompt de la feature.
6. Nuestro servicio devuelve al dashboard el texto listo para mostrar, y el dashboard lo presenta junto al campo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver la situación crediticia del CUIT al terminar de escribirlo (Priority: P1)

Una persona de Customer Success está dando de alta un cliente en "Nuevo cliente". Escribe el CUIT en el campo "CUIT/CUIL" y pasa al campo siguiente. Debajo del campo aparece un indicador "Consultando situación en el BCRA…" y, unos segundos después, un texto breve en español que explica lo que informa la Central de Deudores: a nombre de quién figura, la peor situación informada, en cuántas entidades tiene deuda, el monto total y si hay atrasos o situaciones especiales. Con eso decide si continúa con el alta.

**Why this priority**: es el valor central de la feature: conocer el riesgo crediticio del cliente en el momento del alta, explicado en lenguaje claro, sin salir del dashboard ni consultar otro sitio.

**Independent Test**: con el BCRA y el modelo de IA simulados, se escribe un CUIT sintético, se sale del campo y se verifica que aparece el indicador de carga, que se hace exactamente una consulta a nuestro servicio (nunca al BCRA desde el navegador), que el servicio consulta al BCRA con los 11 dígitos sin guiones, que le pasa al modelo la respuesta del BCRA junto con el prompt, y que el dashboard muestra el texto que devolvió el modelo.

**Acceptance Scenarios**:

1. **Given** la pantalla "Nuevo cliente", **When** se escribe un CUIT válido (p. ej. `20-90000024-4`) y el campo pierde el foco, **Then** se muestra junto al campo un indicador de carga con el texto "Consultando situación en el BCRA…" y se envía una única consulta a nuestro servicio.
2. **Given** una consulta en curso, **When** el BCRA informa deudas, **Then** el indicador desaparece y se muestra un texto en español que menciona la denominación informada, el período (mes y año), la peor situación con su número y su descripción en lenguaje claro (p. ej. "situación 1, normal"), la cantidad de entidades que informan deuda y el monto total en pesos.
3. **Given** una respuesta donde alguna entidad informa situación 2 o mayor, **When** se muestra el texto, **Then** indica cuál es la peor situación, qué entidad la informa y el máximo de días de atraso cuando es mayor que 0.
4. **Given** una respuesta donde alguna entidad marca refinanciaciones, recategorización obligatoria, situación jurídica, irrecuperable por disposición técnica, información en revisión o en proceso judicial, **When** se muestra el texto, **Then** menciona cada una de esas marcas en lenguaje claro.
5. **Given** cualquier texto con deudas, **When** se lo lee, **Then** solo describe lo que informa el BCRA: no recomienda acciones (p. ej. "conviene pedir garantías") ni opina sobre si operar con el cliente.
6. **Given** el texto con deudas, **When** se muestra, **Then** tiene un tono visual según la peor situación (1 positivo; 2 advertencia; 3 a 5 riesgo) y aclara que la fuente es la Central de Deudores del BCRA.
7. **Given** cualquier resultado de la consulta, **When** se completa el resto del formulario, **Then** calcular el score y guardar en cartera funcionan igual que antes: el resultado del BCRA es informativo, no modifica el score ni bloquea el alta.

---

### User Story 2 - Detectar un CUIT mal escrito sin consultar al BCRA (Priority: P1)

La persona escribe un CUIT con un dígito equivocado, con menos dígitos o con letras. Al salir del campo ve un mensaje claro junto al campo que explica qué está mal, y no se hace ninguna consulta.

**Why this priority**: evita consultas inútiles al BCRA (que limita el tráfico por dirección IP) y al modelo de IA, y da una corrección inmediata antes de llegar a guardar.

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

### User Story 4 - Entender cuando no hay datos o la consulta falla (Priority: P2)

Si el BCRA no tiene información del CUIT, la persona lo ve como un mensaje neutro ("no registra deudas informadas"), no como un error. Si el BCRA no responde o falla, o si no se puede preparar el texto, ve un aviso que lo explica y puede reintentar, sin que eso le impida seguir con el alta.

**Why this priority**: el caso "sin datos" es frecuente (personas o empresas sin financiaciones) y no debe alarmar; las fallas de los servicios externos no deben bloquear el trabajo.

**Independent Test**: con el BCRA y el modelo simulados, se prueban "sin datos", error del BCRA, demora excesiva del BCRA, respuesta mal formada, y falla, demora o texto vacío del modelo; en cada caso se verifica el mensaje, la opción de reintentar cuando corresponde y que calcular y guardar siguen disponibles.

**Acceptance Scenarios**:

1. **Given** un CUIT válido sin información en la Central de Deudores, **When** llega la respuesta, **Then** se muestra un mensaje neutro: "El BCRA no registra deudas informadas para este CUIT/CUIL", sin consultar al modelo de IA.
2. **Given** que el BCRA responde con un error, rechaza la consulta por exceso de tráfico, no responde dentro del tiempo límite o devuelve una respuesta que no se puede interpretar, **When** termina la consulta, **Then** se muestra "No pudimos consultar la situación en el BCRA en este momento" con la acción "Reintentar", y el resto del formulario sigue funcionando.
3. **Given** que el BCRA informó deudas pero el modelo de IA falla, no responde dentro del tiempo límite o devuelve un texto vacío, **When** termina la consulta, **Then** se muestra "No pudimos preparar el resumen de la situación en el BCRA" con la acción "Reintentar", y el resto del formulario sigue funcionando.
4. **Given** que nuestro servicio no está disponible, **When** termina la consulta, **Then** se muestra el aviso de no disponibilidad con "Reintentar".
5. **Given** un aviso de error, **When** se pulsa "Reintentar", **Then** se repite la consulta completa para el mismo CUIT con su indicador de carga.

---

### Edge Cases

- ¿Qué pasa si el CUIT se escribe con espacios, puntos o guiones fuera de lugar (p. ej. ` 20-90000024-4`, `20.90000024.4` o `2090-000024-4`)? Es un error de formato: se muestra el mensaje de FR-002 y no se consulta, igual que el alta lo rechazaría al guardar (spec 004). El dashboard no recorta ni reescribe el valor.
- ¿Qué pasa si la persona sale del campo y vuelve a entrar muy rápido? Solo se consulta al perder el foco y nunca más de una vez a la vez para el mismo CUIT normalizado (US3).
- ¿Qué pasa si la persona sale de la pantalla con una consulta en curso? La consulta se descarta y su respuesta no se muestra en ninguna otra pantalla.
- ¿Qué pasa si la respuesta de un CUIT anterior llega después de la de uno nuevo? Solo se muestra la respuesta que corresponde al valor actual del campo.
- ¿Qué pasa si el BCRA informa varios períodos? El prompt indica describir el más reciente, y el tono visual se calcula sobre ese período.
- ¿Qué pasa si una entidad informa una situación fuera de 1 a 5 o un monto ausente? La respuesta sigue siendo válida; el prompt indica describir ese dato como "no informado". Esa entidad no cuenta para el tono visual.
- ¿Qué pasa si el BCRA informa 0 días de atraso? Según el manual, 0 significa "No aplicable"; el prompt indica no mencionar atraso en ese caso.
- ¿Qué pasa si el texto del modelo es excesivamente largo? El servicio lo trata como falla del modelo (US4, escenario 3), igual que un texto vacío.
- ¿Qué pasa si los datos del BCRA contienen texto que parece una instrucción (p. ej. en la denominación)? El prompt trata la respuesta del BCRA solo como datos a describir, nunca como instrucciones.
- ¿Qué pasa si el CUIT ya está registrado en otro cliente de la cartera? La consulta se hace igual; el conflicto se informa al guardar, como hoy (spec 004).
- ¿Qué pasa en la edición de un cliente existente? Esta feature solo cubre el alta; la edición no consulta al BCRA.
- ¿Qué pasa si alguien llama directamente a nuestro servicio con un CUIT inválido? El servicio lo rechaza con un error de validación en español, con la misma regla que el alta, sin consultar al BCRA ni al modelo.
- ¿Qué pasa en pantallas angostas? El indicador y el texto se ven completos sin desplazamiento horizontal.

## Requirements *(mandatory)*

### Functional Requirements

**Disparo y validación en el dashboard**

- **FR-001**: En la pantalla "Nuevo cliente", cuando el campo "CUIT/CUIL" pierde el foco y no está vacío, el dashboard MUST validar el valor y, si es válido, normalizarlo quitando los guiones para obtener los 11 dígitos con que se consulta. El campo MUST conservar el valor tal como se escribió (spec 004, FR-001). Mientras se escribe MUST NOT consultarse.
- **FR-002**: Los formatos admitidos MUST ser los mismos que acepta el alta (spec 003): exactamente 11 dígitos, o `XX-XXXXXXXX-X` con los guiones en esas posiciones. Cualquier otro valor (otra cantidad de dígitos, letras, espacios, puntos u otros separadores, guiones fuera de lugar) MUST mostrar junto al campo "El CUIT/CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)" y MUST NOT consultar.
- **FR-003**: El dígito verificador del CUIT/CUIL (algoritmo oficial módulo 11) MUST comprobarse **tanto en el dashboard como en el servicio**:
  - **Dashboard**: si el formato es válido, MUST comprobar el dígito verificador antes de consultar; si no es válido, MUST mostrar "El dígito verificador del CUIT/CUIL no es válido" y MUST NOT consultar.
  - **Servicio**: MUST volver a comprobarlo en la consulta (FR-010) y al guardar el alta, sin depender de la comprobación del dashboard (constitución, Principio V).

  En cada lado la regla MUST definirse en un único lugar, y las dos implementaciones MUST verificarse con el mismo archivo de casos de prueba. Esta doble implementación es una excepción deliberada al Principio VI de la constitución ("un único lugar"), justificada en el plan (Complexity Tracking).
- **FR-004**: Un campo vacío al perder el foco MUST NOT mostrar error ni consultar.

**Consulta desde el dashboard**

- **FR-005**: Si el valor es válido, el dashboard MUST pedir la situación crediticia a nuestro servicio enviando el CUIT normalizado (11 dígitos, sin guiones). El navegador MUST NOT comunicarse directamente con el BCRA ni con el proveedor del modelo de IA.
- **FR-006**: Mientras la consulta está en curso, el dashboard MUST mostrar junto al campo un indicador de carga accesible ("Consultando situación en el BCRA…") y MUST NOT enviar otra solicitud para el mismo CUIT normalizado.
- **FR-007**: Si el campo pierde el foco con el mismo CUIT normalizado que ya tiene un resultado visible, MUST NOT repetirse la consulta.
- **FR-008**: Al modificar el contenido del campo, el dashboard MUST quitar de inmediato el resultado anterior y descartar cualquier consulta en curso; una respuesta que no corresponde al valor actual del campo MUST NOT mostrarse.
- **FR-009**: Al guardar el alta con éxito o al salir de la pantalla, el resultado y cualquier consulta en curso MUST descartarse.

**Servicio: consulta al BCRA**

- **FR-010**: Nuestro servicio MUST ofrecer una operación documentada que recibe un CUIT/CUIL, lo valida con la regla única de la spec 003 (rechazando un valor inválido con un error de validación en español, sin consultar al BCRA ni al modelo) y consulta, con los 11 dígitos sin guiones que exige el BCRA, el método "Deudas" de la Central de Deudores.
- **FR-011**: La respuesta del BCRA MUST validarse en el servicio antes de usarla (constitución, Principio V). Una respuesta con deudas cuya estructura no coincide con la documentada MUST tratarse como BCRA no disponible.
- **FR-012**: El servicio MUST devolver al dashboard uno de estos resultados:
  - **con deudas**: el texto redactado por el modelo y el nivel de tono (positivo, advertencia o riesgo, o ninguno según FR-013);
  - **sin datos**: cuando el BCRA indica que no encontró datos para la identificación;
  - **BCRA no disponible**: cuando el BCRA responde con error, rechaza por exceso de tráfico, no responde en 10 segundos o devuelve una respuesta que no se puede validar;
  - **resumen no disponible**: cuando el BCRA informó deudas pero el modelo falla, no responde en 15 segundos o devuelve un texto vacío o de más de 1.200 caracteres.

  En ningún caso el servicio MUST exponer al dashboard mensajes técnicos del BCRA ni del proveedor del modelo.
- **FR-013**: El nivel de tono MUST calcularlo el servicio sin el modelo, a partir de la peor situación entre las entidades del período más reciente: 1 positivo, 2 advertencia, 3 a 5 riesgo. Si ninguna entidad informa una situación de 1 a 5, el resultado sigue siendo **con deudas**, sin nivel de tono, y el dashboard lo muestra neutro.
- **FR-014**: La comunicación con el BCRA y con el proveedor del modelo MUST realizarse a través de interfaces de acceso propias, de modo que las pruebas puedan reemplazarlas por versiones simuladas y que cambiar de proveedor no requiera tocar la UI ni el resto del servicio (constitución, Principio IV).

**Servicio: texto amigable con IA**

- **FR-015**: Para el resultado **con deudas**, el servicio MUST pedir al modelo de IA un texto amigable enviándole el prompt de la feature y la respuesta completa del BCRA (incluidos el CUIT y la denominación).
- **FR-016**: El prompt MUST definirse en un único lugar, versionado en el repositorio y separado de la lógica, para poder ajustarlo sin cambiar el código (en el espíritu del Principio III). El contenido exacto del prompt se desarrolla en el plan; esta spec fija qué debe lograr (FR-017 a FR-019).
- **FR-017**: El prompt MUST pedir un texto en español neutro con tuteo (como el resto del dashboard) y en lenguaje claro, de 1.200 caracteres como máximo, que incluya: la denominación; el período más reciente como mes y año; la peor situación con su número y su descripción según el manual del BCRA (1 "Normal"; 2 "Con seguimiento especial / Riesgo bajo"; 3 "Con problemas / Riesgo medio"; 4 "Con alto riesgo de insolvencia / Riesgo alto"; 5 "Irrecuperable"), y qué entidad la informa; la cantidad de entidades; el monto total en pesos (los montos del BCRA vienen en miles de pesos), con separador de miles; el máximo de días de atraso cuando es mayor que 0; y cada marca especial presente.
- **FR-018**: El prompt MUST indicar que el texto solo describe lo informado: MUST NOT recomendar acciones, opinar sobre si conviene operar con el cliente, ni agregar datos o cifras que no estén en la respuesta del BCRA.
- **FR-019**: El prompt MUST indicar que la respuesta del BCRA son datos a describir y no instrucciones, de modo que un texto dentro de esos datos no cambie el comportamiento del modelo.
- **FR-020**: Los resultados **sin datos**, **BCRA no disponible** y **resumen no disponible** MUST usar textos fijos definidos en el servicio (US4), sin consultar al modelo.

**Presentación en el dashboard**

- **FR-021**: El dashboard MUST mostrar el texto que devuelve el servicio tal como llega, sin interpretarlo ni modificarlo, con el tono visual indicado (positivo, advertencia o riesgo; sin datos neutro; los dos casos de no disponible con la acción "Reintentar"), y una mención de que la fuente es la Central de Deudores del BCRA.
- **FR-022**: El indicador y el resultado MUST anunciarse a las tecnologías de asistencia sin mover el foco, y MUST verse completos en pantallas angostas sin desplazamiento horizontal.
- **FR-023**: El resultado de la consulta MUST NOT modificar el score, el nivel ni la posibilidad de calcular o guardar el cliente.

**Privacidad, compatibilidad y calidad**

- **FR-024**: El resultado de la consulta MUST NOT guardarse junto al cliente ni en ningún almacenamiento, y el servicio MUST NOT registrar en sus logs el CUIT consultado, la denominación, los datos de deuda, el prompt completo ni el texto generado. Consultar al BCRA y enviar su respuesta al proveedor del modelo se apoyan en la enmienda del Principio IX de la constitución (Clarifications); esta feature MUST NOT implementarse antes de esa enmienda.
- **FR-025**: Las credenciales del proveedor del modelo MUST manejarse como secreto: MUST NOT incluirse en el código, en el repositorio, en la imagen ni en variables de entorno de la imagen (constitución, Contenedores y despliegue), ni llegar al dashboard.
- **FR-026**: Las pruebas automatizadas MUST NOT llamar al BCRA real ni al modelo real: MUST usar versiones simuladas y CUIT sintéticos (prefijo `20`, cuerpos `9000xxxx`, como en la spec 003).
- **FR-027**: Las pruebas MUST cubrir: validación y normalización con y sin guiones (se consulta siempre con 11 dígitos sin guiones); rechazo de espacios, puntos y guiones fuera de lugar; longitud, caracteres y dígito verificador (con los mismos casos en el dashboard y en el servicio); consulta al perder el foco; no consulta con valor inválido o vacío; indicador de carga; una sola solicitud por CUIT; invalidación al modificar; descarte de respuestas tardías; que al modelo le llegan el prompt y la respuesta completa del BCRA; el cálculo del tono (incluidos varios períodos y entidades con datos incompletos); sin datos sin consultar al modelo; BCRA no disponible (error, tráfico, demora, respuesta mal formada); resumen no disponible (falla, demora, texto vacío o demasiado largo); que no se registran datos personales en los logs; y el reintento.
- **FR-028**: El prompt MUST contar con un conjunto de respuestas del BCRA de ejemplo, ficticias, que cubran cada situación de 1 a 5, varias entidades, atrasos y cada marca especial, para revisar a mano que los textos cumplen FR-017 a FR-019 cada vez que el prompt cambia.
- **FR-029**: Las pantallas y flujos existentes MUST seguir funcionando igual; las pruebas existentes del dashboard y del servicio MUST seguir pasando sin cambiar sus expectativas.
- **FR-030**: Si la aplicación se ejecuta en contenedores, el acceso de salida del servicio a internet MUST limitarse a lo necesario para consultar al BCRA y al proveedor del modelo, y la excepción a la red interna MUST documentarse según la constitución (Contenedores y despliegue).

### Key Entities *(include if feature involves data)*

- **Consulta crediticia**: el CUIT normalizado que se consulta y su estado en el dashboard (sin consultar, validación fallida, consultando, con resultado). Existe solo mientras la persona está en "Nuevo cliente" y no se guarda.
- **Respuesta del BCRA**: lo que devuelve la Central de Deudores para un CUIT: identificación, denominación y períodos, cada uno con sus entidades (nombre, situación de 1 a 5, monto en miles de pesos, días de atraso y marcas especiales). Se valida y se envía completa al modelo; no se guarda.
- **Prompt de resumen**: las instrucciones versionadas que le indican al modelo cómo describir la respuesta del BCRA (FR-016 a FR-019).
- **Situación crediticia**: lo que nuestro servicio devuelve al dashboard: el tipo de resultado (con deudas, sin datos, BCRA no disponible, resumen no disponible), el texto para mostrar y, si hay deudas, el nivel de tono.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el 95 % de las consultas con el BCRA y el modelo respondiendo con normalidad, la persona ve el texto en menos de 10 segundos desde que sale del campo.
- **SC-002**: El 100 % de los CUIT inválidos probados (longitud, caracteres, dígito verificador) muestra el mensaje de validación y produce cero consultas.
- **SC-003**: Salir del campo varias veces, o con una consulta en curso, con el mismo CUIT produce exactamente una consulta en el 100 % de los casos.
- **SC-004**: En el 100 % de los casos probados, la pantalla nunca muestra la situación de un CUIT distinto del que está escrito en el campo.
- **SC-005**: Ante cualquier falla del BCRA o del modelo, la persona ve un aviso comprensible en menos de 30 segundos y puede completar el alta igual en el 100 % de los casos.
- **SC-006**: En la revisión de FR-028, el 100 % de los textos generados para las respuestas de ejemplo incluye la peor situación, la cantidad de entidades y el monto total correctos, y ninguno contiene recomendaciones ni datos que no estén en la respuesta.
- **SC-007**: Una persona sin conocimientos de la normativa del BCRA entiende, a partir del texto, si el cliente tiene deudas, cuán grave es su peor situación y el monto total, sin consultar otra fuente.
- **SC-008**: Ninguna solicitud del navegador se dirige al BCRA ni al proveedor del modelo, y ningún dato de la consulta queda guardado ni registrado.
- **SC-009**: El 100 % de las pruebas existentes y nuevas pasa sin usar el BCRA ni el modelo reales.

## Assumptions

- La consulta solo se ofrece en el alta ("Nuevo cliente"); la edición de un cliente existente queda fuera de alcance.
- Solo se usa el método "Deudas" (último período informado). Los métodos "Históricas" (24 meses) y "Cheques Rechazados" del manual quedan fuera de alcance.
- El resultado es informativo: no se incorpora al scoring, no cambia los pesos ni los niveles, no bloquea el alta y no se guarda.
- La API pública del BCRA no requiere autenticación y limita el tráfico por dirección IP; no se agrega caché persistente. Evitar consultas repetidas para el mismo CUIT dentro de la pantalla (FR-006, FR-007) alcanza para esta versión.
- Los tiempos límite (10 s para el BCRA, 15 s para el modelo) y el largo máximo del texto (1.200 caracteres) son valores razonables iniciales; se ajustan en el plan si hiciera falta.
- El proveedor y el modelo de IA, la forma de enviarle la respuesta del BCRA y el texto del prompt se eligen y se justifican en el plan (constitución, Principio I y Otras tecnologías). El proveedor debe permitir usar la API sin que los datos enviados se usen para entrenar modelos.
- El modelo de IA puede redactar distinto el mismo caso en dos consultas; lo que se exige es que cumpla FR-017 a FR-019, no un texto idéntico.
- La denominación que informa el BCRA aparece en el texto pero no se copia al campo "Nombre" del formulario.
- La enmienda del Principio IX habilita, en tiempo de uso, consultar fuentes públicas oficiales y enviar su respuesta a un proveedor de modelo de IA para redactar el texto; no habilita guardar datos reales ni usarlos en pruebas, ejemplos o demostraciones.
- Los mensajes de validación del dashboard dicen "CUIT/CUIL", siguiendo el rótulo de la spec 004 (FR-028); los mensajes del servicio para guardar no cambian.
- No hay autenticación ni permisos, como en las specs anteriores.
- Las decisiones técnicas (clientes HTTP, forma exacta de la operación del servicio, componentes de la interfaz, configuración de red y secretos de los contenedores) se definen en el plan, respetando el stack de la constitución.
