# Feature Specification: Persistencia y CRUD de Clientes

**Feature Branch**: `003-client-persistence-crud`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "Persistencia y CRUD de clientes mediante una API con base de datos. Hoy la cartera se lee directamente desde data/clients.json (solo lectura). Se quiere reemplazar esa lectura directa por una API con persistencia, manteniendo sin cambios la lógica de scoring y el frontend actual. Alcance: CRUD de clientes, carga inicial idempotente de los 20 clientes ficticios actuales, endpoints de cartera y score que leen de los datos persistidos, y pruebas automatizadas."

**Depende de**: [001-customer-health-scoring](../001-customer-health-scoring/spec.md) (motor de scoring y su interfaz de servicio) y [002-health-score-dashboard](../002-health-score-dashboard/spec.md) (interfaz que consume la cartera).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - La cartera sale de datos persistidos y mantiene su comportamiento (Priority: P1)

Una persona de Customer Success abre el dashboard y ve la misma cartera de 20 clientes ficticios, con los mismos scores y niveles de siempre. La diferencia es que los clientes ya no se leen de un archivo fijo: viven en un almacenamiento persistente que sobrevive a los reinicios del servicio. Al levantar el servicio por primera vez con el almacenamiento vacío, la cartera actual se carga sola.

**Why this priority**: es la base de toda la feature. Sin cartera persistida y sin carga inicial, no hay nada que administrar, y garantiza que el reemplazo no rompe el dashboard ni el scoring existentes.

**Independent Test**: con el almacenamiento vacío, se inicia el servicio y se consulta la cartera; el resultado (clientes, scores, niveles, resumen) es idéntico al que se obtenía leyendo el archivo de datos actual. Se reinicia el servicio y la cartera sigue igual.

**Acceptance Scenarios**:

1. **Given** un almacenamiento vacío, **When** se inicia el servicio por primera vez, **Then** la cartera contiene exactamente los 20 clientes ficticios del archivo de datos actual, con las mismas métricas.
2. **Given** la cartera cargada, **When** se consulta la cartera y el score de cualquier cliente, **Then** el resultado es idéntico (valores, campos y estructura) al que devolvía el servicio con el archivo de datos.
3. **Given** una cartera con cambios hechos después de la carga inicial, **When** se reinicia el servicio, **Then** los cambios siguen presentes y la carga inicial no los pisa ni duplica clientes.
4. **Given** el almacenamiento ya cargado, **When** se ejecuta la carga inicial otra vez, **Then** no se crean duplicados y no se modifican los clientes existentes.
5. **Given** el dashboard de la spec 002 sin modificaciones, **When** se usa contra el servicio con persistencia, **Then** todas sus pantallas funcionan igual que antes.

---

### User Story 2 - Crear y consultar clientes (Priority: P1)

Una persona de Customer Success da de alta un cliente nuevo indicando su CUIL (CUIT/CUIL), su nombre y las cuatro métricas. El CUIL permite distinguir de forma unívoca a cada cliente: no puede haber dos clientes con el mismo CUIL. El identificador debe ser generado por la aplicacion automaticamente en el momento que se crea el recurso. Puede listar todos los clientes y consultar uno por su identificador; en ambos casos se devuelve también su CUIL. El cliente creado aparece de inmediato en la cartera con su score y nivel calculados.

**Why this priority**: es el primer paso de gestión real de datos y lo que hace útil la persistencia; habilita además el botón "Guardar en cartera" que la spec 002 dejó como "próximamente".

**Independent Test**: se crea un cliente con métricas válidas, se verifica que se puede consultar por su identificador, que figura en el listado y que aparece en la cartera con el score que corresponde a sus métricas.

**Acceptance Scenarios**:

