import { act, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "@/App"
import { clientRecordFixture, metricsFixture, portfolioFixture, stubFetch } from "@/test/fixtures"
import { renderWithProviders } from "@/test/render"

type User = ReturnType<typeof renderWithProviders>["user"]

const RESULT = {
  score: 95,
  level: "Top",
  sub_scores: { usage: 90, support_tickets: 100, nps: 90, renewal: 100 },
}

function routes(post: Parameters<typeof stubFetch>[0][string]) {
  return stubFetch({
    "GET /api/portfolio": { status: 200, body: portfolioFixture },
    "GET /api/metrics": { status: 200, body: metricsFixture },
    "POST /api/score": { status: 200, body: RESULT },
    "POST /api/clients": post,
  })
}

async function calculateAndSave(user: User) {
  await screen.findByRole("heading", { name: "Datos del cliente" })
  await user.type(screen.getByLabelText("CUIT/CUIL"), "20-90000024-4")
  const slider = screen.getByRole("slider", { name: "Uso del producto" })
  slider.focus()
  await user.keyboard("{ArrowRight}")
  await user.type(screen.getByLabelText(/Tickets de soporte/), "0")
  await user.type(screen.getByLabelText("Días hasta renovación"), "300")
  await user.click(screen.getByRole("radio", { name: "NPS 9" }))
  await user.click(screen.getByRole("button", { name: "Calcular score" }))
  await screen.findByText("Resultado")
  await user.click(screen.getByRole("button", { name: /Guardar en cartera/ }))
}

function portfolioLoads(calls: { key: string }[]) {
  return calls.filter((c) => c.key === "GET /api/portfolio").length
}

describe("Alta desde la app (US1, spec 004)", () => {
  it("avisa con el nombre y el CUIT, enlaza al detalle y refresca la cartera", async () => {
    const { calls } = routes({ status: 201, body: clientRecordFixture })
    window.location.hash = "#/nuevo"
    const { user } = renderWithProviders(<App />)
    await waitFor(() => expect(portfolioLoads(calls)).toBe(1))

    await calculateAndSave(user)

    expect(await screen.findByText("Cliente guardado: Cliente Ficticio · 20-90000024-4")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ver en la cartera" })).toHaveAttribute(
      "href",
      "#/cartera/3f2b8c1e-9a4d-4e7b-8c21-5d6f0a9b1c2d",
    )
    await waitFor(() => expect(portfolioLoads(calls)).toBe(2))

    act(() => {
      window.location.hash = "#/categorias"
    })
    await waitFor(() => expect(screen.queryByText(/Cliente guardado/)).not.toBeInTheDocument())
  })

  it("usa Cliente nuevo si el cliente no tiene nombre", async () => {
    routes({ status: 201, body: { ...clientRecordFixture, name: null } })
    window.location.hash = "#/nuevo"
    const { user } = renderWithProviders(<App />)
    await calculateAndSave(user)
    expect(await screen.findByText("Cliente guardado: Cliente nuevo · 20-90000024-4")).toBeInTheDocument()
  })

  it("si la respuesta llega en otra pantalla, refresca la cartera sin mostrar el aviso", async () => {
    let respond: (response: Response) => void = () => {}
    const { calls } = routes(() => new Promise<Response>((resolve) => (respond = resolve)))
    window.location.hash = "#/nuevo"
    const { user } = renderWithProviders(<App />)
    await calculateAndSave(user)
    act(() => {
      window.location.hash = "#/cartera"
    })
    await screen.findByRole("heading", { name: "Cartera de clientes" })
    const before = portfolioLoads(calls)

    await act(async () => {
      respond(
        new Response(JSON.stringify(clientRecordFixture), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
    })

    await waitFor(() => expect(portfolioLoads(calls)).toBe(before + 1))
    expect(screen.queryByText(/Cliente guardado/)).not.toBeInTheDocument()
  })
})
