# Feature Specification: Motor de Scoring de Salud de Clientes

**Feature Branch**: `001-customer-health-scoring`

**Created**: 2026-10-10

**Status**: Draft

**Input**: User description: "Motor de scoring para una cartera de clientes. Recibe uso (%), tickets de soporte (30 días), NPS (0-10) y días hasta renovación. Devuelve un score de 0 a 100 y un nivel (Top, Estable, En riesgo). Pesos y umbrales configurables. Debe poder usarse desde cualquier interfaz."

**Actualizado por**: [003-client-persistence-crud](../003-client-persistence-crud/spec.md) (2026-10-19): cada cliente persistido tiene un CUIL (CUIT/CUIL) único; los resultados de clientes persistidos lo incluyen de forma aditiva. El CUIL no es una entrada del motor y no modifica el cálculo (FR-018 a FR-020).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Calcular el score y nivel de un cliente (Priority: P1)

Una persona del equipo de Customer Success ingresa las cuatro métricas de un cliente (uso del producto, tickets de soporte de los últimos 30 días, NPS y días hasta la renovación) y obtiene un score de salud de 0 a 100 junto con su nivel: Top, Estable o En riesgo.

**Why this priority**: es el núcleo del producto. Sin un cálculo confiable del score para un cliente no existe ninguna otra funcionalidad.

**Independent Test**: se prueba entregando un conjunto de métricas válidas de un cliente ficticio y verificando que el score y el nivel devueltos coincidan con los valores esperados según la configuración vigente.

**Acceptance Scenarios**:

1. **Given** la configuración por defecto, **When** se evalúa un cliente con uso 90 %, 0 tickets, NPS 9 y 300 días hasta renovación, **Then** el resultado es un score alto (≥ umbral de Top) y nivel "Top".
2. **Given** la configuración por defecto, **When** se evalúa un cliente con uso 10 %, 15 tickets, NPS 2 y 10 días hasta renovación, **Then** el resultado es un score bajo (< umbral de En riesgo) y nivel "En riesgo".
3. **Given** cualquier configuración válida, **When** se evalúa dos veces el mismo cliente con las mismas métricas, **Then** se obtiene exactamente el mismo score y nivel.
4. **Given** un cliente con una métrica fuera de rango (p. ej., uso 120 % o NPS 11), **When** se solicita su evaluación, **Then** el sistema la rechaza indicando qué métrica es inválida y por qué, sin devolver un score.

---

### User Story 2 - Ajustar pesos y umbrales sin tocar la lógica (Priority: P2)

Una persona responsable del modelo de salud modifica la importancia relativa de cada métrica (pesos) y los puntos de corte entre niveles (umbrales) para adaptar el scoring a la estrategia del negocio, y los nuevos resultados reflejan esos cambios sin modificar la lógica del motor.

**Why this priority**: los criterios de salud cambian con el negocio; poder ajustarlos sin desarrollo es lo que hace útil al motor a lo largo del tiempo.

**Independent Test**: se evalúa un mismo cliente con dos configuraciones distintas y se verifica que el score y/o nivel cambian según lo esperado, y que una configuración inválida se rechaza con un error explícito.

**Acceptance Scenarios**:

1. **Given** una configuración donde el peso del NPS se duplica respecto del resto, **When** se evalúa un cliente con NPS alto y demás métricas bajas, **Then** su score es mayor que con la configuración por defecto.
2. **Given** una configuración con el umbral de Top bajado de 75 a 70, **When** se evalúa un cliente con score 72, **Then** su nivel pasa de "Estable" a "Top".
3. **Given** una configuración cuyos pesos son negativos, cuyos pesos suman cero, o cuyo umbral de En riesgo es mayor o igual al de Top, **When** se carga la configuración, **Then** el sistema la rechaza con un mensaje que identifica el problema y no calcula scores con ella.

---

### User Story 3 - Evaluar una cartera completa (Priority: P3)

