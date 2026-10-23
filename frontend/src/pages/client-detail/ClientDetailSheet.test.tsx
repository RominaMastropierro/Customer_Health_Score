import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "@/App"
import { type FetchCall, metricsFixture, pending, portfolioFixture, stubFetch } from "@/test/fixtures"
import { renderWithProviders } from "@/test/render"

const [top, , , , invalid] = portfolioFixture.results

function stub() {
  return stubFetch({
    "GET /api/portfolio": { status: 200, body: portfolioFixture },
    "GET /api/clients/C-001/score": { status: 200, body: top },
    "GET /api/clients/C-005/score": { status: 200, body: invalid },
  })
}

describe("Detalle de cliente (US3)", () => {
  it("muestra score, nivel, señales y desglose de la API", async () => {
    stub()
    window.location.hash = "#/cartera/C-001"
    renderWithProviders(<App />)
    const dialog = await screen.findByRole("dialog")
    expect(await screen.findByRole("img", { name: "Score 95 de 100" })).toBeInTheDocument()
    expect(dialog).toHaveTextContent("Señales de salud")
    expect(dialog).toHaveTextContent("9/10")
    expect(dialog).toHaveTextContent("300 días")
    expect(dialog).toHaveTextContent("Desglose del score")
  })

  it("muestra los errores y las métricas originales de un inválido", async () => {
    stub()
    window.location.hash = "#/cartera/C-005"
    renderWithProviders(<App />)
    const dialog = await screen.findByRole("dialog")
    expect(await screen.findByText("Errores del registro")).toBeInTheDocument()
    expect(dialog).toHaveTextContent("metrics.usage")
    expect(dialog).toHaveTextContent("120%")
    expect(screen.queryByRole("img", { name: /^Score/ })).not.toBeInTheDocument()
  })

  it("muestra Cliente no encontrado ante un 404", async () => {
    stub()
    window.location.hash = "#/cartera/NO-EXISTE"
    const { user } = renderWithProviders(<App />)
    expect(await screen.findByText("Cliente no encontrado")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Volver a la cartera" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(window.location.hash).toBe("#/cartera")
  })

  it("Escape cierra el panel y conserva la búsqueda", async () => {
    stub()
    window.location.hash = "#/cartera"
    const { user } = renderWithProviders(<App />)
    await screen.findByRole("heading", { name: "Cartera de clientes" })
    await user.type(screen.getByPlaceholderText("Buscar cliente"), "acme")
    await user.click(screen.getByText("Acme Ficticia"))
    await screen.findByRole("dialog")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByPlaceholderText("Buscar cliente")).toHaveValue("acme")
  })
})

describe("CUIL en el detalle (US6, spec 003)", () => {
  it("muestra el CUIL con guiones junto al identificador", async () => {
    stub()
    window.location.hash = "#/cartera/C-001"
    renderWithProviders(<App />)
    const heading = await screen.findByRole("heading", { name: "Acme Ficticia" })
    const header = heading.parentElement!
    expect(header).toHaveTextContent("C-001")
    expect(header).toHaveTextContent("20-90000001-5")
  })

  it("muestra un marcador si la respuesta no trae CUIL", async () => {
    stub()
    window.location.hash = "#/cartera/C-005"
    renderWithProviders(<App />)
    const dialog = await screen.findByRole("dialog")
    expect(await screen.findByText("Errores del registro")).toBeInTheDocument()
    expect(within(dialog).getByRole("heading", { name: "C-005" }).parentElement).toHaveTextContent("—")
  })
})

type User = ReturnType<typeof renderWithProviders>["user"]
type Routes = Parameters<typeof stubFetch>[0]

const SAVED = {
  client_id: "C-001",
  cuil: "20900000015",
  name: "Acme Ficticia",
  metrics: { usage: 90, support_tickets: 0, nps: 4, days_to_renewal: 300 },
}

function count(calls: FetchCall[], key: string) {
  return calls.filter((c) => c.key === key).length
}

function editRoutes(extra: Routes = {}) {
  return stubFetch({
    "GET /api/portfolio": { status: 200, body: portfolioFixture },
    "GET /api/metrics": { status: 200, body: metricsFixture },
    "GET /api/clients/C-001/score": { status: 200, body: top },
    "PUT /api/clients/C-001": { status: 200, body: SAVED },
    ...extra,
  })
}

async function openEdit(extra: Routes = {}) {
  const stub = editRoutes(extra)
  window.location.hash = "#/cartera/C-001"
  const view = renderWithProviders(<App />)
  await view.user.click(await screen.findByRole("button", { name: "Editar" }))
  await screen.findByRole("textbox", { name: "CUIT/CUIL" })
  return { ...stub, ...view }
}

