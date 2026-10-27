# Implementation Plan: CRUD de Clientes desde el Dashboard

**Branch**: `004-client-crud-ui` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-client-crud-ui/spec.md`

## Summary

Completar en el dashboard el CRUD de clientes que la spec 003 dejó solo en la API: guardar en
la cartera desde "Nuevo cliente" (con un campo nuevo "CUIT/CUIL"), editar y eliminar desde el
detalle con confirmación, mostrar los errores del servicio junto a cada campo, refrescar la
cartera tras cada operación y unificar el rótulo "CUIT/CUIL" en todo el dashboard. Solo
cambia `frontend/`; el servicio y el scoring quedan intactos.

Enfoque técnico (detalle en [research.md](research.md)):

- `api/client.ts` suma `createClient`, `updateClient` y `deleteClient`, y su parser de 422
  reconoce las ubicaciones de `/clients` (`["body","metrics",m]`, `["body","cuil"]`). Un 409
  se convierte en error del campo CUIT/CUIL (R2).
- Los campos del formulario se extraen a un componente compartido, `ClientFields`, que usan
  el alta y la edición (R6). El campo CUIT/CUIL es texto puro.
- "Guardar en cartera" envía exactamente los valores con que se calculó el resultado
  (snapshot `calculatedFrom`, R5).
- `App` sigue teniendo una única carga de la cartera; las pantallas reciben
  `onClientsChanged = portfolio.reload` (R7). Las confirmaciones son un aviso en línea con el
  `Alert` existente (R8).
- Diálogos de eliminación y de cambios sin guardar con `AlertDialog` de shadcn sobre
  `radix-ui`, que ya es dependencia (R9). `useHashRoute` acepta un `blocker` para no perder
  cambios al navegar (R10).
- El dashboard solo bloquea antes de enviar lo evidente (CUIT/CUIL vacío, métricas no
  numéricas); el formato y el dígito verificador los valida solo el servicio (R3).

## Technical Context

**Language/Version**: TypeScript ~5.7, React 19 (frontend existente). Python sin cambios.

**Primary Dependencies**: Vite, Tailwind CSS 4, shadcn/ui (new-york) sobre `radix-ui`, lucide-react (existentes). **Sin dependencias nuevas**: se agrega el componente `alert-dialog` de shadcn, que usa `radix-ui` ya instalado.

**Storage**: N/A en el frontend (el estado vive en memoria; la persistencia es la API de la spec 003)

**Testing**: Vitest + Testing Library + user-event, con `stubFetch` (existentes); pytest sin cambios

**Target Platform**: navegador moderno, escritorio y móvil (≥ 375 px); local con Vite o en contenedores (nginx de la spec 003)

**Project Type**: web app (`frontend/`) que consume el web-service existente

**Performance Goals**: alta completa en < 1 min para la persona (SC-001); la cartera se refresca con una sola consulta tras cada operación

**Constraints**: sin cambios en la API ni en el scoring (FR-023); sin cálculo de scores/niveles/conteos en el frontend (FR-020, Principio II); pruebas existentes sin cambiar expectativas salvo las dos de FR-024; solo CUIL sintéticos

**Scale/Scope**: ~4 componentes nuevos, ~8 modificados; cartera de 20 a 1000 clientes

### Justificación de dependencias nuevas (Principio I)

Ninguna. `alert-dialog.tsx` es código de shadcn/ui copiado al repositorio (como los demás
componentes de `components/ui/`) y usa `AlertDialog` del paquete `radix-ui`, ya presente. Se
descartaron `sonner` (toasts) y React Query/SWR (caché) por no aportar lo suficiente frente a
un aviso en línea y a `portfolio.reload()` (research R7, R8).

## Constitution Check

*GATE: debe pasar antes de Phase 0. Re-evaluado tras el diseño de Phase 1.*

| # | Principio | Cumple | Cómo |
|---|-----------|--------|------|
| I | Simplicidad | Sí | Sin dependencias nuevas; sin estado global ni biblioteca de ruteo; se reutilizan `useApi`, `Alert`, `Sheet`, `StatePanel` |
| II | Separación | Sí | El frontend no calcula scores, niveles ni conteos: tras cada operación vuelve a pedir la cartera y el score al servicio |
| III | Config externa | Sí | No toca pesos ni umbrales; los rangos de ayuda siguen llegando de `GET /metrics` |
| IV | Adapter | Sí | Sin cambios en el acceso a datos del servicio |
| V | Validación en el límite | Sí | El servidor valida todo; el dashboard solo bloquea vacíos y no numéricos como mejora de uso (permitido: "MAY") |
| VI | Reglas únicas | Sí | Dígito verificador y rangos solo en el servicio; rótulo `CUIL_LABEL` y formateo `formatCuil` solo en `lib/display.ts`; campos del formulario solo en `ClientFields` |
| VII | Pruebas | Sí | Pruebas de frontend por historia (FR-025); pytest sigue en verde sin cambios. No hay cambios de scoring que exijan pruebas de pytest nuevas |
| VIII | API documentada | Sí (N/A) | No hay endpoints nuevos ni modificados |
| IX | Privacidad | Sí | CUIL sintéticos `20` + `9000xxxx` + dígito calculado en pruebas y quickstart |
| X | Incremental | Sí | US1+US2 (alta con errores) → US3 (edición) → US4 (baja) → US5 (acceso), cada una demostrable ([quickstart](quickstart.md)) |
| — | Frontend: shadcn/ui + Tailwind | Sí | Diálogos con `AlertDialog` de shadcn; estilos con utilidades de Tailwind; sin hojas de estilo nuevas |
| — | Contenedores (v2.2.0) | Sí (N/A) | No cambian `Dockerfile`, `compose.yaml` ni `nginx.conf`: `/api/clients` ya pasa por el proxy `/api/` |

Sin violaciones; no se requiere Complexity Tracking.

**Re-evaluación tras Phase 1**: el diseño mantiene los principios. Única expectativa previa
que cambia, ya prevista en la spec (FR-024): la cabecera `CUIL` → `CUIT/CUIL` en
`PortfolioPage.test.tsx` y el alcance de la aserción "sin CUIL" en `NewClientPage.test.tsx`
(del documento entero al panel de resultado).

## Project Structure

### Documentation (this feature)

```text
specs/004-client-crud-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ui-client-crud.md
├── checklists/requirements.md
└── tasks.md             # lo genera /speckit-tasks
```

### Source Code (repository root)

```text
frontend/src/
├── api/
│   ├── types.ts                 # + ClientData, ClientRecord
│   ├── client.ts                # + createClient, updateClient, deleteClient; 422 de /clients; 409 → cuil
│   └── client.test.ts           # + ubicaciones de 422, 409, 204
├── components/
│   ├── ClientFields.tsx         # NUEVO: campos CUIT/CUIL, nombre y métricas + blankMetricErrors (alta y edición)
│   ├── Notice.tsx               # NUEVO: aviso de confirmación (Alert, role=status, cerrar, acción)
│   ├── Notice.test.tsx          # NUEVO
│   ├── StatePanel.tsx           # + action?: ReactNode
│   └── ui/alert-dialog.tsx      # NUEVO: componente shadcn/ui
├── lib/
│   ├── display.ts               # + CUIL_LABEL
│   ├── display.test.ts          # + CUIL_LABEL
│   ├── useHashRoute.ts          # + blocker opcional, pendingRoute, allowNext para cambios sin guardar
│   └── useHashRoute.test.ts     # + navegación bloqueada
├── App.tsx                      # notice, onClientsChanged, onDeleted, diálogo de descartar
├── App.test.tsx                 # NUEVO: aviso del alta, recarga de la cartera, respuesta tardía
├── pages/new-client/
│   ├── ScoreForm.tsx            # usa ClientFields
│   ├── NewClientPage.tsx        # snapshot calculatedFrom, guardar, errores, limpiar
│   ├── ScoreResultPanel.tsx     # botón Guardar habilitable + motivo
│   └── NewClientPage.test.tsx   # + alta, errores, doble envío; aserción "sin CUIL" acotada
├── pages/client-detail/
│   ├── ClientDetailSheet.tsx    # modos view/edit, Editar/Eliminar, 404, dirty
│   ├── ClientEditForm.tsx       # NUEVO: ClientFields + Guardar cambios/Cancelar
│   ├── DeleteClientDialog.tsx   # NUEVO: AlertDialog de eliminación
│   └── ClientDetailSheet.test.tsx  # + edición, eliminación, 404, descartar
├── pages/portfolio/
│   ├── PortfolioPage.tsx        # enlace Nuevo cliente; estado vacío con acción
│   ├── ClientsTable.tsx         # cabecera y title con CUIL_LABEL
│   └── PortfolioPage.test.tsx   # cabecera CUIT/CUIL; + acceso Nuevo cliente; refresco
├── pages/categories/
│   ├── ClientCard.tsx           # aria-label CUIT/CUIL
│   └── CategoriesPage.test.tsx  # + nombre accesible
└── test/fixtures.ts             # stubFetch acepta 204; ClientRecord de ejemplo
```

**Structure Decision**: se mantiene `frontend/` con su organización por páginas. Los
componentes que comparten alta y edición (`ClientFields`) o que usa `App` (`Notice`) van a
`components/`; los del detalle quedan en `pages/client-detail/`. El backend (`src/`,
`tests/`) no se modifica.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
