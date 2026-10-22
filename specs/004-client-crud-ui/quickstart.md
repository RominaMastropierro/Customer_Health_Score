# Quickstart: CRUD de Clientes desde el Dashboard

Guía para validar la feature de punta a punta. Contrato de pantallas y textos:
[contracts/ui-client-crud.md](contracts/ui-client-crud.md).

## Requisitos

- Backend de la spec 003 instalado (`pip install -e ".[dev]"`) y dependencias del frontend
  (`npm ci` en `frontend/`).
- Base nueva para empezar con los 20 clientes de la carga inicial: borrar
  `data/health_score.db` si existe.

## Levantar

```bash
uvicorn health_score.api.app:app_from_env --factory --reload   # terminal 1, raíz del repo
npm run dev                                                    # terminal 2, en frontend/
```

Abrir la URL que imprime Vite. Alternativa con contenedores: `docker compose up -d --build` y
abrir `http://127.0.0.1:8080`.

## Pruebas automatizadas

```bash
cd frontend && npm test && npm run build    # pruebas y tipos del dashboard
pytest                                      # el servicio no cambia; debe seguir en verde
```

## Validación manual

CUIT/CUIL sintéticos usados: libre `20-90000024-4`; duplicado `20-90000001-5` (C-001);
dígito inválido `20900000016`.

1. **Rótulos (FR-028)**: en la cartera la columna dice `CUIT/CUIL`; el `title` del buscador
   menciona `CUIT/CUIL`.
2. **Alta (US1)**: Cartera → `Nuevo cliente`. El primer campo es `CUIT/CUIL`. Completar
   métricas sin CUIT y `Calcular score` → resultado visible, `Guardar en cartera` deshabilitado
   con `Falta el CUIT/CUIL`. Escribir `20-90000024-4` → sigue deshabilitado con
   `Vuelve a calcular para guardar`. Calcular otra vez → habilitado. Guardar → aviso
   `Cliente guardado: … · 20-90000024-4`, formulario vacío. `Ver en la cartera` abre el detalle
   con un identificador UUID. La cartera muestra 21 clientes y los conteos actualizados.
3. **Errores del alta (US2)**: repetir con `20-90000001-5` → error junto a CUIT/CUIL (ya
   registrado). Con `20900000016` → error de dígito verificador. Con el servicio detenido →
   aviso general; los datos escritos siguen en el formulario.
4. **Edición (US3)**: abrir el detalle del cliente creado → `Editar`. `Guardar cambios`
   deshabilitado. Cambiar NPS a 2 → guardar → aviso `Cambios guardados`, score y nivel
   recalculados en el detalle, la tabla y Por categoría. Editar de nuevo con el CUIT de C-001 →
   error 409 junto al campo. Cambiar el nombre y cerrar el panel → diálogo
   `¿Descartar cambios?`.
5. **Eliminación (US4)**: en el detalle → `Eliminar` → diálogo con nombre y CUIT/CUIL.
   Cancelar con Escape → nada cambia. Confirmar → panel cerrado, aviso `Cliente eliminado`,
   la cartera vuelve a 20 clientes.
6. **Teclado y pantalla angosta (SC-008)**: repetir 2, 4 y 5 solo con teclado y con el
   navegador a 375 px de ancho, sin desplazamiento horizontal.
7. **Cartera vacía (US5)**: con una base de prueba, eliminar todos los clientes → el estado
   vacío ofrece `Nuevo cliente`.