1. **Given** un identificador que no existe, un CUIL válido no registrado y métricas válidas, **When** se crea el cliente, **Then** el servicio confirma la creación y devuelve el cliente con los datos guardados, incluido su CUIL e identificador.
2. **Given** un cliente creado, **When** se consulta la cartera, **Then** el cliente aparece con el mismo score y nivel que daría evaluar sus métricas con el motor de scoring.
3. **Given** clientes existentes, **When** se pide el listado, **Then** se devuelven todos los clientes con su identificador, CUIL, nombre y métricas.
4. **Given** un identificador existente, **When** se consulta ese cliente, **Then** se devuelven su identificador, CUIL, nombre y métricas.
5. **Given** un identificador que no existe, **When** se consulta ese cliente, **Then** el servicio responde que no se encontró, con un mensaje en español que incluye el identificador.
6. **Given** cuando la aplicacion genera un identificador que ya existe, **When** se intenta crear otro cliente con ese identificador, **Then** el servicio rechaza la operación indicando el conflicto (409) y no modifica el cliente existente.
7. **Given** un CUIL ya registrado en otro cliente, **When** se intenta crear un cliente con ese CUIL, **Then** el servicio rechaza la operación indicando el conflicto (409), con un mensaje en español que aclara que el CUIL ya está registrado, y no guarda nada.
8. **Given** una solicitud de alta sin CUIL, **When** se envía, **Then** se rechaza con un error de validación (422) que indica el campo.

---

### User Story 3 - Validación estricta de los datos de entrada (Priority: P1)

Cuando se crea o modifica un cliente, el servicio rechaza cualquier dato que incumpla las reglas de negocio, con mensajes claros en español que indican qué campo falla y por qué. Nunca se guarda un cliente con datos inválidos.

**Why this priority**: las reglas de las métricas son la base de la confianza en el scoring; guardar datos fuera de rango contaminaría la cartera de forma persistente.

**Independent Test**: se envían clientes con cada tipo de dato inválido (fuera de rango, decimal, texto, faltante, campo extra, identificador vacío) y se verifica que todos se rechazan con un mensaje por campo y que la cartera queda intacta.

**Acceptance Scenarios**:

1. **Given** una solicitud con uso 101 o −1, NPS 11 o −1, tickets −1 o días −1, **When** se envía, **Then** se rechaza con un error que indica el campo y su rango válido, y no se guarda nada.
2. **Given** una solicitud con los valores límite válidos (uso 0 y 100, NPS 0 y 10, tickets 0, días 0), **When** se envía, **Then** se acepta.
3. **Given** una solicitud con un valor decimal, de texto, booleano o nulo en una métrica, **When** se envía, **Then** se rechaza indicando el campo.
4. **Given** una solicitud a la que le falta una métrica, o que trae un campo no permitido, o con identificador vacío, **When** se envía, **Then** se rechaza indicando el campo.
5. **Given** una solicitud con varios campos inválidos, **When** se envía, **Then** el error informa todos los campos inválidos, no solo el primero.
6. **Given** una solicitud con un CUIL de formato válido y dígito verificador correcto (por ejemplo `20900000015`), **When** se envía, **Then** se acepta y se guarda como texto de 11 dígitos sin guiones.
7. **Given** una solicitud con un CUIL con guiones en las posiciones canónicas (por ejemplo `20-90000001-5`) y dígito verificador correcto, **When** se envía, **Then** se acepta y se guarda normalizado a 11 dígitos sin guiones.
8. **Given** una solicitud con un CUIL de formato incorrecto (menos o más de 11 dígitos, letras, espacios, símbolos, guiones en posiciones no canónicas, número en lugar de texto, nulo o vacío), **When** se envía, **Then** se rechaza con un error de validación (422) en español que indica el campo CUIL y la regla incumplida.
9. **Given** una solicitud con un CUIL de 11 dígitos cuyo dígito verificador no es el que corresponde (por ejemplo `20900000016`), **When** se envía, **Then** se rechaza con un error de validación (422) que indica que el dígito verificador es inválido, y no se guarda nada.
10. **Given** un CUIL inválido y a la vez una métrica fuera de rango, **When** se envía, **Then** el error informa ambos campos.

---

### User Story 4 - Actualizar clientes existentes (Priority: P2)

