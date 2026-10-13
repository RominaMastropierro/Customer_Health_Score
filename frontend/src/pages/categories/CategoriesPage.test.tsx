import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import CategoriesPage from "@/pages/categories/CategoriesPage"
import { portfolioFixture } from "@/test/fixtures"
import { renderWithProviders } from "@/test/render"

function renderPage(data = portfolioFixture) {
  return renderWithProviders(
    <CategoriesPage state={{ status: "success", data }} reload={() => {}} />,
  )
}

describe("Por categoría (US4)", () => {
  it("muestra una columna por grupo con los conteos del summary", () => {
    renderPage()
    const top = screen.getByRole("region", { name: "Top" })
    const risk = screen.getByRole("region", { name: "En riesgo" })
    expect(within(top).getByRole("button")).toHaveTextContent("1")
    expect(within(top).getByRole("button")).toHaveTextContent("20.0%")
    expect(within(risk).getByRole("button")).toHaveTextContent("2")
    expect(within(risk).getByRole("button")).toHaveTextContent("40.0%")
  })

  it("pone cada cliente en una sola columna", () => {
    renderPage()
    expect(screen.getAllByRole("article")).toHaveLength(portfolioFixture.results.length)
    expect(within(screen.getByRole("region", { name: "Estable" })).getByText("Globex Demo")).toBeInTheDocument()
  })

  it("muestra la métrica más débil o la cantidad de errores", () => {
    renderPage()
    const globex = screen.getByText("Globex Demo").closest("article")!
    expect(globex).toHaveTextContent("Métrica más débil")
    expect(globex).toHaveTextContent("Renovación50")
    const invalid = within(screen.getByRole("region", { name: "Inválido" })).getByRole("article")
    expect(invalid).toHaveTextContent("1 errores de validación")
  })

  it("indica las columnas vacías y permite colapsarlas", async () => {
    const data = structuredClone(portfolioFixture)
    data.results = data.results.filter((r) => r.result?.level !== "Estable")
    data.summary = { ...data.summary, total: 4, by_level: { ...data.summary.by_level, Estable: 0 } }
    const { user } = renderPage(data)
    const stable = screen.getByRole("region", { name: "Estable" })
    expect(stable).toHaveTextContent("Sin clientes en esta categoría")
    const toggle = within(stable).getByRole("button")
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })
})
