import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "@/App"
import type { PortfolioResult } from "@/api/types"
import { portfolioFixture, stubFetch } from "@/test/fixtures"
import { renderWithProviders } from "@/test/render"

function stubPortfolio(body: PortfolioResult = portfolioFixture, status = 200) {
  return stubFetch({ "GET /api/portfolio": { status, body } })
}

async function renderPortfolio() {
  const view = renderWithProviders(<App />)
  await screen.findByRole("heading", { name: "Cartera de clientes" })
  return view
}

function kpi(label: string) {
  const region = screen.getByRole("region", { name: "Indicadores de la cartera" })
  return within(region).getByText(label).parentElement!
}

function bodyRows() {
  const table = screen.getByRole("table")
  return within(table).getAllByRole("row").slice(1)
}

describe("Cartera (US1)", () => {
  it("muestra los conteos del summary tal como llegan", async () => {
    stubPortfolio()
    await renderPortfolio()
    expect(kpi("Total clientes")).toHaveTextContent("5")
    expect(kpi("En riesgo")).toHaveTextContent("2")
    expect(kpi("En riesgo")).toHaveTextContent("40% del total")
    expect(kpi("Inválido")).toHaveTextContent("1")
  })

  it("muestra el score de la API sin recalcularlo", async () => {
    const altered = structuredClone(portfolioFixture)
    altered.results[0].result!.score = 12
    stubPortfolio(altered)
    await renderPortfolio()
    const row = screen.getByText("Acme Ficticia").closest("tr")!
    expect(row).toHaveTextContent("12")
    expect(row).toHaveTextContent("Top")
  })

  it("muestra el inválido sin score y con sus métricas originales", async () => {
    stubPortfolio()
    await renderPortfolio()
    const row = within(screen.getByRole("table")).getByText("C-005", { selector: "strong" }).closest("tr")!
    expect(row).toHaveTextContent("—")
    expect(row).toHaveTextContent("Inválido")
    expect(row).toHaveTextContent("120%")
    expect(within(row).getByRole("button", { name: /debe ser un entero entre 0 y 100/ })).toBeInTheDocument()
  })

  it("busca por nombre o id sin distinguir mayúsculas", async () => {
    stubPortfolio()
    const { user } = await renderPortfolio()
    await user.type(screen.getByPlaceholderText("Buscar cliente"), "globex")
    await waitFor(() => expect(bodyRows()).toHaveLength(1))
    expect(screen.getByText("1 resultados")).toBeInTheDocument()
  })

  it("filtra por nivel y ordena ascendente", async () => {
    stubPortfolio()
    const { user } = await renderPortfolio()
    await user.click(screen.getByRole("combobox", { name: "Filtrar por categoría" }))
    await user.click(await screen.findByRole("option", { name: "En riesgo" }))
    await user.click(screen.getByRole("button", { name: /Ordenar por score/ }))
    await waitFor(() => expect(bodyRows()).toHaveLength(2))
    const names = bodyRows().map((row) => within(row).getAllByRole("cell")[0].querySelector("strong")!.textContent)
    expect(names).toEqual(["Initech Inventada", "Umbrella Ejemplo"])
  })

  it("muestra el error y reintenta", async () => {
    const { fetchMock } = stubPortfolio(portfolioFixture, 500)
    const { user } = renderWithProviders(<App />)
    expect(await screen.findByText("No pudimos cargar los datos")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Reintentar" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it("muestra el estado vacío con cartera vacía", async () => {
    stubPortfolio({ results: [], summary: { total: 0, by_level: { Top: 0, Estable: 0, "En riesgo": 0 }, invalid: 0 } })
    await renderPortfolio()
    expect(screen.getByText("Aún no hay clientes")).toBeInTheDocument()
    expect(kpi("Total clientes")).toHaveTextContent("0")
  })

  it("abre el detalle con Enter sobre una fila", async () => {
    stubPortfolio()
    const { user } = await renderPortfolio()
    const row = screen.getByText("Globex Demo").closest("tr")!
    row.focus()
    await user.keyboard("{Enter}")
    expect(window.location.hash).toBe("#/cartera/C-002")
  })
})