Una persona de Customer Success corrige o actualiza los datos de un cliente (CUIL, nombre y métricas) cuando cambian, por ejemplo tras una nueva encuesta NPS o para corregir un CUIL mal cargado. La cartera refleja el cambio de inmediato con el score y nivel recalculados. El identificador del cliente no cambia.

**Why this priority**: mantener los datos al día es necesario para que el score sea útil, pero se puede demostrar una vez que existen la creación y la consulta.

**Independent Test**: se modifica un cliente existente y se verifica que su consulta, la cartera y su score reflejan los nuevos valores; se intenta modificar uno inexistente o con datos inválidos y se verifica el rechazo sin cambios.

**Acceptance Scenarios**:

1. **Given** un cliente existente, **When** se actualizan su CUIL, su nombre y sus métricas con valores válidos, **Then** el servicio devuelve el cliente actualizado y la cartera y el score reflejan los nuevos valores.
2. **Given** un cliente existente, **When** se actualiza con datos inválidos, **Then** se rechaza con errores por campo y el cliente conserva sus datos anteriores.
3. **Given** un identificador inexistente, **When** se intenta actualizar, **Then** el servicio responde que no se encontró, sin crear el cliente.
4. **Given** una solicitud de actualización que intenta cambiar el identificador, **When** se envía, **Then** se rechaza o se ignora el cambio de identificador de forma explícita y documentada; el identificador original no cambia.
5. **Given** un cliente existente, **When** se actualiza con su propio CUIL sin cambios, **Then** se acepta (no es un conflicto consigo mismo).
6. **Given** un cliente existente, **When** se actualiza con el CUIL de otro cliente, **Then** el servicio rechaza la operación con conflicto (409) y el cliente conserva sus datos anteriores.
7. **Given** un cliente existente, **When** se actualiza con un CUIL de formato incorrecto o con dígito verificador inválido, **Then** se rechaza con error de validación (422) y el cliente conserva sus datos anteriores.

---

### User Story 5 - Eliminar clientes (Priority: P2)

Una persona de Customer Success elimina un cliente que ya no corresponde a la cartera (por ejemplo, un cliente dado de baja). Desaparece del listado, de la cartera y de las consultas de score.

**Why this priority**: completa el ciclo de gestión; es menos frecuente que crear o actualizar.

**Independent Test**: se elimina un cliente existente y se verifica que ya no figura en el listado, en la cartera ni en su consulta; se intenta eliminar uno inexistente y se verifica el error.

**Acceptance Scenarios**:

1. **Given** un cliente existente, **When** se elimina, **Then** el servicio confirma la eliminación y el cliente deja de aparecer en el listado, la cartera y su consulta de score.
2. **Given** un identificador inexistente, **When** se intenta eliminar, **Then** el servicio responde que no se encontró.
3. **Given** un cliente eliminado, **When** se crea otro con el mismo identificador o con el mismo CUIL, **Then** se acepta como un cliente nuevo (el CUIL queda libre).
4. **Given** una cartera tras eliminar un cliente, **When** se consulta el resumen, **Then** el total y los conteos por nivel se actualizan y la suma de los conteos sigue siendo igual al total.

---

### Edge Cases