Una persona de Customer Success solicita la evaluación de toda la cartera de clientes y obtiene, para cada cliente, su score y nivel, más un resumen de cuántos clientes hay en cada nivel.

**Why this priority**: agrega valor operativo (priorizar a quién contactar) sobre el cálculo individual, pero depende de que la User Story 1 exista.

**Independent Test**: se evalúa una cartera ficticia de clientes con métricas conocidas y se verifica que cada cliente reciba el score y nivel correctos y que el resumen por nivel sume el total de clientes evaluados.

**Acceptance Scenarios**:

1. **Given** una cartera de 20 clientes ficticios con métricas válidas, **When** se evalúa la cartera, **Then** se devuelven 20 resultados y el conteo por nivel (Top + Estable + En riesgo) suma 20.
2. **Given** una cartera donde 1 de 20 clientes tiene una métrica inválida, **When** se evalúa la cartera, **Then** los 19 clientes válidos reciben su resultado y el cliente inválido aparece con su error, sin interrumpir la evaluación del resto.
3. **Given** una cartera vacía, **When** se evalúa, **Then** se devuelve un resultado vacío con conteos en cero, sin error.

---

### User Story 4 - Uso desde distintas interfaces (Priority: P3)

Cualquier interfaz (una pantalla web, un servicio consumido por otro sistema, un script o una planilla) puede solicitar evaluaciones al motor y obtiene exactamente los mismos resultados, porque el motor es independiente de quién lo invoca.

**Why this priority**: es un requisito explícito del negocio y condiciona el diseño, pero su valor se materializa a través de las historias anteriores.

**Independent Test**: se evalúa el mismo cliente directamente contra el motor y a través de la interfaz de servicio publicada, y se verifica que ambos resultados sean idénticos.

**Acceptance Scenarios**:

1. **Given** un mismo cliente y la misma configuración, **When** se lo evalúa invocando el motor directamente y a través de la interfaz de servicio, **Then** el score y el nivel son idénticos.
2. **Given** la interfaz de servicio publicada, **When** una persona desarrolladora consulta su documentación, **Then** encuentra descritas las entradas, salidas y respuestas de error sin necesidad de leer el código.

---

### Edge Cases

- Valores en los límites exactos de cada métrica (uso 0 % y 100 %; 0 tickets; NPS 0 y 10; 0 días hasta renovación): deben aceptarse y producir un score dentro de 0–100.
- Cantidad de tickets superior al tope de normalización configurado: el aporte de esa métrica es el mínimo posible, sin producir scores negativos.
- Días hasta renovación superiores al horizonte configurado: el aporte de esa métrica es el máximo posible, sin superar 100.
- Días hasta renovación negativos (renovación vencida): se rechazan como entrada inválida.
- Valores decimales donde se esperan enteros (tickets, NPS, días), valores no numéricos o métricas faltantes: se rechazan indicando la métrica afectada.
- Score que cae exactamente en un umbral: se asigna al nivel superior (p. ej., score igual al umbral de Top → "Top").
- Configuración ausente o ilegible: el motor no calcula y devuelve un error explícito; no usa valores implícitos.
- Un peso configurado en cero: válido; esa métrica simplemente no influye en el score.
- Evaluación de métricas sueltas (sin cliente persistido): el resultado no tiene CUIL (campo nulo o ausente); el score y el nivel no cambian por ello.
- Dos clientes persistidos con las mismas métricas y distinto CUIL: obtienen exactamente el mismo score, nivel y sub-scores.

## Requirements *(mandatory)*

### Functional Requirements

**Entradas y validación**

