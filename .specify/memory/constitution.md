<!--
Sync Impact Report
- Cambio de versión: 2.2.0 → 2.3.0 (MINOR: ampliación sustancial de la guía del Principio IX
  con una excepción acotada; la regla de datos ficticios se mantiene para código, tests,
  fixtures, ejemplos, demos e historial)
- Principios modificados: IX. Privacidad de los Datos (NO NEGOCIABLE), mismo título; se
  agrega la excepción "consulta en tiempo de uso" de fuentes públicas oficiales y su envío a
  un proveedor de modelo de IA que no entrene con esos datos, sin guardar ni registrar nada.
- Secciones añadidas: ninguna
- Secciones eliminadas: ninguna
- Motivo: specs/005-bcra-credit-check (consulta a la Central de Deudores del BCRA en el alta
  de clientes, con un texto redactado por un modelo de IA).
- Artefactos dependientes: el plan de specs/005-bcra-credit-check debe justificar el
  proveedor del modelo y verificar las condiciones de la excepción en su Constitution Check.
  Plantillas (.specify/templates/*) revisadas: no requieren cambios, porque leen la
  constitución al ejecutarse.
- TODOs diferidos: ninguno
-->

# Customer Health Score Constitution

## Core Principles

### I. Simplicidad y Mantenibilidad

- El código MUST priorizar la legibilidad, con nombres explícitos y un stack mínimo.
- En el backend MUST utilizarse la biblioteca estándar de Python siempre que sea suficiente.
- En el frontend MUST priorizarse el stack aprobado en *Restricciones Técnicas* (componentes
  de shadcn/ui, utilidades de Tailwind CSS y Recharts) antes de incorporar otra biblioteca.
- Toda dependencia nueva MUST justificarse por escrito en el plan de implementación
  (`plan.md`), indicando qué problema resuelve y por qué la biblioteca estándar no basta.
- Los comentarios MUST explicar el *porqué* de una decisión; no se permiten comentarios que
  repitan lo que el código ya expresa.

**Justificación**: un stack pequeño y un código legible reducen el costo de mantenimiento y
facilitan que cualquier persona entienda y modifique el sistema.

### II. Separación de Responsabilidades

- La lógica de scoring MUST implementarse como funciones puras: la misma entrada produce
  siempre la misma salida y no hay efectos secundarios.
- El módulo de scoring MUST NOT depender de la UI, del DOM, del almacenamiento, de la red ni
  de servicios externos, ni importarlos.
- La UI y la capa de API MUST consumir el scoring únicamente a través de su interfaz pública.

**Justificación**: una lógica pura y aislada se puede probar sin infraestructura y reutilizar
desde cualquier interfaz.

### III. Configuración Externa del Scoring

- Los pesos y umbrales del scoring MUST definirse en un archivo JSON de configuración.
- Está prohibido hardcodear pesos, umbrales o puntos de corte en la lógica de negocio.
- La configuración MUST validarse al cargarse; una configuración inválida MUST producir un
  error explícito y no un comportamiento silencioso por defecto.

**Justificación**: los criterios de salud de un cliente cambian con el negocio; ajustarlos no
debe requerir cambios de código.

### IV. Acceso a Datos Desacoplado

- Todo acceso a datos MUST realizarse a través de una interfaz de acceso (*adapter*).
- La implementación inicial MUST utilizar datos locales.
- Agregar una nueva fuente de datos (p. ej., Google Sheets o una API externa) MUST requerir
  solo una nueva implementación del adapter, sin modificar la UI ni la lógica de scoring.

**Justificación**: desacoplar la fuente de datos permite empezar de forma simple y crecer hacia
integraciones reales sin reescribir el sistema.

### V. Validación de Entradas en el Límite

- Toda entrada externa (requests HTTP, archivos, respuestas de adapters, configuración) MUST
  validarse con modelos Pydantic en el límite de la aplicación.
- La validación del lado del cliente MAY existir como mejora de experiencia de uso, pero el
  servidor MUST NOT depender de ella.
- Los datos que ya superaron la validación del límite se consideran confiables dentro del
  núcleo; la lógica de scoring no repite esas validaciones.

**Justificación**: validar una única vez y en el borde mantiene el núcleo simple y protege al
sistema frente a datos malformados.

### VI. Reglas de Negocio Explícitas

- Cada métrica de entrada del scoring MUST ser un número entero dentro de su rango natural,
  ambos extremos inclusive:
  - uso del producto: 0 a 100 (porcentaje);
  - tickets de soporte en los últimos 30 días: 0 o más;
  - NPS: 0 a 10;
  - días hasta la renovación: 0 o más.
- Valores fuera de rango, decimales, no numéricos o faltantes MUST rechazarse.
- Los rangos de cada métrica MUST definirse en un único lugar del sistema; ningún otro
  componente puede redefinirlos.
- Toda regla de negocio MUST estar definida en un único lugar, aplicarse de forma consistente
  en todo el sistema y ser verificable mediante tests automatizados.

**Justificación**: reglas explícitas y centralizadas hacen que el resultado del scoring sea
predecible y auditable.

### VII. Calidad y Cobertura de Pruebas

- MUST utilizarse pytest para probar las reglas de negocio, las validaciones, las agregaciones
  y la lógica de scoring.
- Todo cambio en el scoring MUST incluir tests unitarios que cubran casos normales, valores
  límite en los extremos del rango de cada métrica (p. ej., 0 y 100 para uso; 0 y 10 para
  NPS; 0 para tickets y días) y valores inválidos (p. ej., −1, 101 para uso, 11 para NPS,
  decimales, tipos incorrectos, métricas faltantes).
- La suite de tests MUST pasar completa antes de integrar cualquier cambio.

**Justificación**: el scoring es el núcleo del producto; un error en él invalida todas las
decisiones que se toman a partir del resultado.

### VIII. API Documentada

- Todos los endpoints de FastAPI MUST quedar documentados automáticamente en OpenAPI.
- Cada endpoint MUST declarar sus esquemas de entrada y salida mediante modelos Pydantic y los
  códigos de respuesta pertinentes, incluidos los de error (p. ej., 404 y 422).

**Justificación**: una API autodocumentada se puede consumir y probar sin leer el código
fuente.

### IX. Privacidad de los Datos (NO NEGOCIABLE)

- Solo MUST utilizarse datos ficticios, salvo la excepción de consulta en tiempo de uso
  descripta abajo.
- Está prohibido incorporar información real de clientes en el código, los datos de ejemplo,
  los tests, los fixtures, las demostraciones o el historial del repositorio.
- **Excepción: consulta en tiempo de uso.** El sistema MAY consultar, a pedido de la persona
  usuaria, fuentes públicas oficiales que devuelven datos reales (p. ej. la Central de
  Deudores del BCRA) y MAY enviar esa respuesta a un proveedor de modelo de IA para redactar
  un texto para esa persona, con estas condiciones:
  - el proveedor del modelo MUST NOT usar los datos enviados para entrenar modelos, y su
    elección MUST justificarse en el plan de la funcionalidad;
  - los datos reales MUST solo mostrarse: MUST NOT guardarse en ningún almacenamiento ni
    registrarse en logs (tampoco la identificación consultada, el prompt ni el texto
    generado);
  - las pruebas, los datos de ejemplo, los fixtures y las demostraciones MUST seguir siendo
    exclusivamente ficticios y MUST usar versiones simuladas de esas fuentes y del modelo.

**Justificación**: elimina el riesgo de exponer información sensible de clientes reales. La
excepción permite el valor de consultar fuentes oficiales al momento del alta sin que ningún
dato real quede en el sistema ni en el repositorio.

### X. Desarrollo Incremental y Demostrable

- Cada funcionalidad MUST ser pequeña, independiente y demostrable por sí misma.
- Cada funcionalidad MUST definir criterios de aceptación verificables antes de implementarse.
- Una funcionalidad no se considera terminada hasta poder demostrarse de punta a punta.

**Justificación**: los incrementos pequeños reducen el riesgo, aceleran la retroalimentación y
permiten mostrar valor en cada iteración.

## Restricciones Técnicas

### Backend

- **Lenguaje**: Python.
- **API**: FastAPI, con documentación OpenAPI automática (Principio VIII).
- **Validación**: Pydantic en todos los límites de la aplicación (Principio V).
- **Pruebas**: pytest (Principio VII).
- **Configuración del scoring**: archivo JSON versionado en el repositorio (Principio III).
- **Datos**: fuente local detrás de un adapter, con datos exclusivamente ficticios
  (Principios IV y IX).

### Frontend

- **Build y servidor de desarrollo**: Vite.
- **Framework de UI**: React.
- **Estilos**: Tailwind CSS. Los estilos MUST expresarse con utilidades de Tailwind; no se
  permiten hojas de estilo ad hoc salvo justificación en el plan.
- **Componentes**: shadcn/ui. Los componentes de interfaz (botones, tablas, diálogos,
  formularios, etc.) MUST tomarse de shadcn/ui antes de crear componentes propios.
- **Gráficos**: Recharts para toda visualización de datos.
- El frontend MUST consumir datos y resultados del scoring exclusivamente a través de la API
  (Principio II); MUST NOT reimplementar ni duplicar lógica de scoring.

### Contenedores y despliegue

- La ejecución en contenedores MUST seguir el OWASP Docker Security Cheat Sheet. Como
  mínimo:
  - imágenes base fijadas por tag **y** digest, nunca `latest`, y renovadas periódicamente;
  - builds multi-stage: compiladores y herramientas de build MUST NOT llegar a la imagen
    final;
  - usuario no-root con UID/GID numérico fijo, igual en el Dockerfile y en compose;
  - `cap_drop: [ALL]` (solo se agregan capabilities demostradamente necesarias) y
    `no-new-privileges:true`;
  - sistema de archivos raíz de solo lectura, con `tmpfs` para temporales; solo los
    volúmenes de datos (p. ej. la base SQLite) son escribibles y el resto se monta `:ro`;
  - límites de memoria, CPU, procesos y archivos abiertos, y reinicio acotado;
  - redes dedicadas, con las de backend marcadas como internas y solo los puertos
    imprescindibles publicados;
  - secretos mediante Docker secrets o montajes secretos de BuildKit; MUST NOT incluirse en
    `ENV`, `ARG` ni en la imagen;
  - logs a stdout/stderr con rotación.
- Está prohibido montar `/var/run/docker.sock`, usar `privileged: true`,
  `network_mode: host` o perfiles seccomp/AppArmor `unconfined`.
- Toda excepción a estas reglas MUST documentarse junto al control afectado y en el plan,
  con su justificación.

**Justificación**: un contenedor endurecido por defecto limita el impacto de una
vulnerabilidad en la aplicación o en sus dependencias.

### Otras tecnologías

- Cualquier tecnología adicional (otras bibliotecas de UI o de gráficos, bases de datos,
  clientes de servicios externos) MUST justificarse en el plan de implementación según el
  Principio I.

## Flujo de Desarrollo y Puertas de Calidad

- Cada funcionalidad sigue el flujo de Spec Kit: especificación (`spec.md`) → plan
  (`plan.md`) → tareas (`tasks.md`) → implementación.
- La sección *Constitution Check* de cada plan MUST verificar el cumplimiento de los diez
  principios y documentar cualquier excepción con su justificación.
- Antes de integrar un cambio MUST cumplirse:
  - la suite completa de pytest pasa;
  - los cambios en el scoring incluyen tests normales, límite e inválidos;
  - no hay pesos ni umbrales hardcodeados fuera del JSON de configuración;
  - los endpoints nuevos o modificados aparecen correctamente en OpenAPI;
  - no se introdujeron datos reales de clientes;
  - toda dependencia nueva está justificada en el plan;
  - los cambios en `Dockerfile` o `compose.yaml` se revisaron contra el checklist OWASP y
    `hadolint` no reporta errores.
- Antes de publicar una imagen MUST escanearse (Trivy o Grype) y no presentar
  vulnerabilidades HIGH o CRITICAL sin una justificación documentada.

## Governance

- Esta constitución prevalece sobre cualquier otra práctica o convención del proyecto. Ante un
  conflicto, rige la constitución.
- **Enmiendas**: toda modificación MUST realizarse mediante `/speckit-constitution`,
  documentar el motivo del cambio y actualizar la versión y la fecha de última enmienda.
- **Versionado** (versionado semántico):
  - MAJOR: eliminación o redefinición incompatible de un principio o de una regla de
    gobernanza.
  - MINOR: incorporación de un principio o sección, o ampliación sustancial de la guía
    existente.
  - PATCH: aclaraciones, cambios de redacción o correcciones sin efecto semántico.
- **Cumplimiento**: cada plan y cada revisión de cambios MUST verificar el cumplimiento de esta
  constitución. Toda complejidad adicional MUST justificarse explícitamente.

**Version**: 2.3.0 | **Ratified**: 2026-10-10 | **Last Amended**: 2026-10-26