- ¿Qué pasa si el almacenamiento está vacío porque se eliminaron todos los clientes (no porque sea la primera vez)? La carga inicial no debe volver a ejecutarse y repoblar la cartera: la cartera queda vacía y el dashboard muestra su estado vacío.
- ¿Qué pasa si el archivo de datos inicial no existe o es inválido al iniciar con almacenamiento vacío? El servicio informa el problema de forma explícita y no arranca con datos parciales.
- ¿Qué pasa si el archivo de datos inicial contiene un identificador que ya existe en el almacenamiento? La carga inicial lo omite sin modificar el cliente existente.
- ¿Qué pasa si el archivo de datos inicial contiene registros inválidos? Se rechazan según las mismas reglas de validación y se informa cuáles fueron omitidos; no se guardan datos inválidos.
- ¿Qué pasa con dos solicitudes simultáneas que crean el mismo identificador? Solo una tiene éxito y la otra recibe el error de conflicto; nunca quedan dos clientes con el mismo identificador.
- ¿Qué pasa si el CUIL trae espacios al inicio o al final, o guiones en posiciones no canónicas (p. ej. `2-09000001-55`)? Se rechaza (422); no se recortan espacios. Solo se admiten 11 dígitos, o 11 dígitos con guiones exactamente en las posiciones 2 y 10 (`XX-XXXXXXXX-X`).
- ¿Qué pasa con un CUIL que empieza con cero? Se trata como texto: se conservan los ceros y se valida igual que cualquier otro; por eso nunca se almacena ni se transmite como número.
- ¿Qué pasa si el resto del cálculo del dígito verificador es 1 (combinación para la que no existe dígito válido)? Ningún CUIL con ese cuerpo es válido; cualquier valor se rechaza con el mismo error de dígito verificador inválido.
- ¿Qué pasa si el mismo CUIL llega en dos formas (`20900000015` y `20-90000001-5`)? Es el mismo CUIL: tras normalizar, el segundo se rechaza como duplicado (409).
- ¿Qué pasa con dos solicitudes simultáneas que usan el mismo CUIL? Solo una tiene éxito y la otra recibe el conflicto (409); la unicidad se garantiza en el propio almacenamiento, no solo con una verificación previa.
- ¿Qué pasa si un cuerpo trae a la vez un identificador duplicado y un CUIL duplicado? Se informa el conflicto (409) sin guardar nada.
- ¿Qué pasa si un CUIL con formato o dígito incorrectos coincide además con uno existente? Primero rige la validación: se responde 422, no 409.
- ¿Qué pasa si el identificador de la ruta tiene espacios, mayúsculas o caracteres especiales? Se tratan como un identificador literal: distingue mayúsculas de minúsculas y se compara exactamente.
- ¿Qué pasa si el almacenamiento no está disponible o está dañado? El servicio informa un error de servicio explícito y no devuelve datos inventados ni parciales.
- ¿Qué pasa con un cuerpo de solicitud que no es JSON válido? Se rechaza con un error de validación en el mismo formato que el resto de la API.

## Requirements *(mandatory)*

### Functional Requirements

**Persistencia y carga inicial**

- **FR-001**: El sistema MUST guardar los clientes de la cartera en un almacenamiento persistente que sobreviva al reinicio del servicio.
- **FR-002**: El sistema MUST reemplazar la lectura directa del archivo de datos como fuente de la cartera: los endpoints de cartera y de score MUST leer los clientes del almacenamiento persistente.
- **FR-003**: El sistema MUST ofrecer una carga inicial que incorpore al almacenamiento los 20 clientes ficticios del archivo de datos actual, con sus mismos identificadores, nombres y métricas, y con el CUIL ficticio asignado a cada uno (FR-033).
- **FR-004**: La carga inicial MUST ser idempotente: ejecutarla varias veces nunca crea duplicados ni modifica clientes ya existentes.
- **FR-005**: La carga inicial MUST ejecutarse automáticamente al iniciar el servicio solo cuando el almacenamiento nunca fue inicializado, y MUST NOT repoblar una cartera que quedó vacía por eliminaciones posteriores.
- **FR-006**: La carga inicial MUST aplicar las mismas reglas de validación que el alta de clientes y MUST informar los registros omitidos y el motivo.

**CRUD de clientes**

- **FR-007**: Los usuarios MUST poder crear un cliente indicando identificador, CUIL (obligatorio), nombre opcional y las cuatro métricas.
- **FR-008**: Los usuarios MUST poder listar todos los clientes con su identificador, CUIL, nombre y métricas.
- **FR-009**: Los usuarios MUST poder consultar un cliente por su identificador; la respuesta incluye su CUIL.
- **FR-010**: Los usuarios MUST poder actualizar el CUIL, el nombre y las métricas de un cliente existente; el identificador MUST NOT cambiar. El CUIL nuevo se valida y se verifica su unicidad con las mismas reglas que en el alta.
- **FR-011**: Los usuarios MUST poder eliminar un cliente existente.
- **FR-012**: El identificador de cliente MUST ser único, no vacío y comparado de forma exacta.
- **FR-013**: Cada operación de escritura MUST ser atómica: si falla, el almacenamiento queda como estaba antes de la solicitud.