- **FR-001**: El sistema MUST aceptar, por cliente, cuatro métricas: uso del producto (porcentaje 0–100), cantidad de tickets de soporte en los últimos 30 días (entero ≥ 0), NPS (entero 0–10) y días hasta la renovación (entero ≥ 0).
- **FR-002**: El sistema MUST rechazar cualquier métrica faltante, no numérica, fuera de rango o con decimales donde se espera un entero, devolviendo un error que identifique la métrica y el motivo.
- **FR-003**: Los rangos válidos de cada métrica (uso 0–100, tickets ≥ 0, NPS 0–10, días hasta renovación ≥ 0, todos enteros) MUST definirse en un único lugar del sistema y aplicarse igual desde cualquier interfaz, según el Principio VI de la constitución v2.0.0.

**Cálculo**

- **FR-004**: El sistema MUST convertir cada métrica a un sub-score normalizado de 0 a 100, donde 100 representa la situación más saludable: más uso es mejor, menos tickets es mejor, mayor NPS es mejor y más días hasta la renovación es mejor.
- **FR-005**: La normalización de tickets MUST usar un tope configurable (cantidad de tickets a partir de la cual el sub-score es 0) y la de días hasta renovación un horizonte configurable (cantidad de días a partir de la cual el sub-score es 100).
- **FR-006**: El score final MUST ser el promedio ponderado de los sub-scores según los pesos configurados, redondeado a un número entero entre 0 y 100.
- **FR-007**: El sistema MUST asignar el nivel según umbrales configurables: "Top" si el score es mayor o igual al umbral de Top; "En riesgo" si es menor al umbral de En riesgo; "Estable" en cualquier otro caso.
- **FR-008**: El cálculo MUST ser determinista: las mismas métricas y la misma configuración producen siempre el mismo resultado, sin depender de la fecha, el orden de evaluación ni de otros clientes.
- **FR-009**: El resultado de cada evaluación MUST incluir el score, el nivel y el sub-score de cada métrica, para que el resultado sea explicable.

**Configuración**

- **FR-010**: Los pesos, umbrales, tope de tickets y horizonte de renovación MUST definirse en una configuración externa, editable sin modificar la lógica del motor.
- **FR-011**: El sistema MUST validar la configuración al cargarla y rechazarla con un error explícito si: falta algún valor, algún peso es negativo, todos los pesos son cero, algún umbral está fuera de 0–100, el umbral de En riesgo es mayor o igual al de Top, o el tope de tickets / horizonte de renovación no es positivo.
- **FR-012**: El sistema MUST proveer una configuración por defecto con pesos iguales (25 % por métrica), umbral de Top = 75, umbral de En riesgo = 50, tope de tickets = 10 y horizonte de renovación = 180 días.

**Cartera e interfaces**

- **FR-013**: El sistema MUST permitir evaluar una cartera de clientes en una sola solicitud, devolviendo un resultado por cliente (identificado por su identificador y, si es un cliente persistido, acompañado de su CUIL según FR-019) y un conteo de clientes por nivel.
- **FR-014**: En la evaluación de una cartera, un cliente con datos inválidos MUST NOT impedir la evaluación de los demás; su resultado MUST indicar el error correspondiente.
- **FR-015**: El motor MUST ser utilizable de forma independiente de cualquier interfaz de usuario, almacenamiento o fuente de datos, de modo que cualquier interfaz obtenga resultados idénticos para las mismas entradas.
- **FR-016**: El sistema MUST exponer el motor a través de una interfaz de servicio documentada (entradas, salidas y errores) para que otros sistemas puedan consumirlo.
- **FR-017**: Todos los datos de ejemplo, de prueba y de demostración MUST ser ficticios, incluidos los CUIL, que son sintéticos y se generan con la regla determinista de la spec 003 (FR-033 de 003).

**CUIL (incorporado por la spec 003)**