async function changeNps(user: User) {
  await user.click(screen.getByRole("radio", { name: "NPS 4" }))
}

const SAVE_CHANGES = /Guardar cambios/

describe("Editar cliente (US3, spec 004)", () => {
  it("ofrece Editar y Eliminar en el detalle", async () => {
    editRoutes()
    window.location.hash = "#/cartera/C-001"
    renderWithProviders(<App />)
    expect(await screen.findByRole("button", { name: "Editar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeInTheDocument()
  })

  it("precarga CUIT/CUIL, nombre y métricas; el identificador no es editable", async () => {
    await openEdit()
    expect(screen.getByRole("textbox", { name: "CUIT/CUIL" })).toHaveValue("20-90000001-5")
    expect(screen.getByLabelText("Nombre")).toHaveValue("Acme Ficticia")
    expect(screen.getByLabelText("Días hasta renovación")).toHaveValue(300)
    expect(screen.getByLabelText(/Tickets de soporte/)).toHaveValue(0)
    expect(screen.getByRole("radio", { name: "NPS 9" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByText("Identificador").parentElement).toHaveTextContent("C-001")
    expect(screen.queryByDisplayValue("C-001")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: SAVE_CHANGES })).toBeDisabled()
  })

  it("guarda, vuelve a modo lectura y refresca detalle y cartera", async () => {
    const { user, calls } = await openEdit()
    await changeNps(user)
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))

    expect(await screen.findByText("Cambios guardados: Acme Ficticia")).toBeInTheDocument()
    const put = calls.find((c) => c.key === "PUT /api/clients/C-001")!
    expect(JSON.parse(String(put.init?.body))).toEqual({
      cuil: "20-90000001-5",
      name: "Acme Ficticia",
      metrics: { usage: 90, support_tickets: 0, nps: 4, days_to_renewal: 300 },
    })
    expect(await screen.findByRole("button", { name: "Editar" })).toBeInTheDocument()
    expect(count(calls, "GET /api/clients/C-001/score")).toBe(2)
    expect(count(calls, "GET /api/portfolio")).toBe(2)
  })

  it("sin tocar el CUIT guarda sin errores", async () => {
    const { user } = await openEdit()
    await user.clear(screen.getByLabelText("Nombre"))
    await user.type(screen.getByLabelText("Nombre"), "Acme Renombrada")
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))
    expect(await screen.findByText(/Cambios guardados/)).toBeInTheDocument()
  })

  it("con el CUIT vacío avisa junto al campo y no envía", async () => {
    const { user, calls } = await openEdit()
    await user.clear(screen.getByRole("textbox", { name: "CUIT/CUIL" }))
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))
    expect(await screen.findByText("Falta el CUIT/CUIL")).toBeInTheDocument()
    expect(document.getElementById("edit-cuil-error")).toHaveTextContent("Falta el CUIT/CUIL")
    expect(count(calls, "PUT /api/clients/C-001")).toBe(0)
  })

  it("precarga el nombre vacío y envía null si el cliente no tiene nombre", async () => {
    const { user, calls } = await openEdit({
      "GET /api/clients/C-001/score": { status: 200, body: { ...top, name: null } },
    })
    expect(screen.getByLabelText("Nombre")).toHaveValue("")
    await changeNps(user)
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))
    await waitFor(() => expect(count(calls, "PUT /api/clients/C-001")).toBe(1))
    const put = calls.find((c) => c.key === "PUT /api/clients/C-001")!
    expect(JSON.parse(String(put.init?.body)).name).toBeNull()
  })

  it("muestra el 409 bajo el CUIT/CUIL sin cerrar el formulario", async () => {
    const duplicate = "El CUIL '20900000023' ya está registrado en otro cliente"
    const { user } = await openEdit({
      "PUT /api/clients/C-001": { status: 409, body: { detail: duplicate } },
    })
    const cuil = screen.getByRole("textbox", { name: "CUIT/CUIL" })
    await user.clear(cuil)
    await user.type(cuil, "20900000023")
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))
    expect(await screen.findByText(duplicate)).toBeInTheDocument()
    expect(cuil).toHaveValue("20900000023")
    expect(cuil).toHaveAttribute("aria-invalid", "true")
  })

  it("muestra el 422 de una métrica bajo esa métrica", async () => {
    const { user } = await openEdit({
      "PUT /api/clients/C-001": {
        status: 422,
        body: { detail: [{ loc: ["body", "metrics", "nps"], msg: "debe ser un entero entre 0 y 10", type: "x" }] },
      },
    })
    await changeNps(user)
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))
    expect(await screen.findByText("debe ser un entero entre 0 y 10")).toBeInTheDocument()
    expect(document.getElementById("edit-nps-error")).toHaveTextContent("debe ser un entero entre 0 y 10")
  })

  it("Cancelar vuelve a modo lectura sin guardar", async () => {
    const { user, calls } = await openEdit()
    await changeNps(user)
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(await screen.findByRole("button", { name: "Editar" })).toBeInTheDocument()
    expect(count(calls, "PUT /api/clients/C-001")).toBe(0)
  })

  it("con cambios, cerrar el panel pide confirmación", async () => {
    const { user } = await openEdit()
    await changeNps(user)
    await user.keyboard("{Escape}")
    const confirm = await screen.findByRole("alertdialog", { name: "¿Descartar cambios?" })
    await user.click(within(confirm).getByRole("button", { name: "Seguir editando" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getByRole("textbox", { name: "CUIT/CUIL" })).toBeInTheDocument()

    await user.keyboard("{Escape}")
    const again = await screen.findByRole("alertdialog", { name: "¿Descartar cambios?" })
    await user.click(within(again).getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("abierto desde la tabla, Descartar cierra el panel y vuelve a la cartera", async () => {
    editRoutes()
    window.location.hash = "#/cartera"
    const { user } = renderWithProviders(<App />)
    await screen.findByRole("heading", { name: "Cartera de clientes" })
    await user.click(screen.getByText("Acme Ficticia"))
    await user.click(await screen.findByRole("button", { name: "Editar" }))
    await changeNps(user)
    await user.keyboard("{Escape}")
    const confirm = await screen.findByRole("alertdialog", { name: "¿Descartar cambios?" })
    await user.click(within(confirm).getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(window.location.hash).toBe("#/cartera"))
  })

  it("con cambios, navegar a otra pantalla pide confirmación y no cambia de página hasta confirmar", async () => {
    const { user } = await openEdit()
    await changeNps(user)
    act(() => {
      window.location.hash = "#/categorias"
    })
    const confirm = await screen.findByRole("alertdialog", { name: "¿Descartar cambios?" })
    expect(window.location.hash).toBe("#/cartera/C-001")
    // Con el diálogo abierto, Radix oculta el panel a la accesibilidad: se busca por valor.
    expect(screen.getByDisplayValue("20-90000001-5")).toBeInTheDocument()
    await user.click(within(confirm).getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(window.location.hash).toBe("#/categorias"))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("si el cliente ya no existe al guardar, lo informa y refresca la cartera", async () => {
    const { user, calls } = await openEdit({
      "PUT /api/clients/C-001": { status: 404, body: { detail: "Cliente 'C-001' no encontrado" } },
    })
    await changeNps(user)
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))
    expect(await screen.findByText("Cliente no encontrado")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Volver a la cartera" })).toBeInTheDocument()
    await waitFor(() => expect(count(calls, "GET /api/portfolio")).toBe(2))
  })

  it("ante un error del servicio avisa y conserva lo escrito", async () => {
    const { user } = await openEdit({ "PUT /api/clients/C-001": { status: 503, body: { detail: "x" } } })
    await user.clear(screen.getByLabelText("Nombre"))
    await user.type(screen.getByLabelText("Nombre"), "Acme Renombrada")
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))
    expect(await screen.findByText("No pudimos guardar los cambios. Inténtalo de nuevo.")).toBeInTheDocument()
    expect(screen.getByLabelText("Nombre")).toHaveValue("Acme Renombrada")
  })

  it("mientras guarda, el botón indica el progreso y queda deshabilitado", async () => {
    const { user } = await openEdit({ "PUT /api/clients/C-001": () => pending() })
    await changeNps(user)
    await user.click(screen.getByRole("button", { name: SAVE_CHANGES }))
    expect(await screen.findByRole("button", { name: /Guardando/ })).toBeDisabled()
  })
})

async function openDelete(extra: Routes = {}) {
  const stub = editRoutes({ "DELETE /api/clients/C-001": { status: 204 }, ...extra })
  window.location.hash = "#/cartera/C-001"
  const view = renderWithProviders(<App />)
  const trigger = await screen.findByRole("button", { name: "Eliminar" })
  await view.user.click(trigger)
  const dialog = await screen.findByRole("alertdialog", { name: "¿Eliminar cliente?" })
  return { ...stub, ...view, dialog, trigger }
}

const CONFIRM_DELETE = /Eliminar cliente|Eliminando/

describe("Eliminar cliente (US4, spec 004)", () => {
  it("pide confirmación mostrando nombre y CUIT/CUIL", async () => {
    const { dialog } = await openDelete()
    expect(dialog).toHaveTextContent("Acme Ficticia")
    expect(dialog).toHaveTextContent("CUIT/CUIL 20-90000001-5")
    expect(dialog).toHaveTextContent("Esta acción no se puede deshacer")
  })

  it("Cancelar no elimina y devuelve el foco a Eliminar", async () => {
    const { user, dialog, calls } = await openDelete()
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(count(calls, "DELETE /api/clients/C-001")).toBe(0)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("button", { name: "Eliminar" })).toHaveFocus())
  })

  it("Escape cancela sin eliminar", async () => {
    const { user, calls } = await openDelete()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(count(calls, "DELETE /api/clients/C-001")).toBe(0)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("un clic fuera del diálogo cancela sin eliminar", async () => {
    const { calls } = await openDelete()
    const overlay = document.querySelector('[data-slot="alert-dialog-overlay"]') as HTMLElement
    fireEvent.click(overlay)
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(count(calls, "DELETE /api/clients/C-001")).toBe(0)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("al confirmar elimina una vez, cierra el panel, avisa y refresca la cartera", async () => {
    const { user, dialog, calls } = await openDelete()
    await user.click(within(dialog).getByRole("button", { name: CONFIRM_DELETE }))
    expect(await screen.findByText("Cliente eliminado: Acme Ficticia")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(window.location.hash).toBe("#/cartera")
    expect(count(calls, "DELETE /api/clients/C-001")).toBe(1)
    await waitFor(() => expect(count(calls, "GET /api/portfolio")).toBe(2))
  })

  it("mientras elimina, el botón indica el progreso y no envía dos veces", async () => {
    const { user, dialog, calls } = await openDelete({ "DELETE /api/clients/C-001": () => pending() })
    await user.click(within(dialog).getByRole("button", { name: CONFIRM_DELETE }))
    const deleting = await within(dialog).findByRole("button", { name: /Eliminando/ })
    expect(deleting).toBeDisabled()
    await user.click(deleting)
    expect(count(calls, "DELETE /api/clients/C-001")).toBe(1)
  })

  it("si el cliente ya no existe, lo informa y refresca la cartera", async () => {
    const { user, dialog, calls } = await openDelete({
      "DELETE /api/clients/C-001": { status: 404, body: { detail: "Cliente 'C-001' no encontrado" } },
    })
    await user.click(within(dialog).getByRole("button", { name: CONFIRM_DELETE }))
    expect(await screen.findByText("Cliente no encontrado")).toBeInTheDocument()
    await waitFor(() => expect(count(calls, "GET /api/portfolio")).toBe(2))
  })

  it("ante un error del servicio avisa dentro del diálogo y permite reintentar", async () => {
    const { user, dialog, calls } = await openDelete({
      "DELETE /api/clients/C-001": { status: 503, body: { detail: "x" } },
    })
    await user.click(within(dialog).getByRole("button", { name: CONFIRM_DELETE }))
    expect(await within(dialog).findByText("No pudimos eliminar el cliente. Inténtalo de nuevo.")).toBeInTheDocument()
    const retry = within(dialog).getByRole("button", { name: CONFIRM_DELETE })
    expect(retry).toBeEnabled()
    await user.click(retry)
    await waitFor(() => expect(count(calls, "DELETE /api/clients/C-001")).toBe(2))
    expect(count(calls, "GET /api/portfolio")).toBe(1)
  })
})

describe("Rótulo CUIT/CUIL en el detalle (spec 004)", () => {
  it("nombra el valor para lectores de pantalla sin mostrar el rótulo", async () => {
    stub()
    window.location.hash = "#/cartera/C-001"
    renderWithProviders(<App />)
    const header = (await screen.findByRole("heading", { name: "Acme Ficticia" })).parentElement!
    expect(header).toHaveTextContent("CUIT/CUIL 20-90000001-5")
    expect(within(header).getByText("CUIT/CUIL")).toHaveClass("sr-only")
  })
})

describe("Foco en la edición (FR-027, spec 004)", () => {
  it("al editar enfoca el CUIT/CUIL y al cancelar vuelve a Editar", async () => {
    const { user } = await openEdit()
    await waitFor(() => expect(screen.getByRole("textbox", { name: "CUIT/CUIL" })).toHaveFocus())
    await user.click(screen.getByRole("button", { name: "Cancelar" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Editar" })).toHaveFocus())
  })
})