**Validación y errores**

- **FR-014**: Toda entrada externa MUST validarse en el límite del servicio con las reglas de negocio de la constitución: uso 0–100, tickets ≥ 0, NPS 0–10, días hasta la renovación ≥ 0, todos enteros, ambos extremos inclusivos.
- **FR-015**: Los rangos de las métricas MUST seguir definidos en un único lugar del sistema; las nuevas operaciones MUST reutilizarlos y no redefinirlos.
- **FR-016**: Se MUST rechazar valores fuera de rango, decimales, no numéricos, booleanos, nulos, métricas faltantes, campos no permitidos e identificadores vacíos, sin guardar nada.
- **FR-017**: Los errores de validación MUST usar el mismo formato que el resto de la API, con mensajes en español, indicando el campo y la regla incumplida, e informando todos los campos inválidos de la solicitud.
- **FR-018**: El servicio MUST distinguir y documentar tres condiciones de error: datos inválidos (validación, 422), cliente inexistente (no encontrado, 404) e identificador o CUIL ya existente (conflicto, 409), cada una con mensaje en español.

**CUIL (identificación única del cliente)**

- **FR-027**: Cada cliente MUST tener un CUIL (CUIT/CUIL) que lo distinga de forma unívoca, obligatorio al crear y editable al actualizar. Convive con el identificador de cliente, que sigue siendo la clave de las rutas existentes.
- **FR-028**: El CUIL MUST estar formado por exactamente 11 dígitos numéricos y MUST almacenarse y devolverse como texto, nunca como número, para preservar ceros iniciales y formato.
- **FR-029**: El servicio MUST aceptar el CUIL sin guiones (p. ej. `20900000015`) y también con guiones en las posiciones canónicas (`20-90000001-5`), y MUST normalizarlo a 11 dígitos sin guiones antes de validarlo, compararlo y guardarlo. La forma con guiones es solo de presentación; las respuestas de la API devuelven la forma sin guiones. Cualquier otro carácter, espacio o longitud se rechaza.
- **FR-030**: El servicio MUST validar el dígito verificador del CUIL con el algoritmo oficial de CUIT/CUIL (módulo 11 con los factores 5, 4, 3, 2, 7, 6, 5, 4, 3, 2 sobre los primeros 10 dígitos; resto 0 → dígito 0, resto 1 → no existe dígito válido y se rechaza, otro resto → 11 − resto). Esta regla MUST definirse en un único lugar del sistema (Principio VI) y reutilizarse en el alta, la actualización y la carga inicial.
- **FR-031**: El CUIL MUST ser único en el almacenamiento, garantizado por una restricción de unicidad del propio almacenamiento y no solo por una verificación previa, de modo que dos solicitudes simultáneas nunca dejen dos clientes con el mismo CUIL.
- **FR-032**: Un CUIL con formato incorrecto o dígito verificador inválido MUST responder 422 (validación), con mensaje en español que distinga formato de dígito verificador. Un CUIL ya registrado en otro cliente MUST responder 409 (conflicto) sin modificar nada. Si coinciden ambas condiciones, rige primero la validación (422). Actualizar un cliente con su propio CUIL no es conflicto.
- **FR-033**: Los 20 clientes ficticios existentes (sin CUIL real) MUST migrarse a la nueva estructura con un CUIL ficticio asignado de forma determinista: prefijo `20`, cuerpo `90000001`, `90000002`, … en el orden del archivo de datos, omitiendo los cuerpos para los que no existe dígito verificador válido (resto 1), y el dígito verificador calculado con el algoritmo de FR-030. El CUIL asignado a cada cliente MUST quedar escrito en el archivo de datos inicial, de modo que la carga inicial sea repetible y produzca siempre los mismos valores (por ejemplo `20900000015`, `20900000023`, `20900000031`, `20900000058`, …). Los cuerpos que empiezan con `9` se eligen porque quedan por encima de los números de documento reales en uso, y así se evita coincidir con personas o empresas reales.
- **FR-034**: Las operaciones de lectura (listado y consulta por identificador) MUST incluir el CUIL de cada cliente. Los endpoints existentes de score y cartera mantienen su contrato; incorporar el CUIL a sus respuestas es opcional y, de hacerse, solo de forma aditiva (FR-020).