- **FR-018**: El CUIL MUST NOT ser una entrada del motor de scoring: el score, el nivel y los sub-scores dependen solo de las cuatro métricas y de la configuración (FR-008). La lógica de scoring y la configuración no cambian.
- **FR-019**: Los resultados de evaluación de clientes persistidos (cartera almacenada y score de un cliente por identificador) MUST incluir el campo `cuil` (texto de 11 dígitos, sin guiones), de forma aditiva: los campos existentes no cambian y los consumidores que lo ignoran siguen funcionando. En los resultados que no corresponden a un cliente persistido (evaluación de métricas sueltas o de una cartera enviada en la solicitud) el campo está ausente: esas respuestas conservan exactamente su forma anterior.
- **FR-020**: Las solicitudes de evaluación de métricas sueltas y de una cartera enviada en la solicitud MUST conservar su contrato de entrada actual: no piden ni aceptan CUIL. El formato, el dígito verificador y la unicidad del CUIL se validan solo en el CRUD de clientes de la spec 003, en un único lugar del sistema (Principio VI).

### Key Entities

- **Cliente**: cliente de la cartera a evaluar. Atributos: identificador, CUIL (CUIT/CUIL; texto de 11 dígitos, único y ficticio, definido en la spec 003; solo en clientes persistidos), nombre (ficticio) y sus métricas de salud. El CUIL identifica al cliente pero no interviene en el cálculo.
- **Métricas de salud**: las cuatro mediciones de un cliente en un momento dado: uso (%), tickets de soporte (30 días), NPS y días hasta renovación.
- **Configuración de scoring**: pesos por métrica, umbrales de nivel (Top y En riesgo), tope de tickets y horizonte de renovación.
- **Resultado de evaluación**: score (0–100), nivel (Top / Estable / En riesgo) y sub-score por métrica de un cliente; o bien el error de validación correspondiente. Si el cliente está persistido, incluye además su CUIL (FR-019).
- **Resumen de cartera**: conjunto de resultados de evaluación más la cantidad de clientes por nivel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de los casos de prueba de referencia (normales, en los límites e inválidos) produce el score, nivel o error esperado.
- **SC-002**: Una persona de Customer Success obtiene el score y nivel de un cliente en menos de 1 segundo desde que envía las métricas.
- **SC-003**: Una cartera de 1.000 clientes se evalúa completa en menos de 5 segundos.
- **SC-004**: Un cambio de pesos o umbrales se aplica en menos de 5 minutos, sin intervención de desarrollo y sin modificar la lógica del motor.
- **SC-005**: El mismo cliente evaluado desde dos interfaces distintas obtiene resultados idénticos en el 100 % de los casos.
- **SC-006**: El 100 % de las configuraciones inválidas se rechaza con un mensaje que permite identificar el valor a corregir.
- **SC-007**: Para las mismas métricas y configuración, el score, el nivel y los sub-scores son idénticos con o sin CUIL en el 100 % de los casos, y el 100 % de los resultados de clientes persistidos incluye su CUIL.

## Assumptions

- Los usuarios son equipos internos (Customer Success, responsables del modelo de salud); no se requiere autenticación ni gestión de permisos en esta versión.
- La dirección de cada métrica es: más uso, menos tickets, mayor NPS y más días hasta la renovación indican un cliente más saludable. Una renovación cercana se considera un factor de riesgo.
- La normalización de cada métrica a 0–100 es lineal entre sus extremos (uso 0–100 %, NPS 0–10, tickets 0–tope, días 0–horizonte).
- El uso se recibe como porcentaje entero de 0 a 100.
- Una renovación vencida (días negativos) queda fuera del alcance de esta versión y se rechaza como entrada inválida.
- El motor no persiste resultados ni historial; cada evaluación es independiente. El seguimiento histórico queda fuera de alcance.
- Los datos de clientes provienen de una fuente local con datos ficticios; integraciones con fuentes externas quedan para funcionalidades futuras. Desde la spec 003, esa fuente es un almacenamiento persistente con CRUD, y cada cliente tiene un CUIL ficticio único.
- El motor no valida ni consulta el CUIL; su formato, dígito verificador y unicidad son responsabilidad del CRUD de clientes (spec 003).
- Solo existe una configuración activa a la vez; no se contemplan configuraciones distintas por segmento de cliente.
