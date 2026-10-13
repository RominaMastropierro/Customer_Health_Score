import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "@/App"
import { portfolioFixture, stubFetch } from "@/test/fixtures"
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