**Compatibilidad**

- **FR-019**: El scoring (cálculo de score, niveles, sub-scores y configuración) MUST permanecer sin cambios: para las mismas métricas y configuración, los resultados son idénticos a los de las specs 001 y 002.
- **FR-020**: Los endpoints existentes MUST conservar su contrato (rutas, campos, formatos y códigos de respuesta): la actualización es aditiva y no rompe a ningún consumidor actual.
- **FR-021**: El frontend de la spec 002 MUST funcionar sin modificaciones obligatorias contra el servicio con persistencia.
- **FR-022**: Un cliente creado, modificado o eliminado MUST reflejarse de inmediato en la cartera, en el resumen por nivel y en el score de ese cliente, sin reiniciar el servicio.
- **FR-023**: El acceso a datos MUST seguir realizándose a través de la interfaz de acceso existente (adapter), incorporando la nueva fuente persistente como una nueva implementación, sin modificar la lógica de scoring.

**Documentación y calidad**

- **FR-024**: Todos los endpoints nuevos MUST quedar documentados automáticamente en la especificación OpenAPI, con sus esquemas de entrada y salida y los códigos de respuesta, incluidos 404, 409 y 422.
- **FR-025**: La funcionalidad MUST incluir pruebas automatizadas que cubran: el ciclo completo de crear, listar, consultar, actualizar y eliminar; valores límite e inválidos de cada métrica; el CUIL (valores válidos con y sin guiones, formato incorrecto, dígito verificador inválido, duplicados en alta y en actualización, y migración de los datos existentes); carga inicial idempotente; persistencia entre reinicios del servicio; y compatibilidad de contrato con los endpoints existentes.
- **FR-026**: Todos los datos MUST ser ficticios; no se incorpora información real de clientes en el código, los datos de ejemplo, las pruebas ni el repositorio. Esto incluye los CUIL: solo se usan CUIL sintéticos generados según FR-033, nunca números de CUIT/CUIL reales.

### Key Entities *(include if feature involves data)*

- **Cliente**: empresa de la cartera. Tiene un identificador único e inmutable, un CUIL único (texto de 11 dígitos, editable, ficticio), un nombre ficticio opcional y las cuatro métricas (uso, tickets de soporte, NPS, días hasta la renovación). Es el único dato que se persiste; los resultados de scoring se calculan al consultar y no se almacenan.
- **Cartera**: conjunto de todos los clientes persistidos. Su evaluación (resultados por cliente y resumen por nivel) se calcula con el motor de scoring en cada consulta.
- **Carga inicial**: operación que incorpora a la cartera los clientes ficticios del archivo de datos actual. No es un cliente; es un proceso que debe ser repetible sin efectos secundarios.
- **Error de operación**: respuesta con el motivo del rechazo, de tres tipos: validación (campos y reglas, incluidos formato y dígito verificador del CUIL), no encontrado e identificador o CUIL en conflicto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con la cartera recién cargada, el 100 % de los 20 clientes devuelve score, nivel y sub-scores idénticos a los obtenidos antes de la feature.
- **SC-002**: Un cliente creado, modificado o eliminado se refleja en la cartera en la siguiente consulta, en el 100 % de los casos y sin reiniciar el servicio.
- **SC-003**: Tras reiniciar el servicio, el 100 % de los clientes y de los cambios hechos permanece, y la cantidad de clientes no varía por la carga inicial.
- **SC-004**: Ejecutar la carga inicial 5 veces seguidas deja la cartera exactamente igual que ejecutarla una vez (cero duplicados, cero modificaciones).
- **SC-005**: El 100 % de las entradas inválidas probadas (cada métrica en su límite inferior −1 y superior +1, decimales, textos, faltantes, campos extra) se rechaza y deja la cartera intacta.
- **SC-006**: El dashboard de la spec 002 completa sus flujos principales (ver cartera, ver detalle, calcular nuevo cliente, ver configuración) sin ningún cambio en su código.
- **SC-007**: Una persona completa el ciclo crear → consultar → actualizar → eliminar un cliente en menos de 2 minutos usando solo la documentación interactiva de la API.
- **SC-008**: Con una cartera de 1000 clientes, la consulta de la cartera completa responde en menos de 2 segundos.
- **SC-009**: La suite de pruebas automatizadas pasa completa, incluidas las pruebas de las specs 001 y 002, sin modificar sus expectativas de contrato.
- **SC-010**: El 100 % de los 20 clientes cargados inicialmente tiene un CUIL distinto, de 11 dígitos y con dígito verificador válido, y ejecutar la carga inicial varias veces conserva siempre los mismos valores.
- **SC-011**: El 100 % de los CUIL inválidos probados (longitud distinta de 11, caracteres no numéricos, guiones mal ubicados, dígito verificador alterado en cada posible valor distinto del correcto, nulo, vacío) se rechaza con 422, y el 100 % de los duplicados (alta y actualización, con y sin guiones) se rechaza con 409, sin modificar la cartera.

