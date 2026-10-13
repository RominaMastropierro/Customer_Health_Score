import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import ConfigPage from "@/pages/config/ConfigPage"
import { configFixture, stubFetch } from "@/test/fixtures"
import { renderWithProviders } from "@/test/render"

describe("Configuración (US5)", () => {
  it("muestra la configuración por defecto", async () => {
    stubFetch({ "GET /api/config": { status: 200, body: configFixture } })
    const { container } = renderWithProviders(<ConfigPage />)
    await screen.findByRole("heading", { name: "Configuración activa" })
    expect(screen.getAllByText("25 %")).toHaveLength(4)
    expect(container).toHaveTextContent("score ≥ 75")
    expect(container).toHaveTextContent("score < 50")
    expect(container).toHaveTextContent("10 tickets")
    expect(container).toHaveTextContent("180 días")
  })

  it("expresa los pesos como porcentaje del total", async () => {
    stubFetch({
      "GET /api/config": {
        status: 200,
        body: { ...configFixture, weights: { usage: 2, support_tickets: 1, nps: 1, renewal: 0 } },
      },
    })
    renderWithProviders(<ConfigPage />)
    await screen.findByRole("heading", { name: "Configuración activa" })
    expect(screen.getByText("50 %")).toBeInTheDocument()
    expect(screen.getAllByText("25 %")).toHaveLength(2)
    expect(screen.getByText("0 %")).toBeInTheDocument()
  })

  it("no ofrece controles de edición", async () => {
    stubFetch({ "GET /api/config": { status: 200, body: configFixture } })
    const { container } = renderWithProviders(<ConfigPage />)
    await screen.findByRole("heading", { name: "Configuración activa" })
    expect(container.querySelector("input, select, textarea, button[type=submit]")).toBeNull()
  })
})