## Assumptions

- Los consumidores del servicio son el dashboard de la spec 002 y quienes usen la API directamente; no hay autenticación ni permisos por usuario, igual que en las specs anteriores.
- El archivo de datos actual (20 clientes ficticios, todos válidos y con identificadores únicos) se conserva en el repositorio como fuente de la carga inicial y como referencia de los datos de ejemplo.
- El CUIL es obligatorio y editable; el identificador de cliente (p. ej. `C-001`) se mantiene como clave de las rutas y es inmutable, por lo que los endpoints y el frontend existentes no cambian. No se incorpora DNI.
- El sistema valida formato y dígito verificador, pero no consulta si el CUIL existe en un registro oficial ni impone reglas de prefijo (tipo de persona); eso queda fuera de alcance.
- Aún no existe un almacenamiento previo con clientes sin CUIL (la base se crea con esta feature); la "migración" consiste en asignar CUIL ficticios a los 20 clientes del archivo de datos y cargarlos. Una migración de esquema sobre una base ya existente queda fuera de alcance.
- El CUIL se devuelve siempre normalizado a 11 dígitos; mostrarlo con guiones (`20-90000001-5`) es responsabilidad de quien lo presente, p. ej. el frontend en una mejora posterior.
- La actualización de un cliente reemplaza su CUIL, nombre y métricas completos; el identificador es inmutable. Si en el plan se decide admitir actualización parcial, no cambia las reglas de validación.
- Como el CRUD solo guarda datos válidos, la cartera persistida normalmente no contendrá registros inválidos; el contrato de la cartera sigue admitiendo el campo de errores por compatibilidad con las specs 001 y 002.
- La eliminación es definitiva (no hay papelera ni historial); el seguimiento histórico sigue fuera de alcance, como en la spec 001.
- El nombre del cliente es opcional, de texto libre y ficticio; el identificador es un texto no vacío definido por quien crea el cliente.
- Los resultados de scoring no se persisten: se calculan al consultar con la configuración activa en ese momento.
- Cambiar el frontend para ofrecer crear, editar o eliminar clientes (incluido habilitar "Guardar en cartera") queda fuera de alcance de esta feature; es una mejora posterior que consumirá esta API.
- Migraciones de esquema avanzadas, múltiples bases de datos, paginación, ordenamiento y filtros del listado quedan fuera de alcance de esta versión.
- La edición de pesos, umbrales y la configuración del scoring siguen fuera de alcance y se gestionan como en la spec 001.
- Las decisiones tecnológicas (FastAPI, SQLite, SQLAlchemy) se justifican en el plan de implementación según el Principio I de la constitución, no en esta especificación.
