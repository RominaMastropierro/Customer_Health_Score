import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import NewClientPage from "@/pages/new-client/NewClientPage"
import { metricsFixture, pending, stubFetch } from "@/test/fixtures"
import { renderWithProviders } from "@/test/render"

const RESULT = {
  score: 95,
  level: "Top",
  sub_scores: { usage: 90, support_tickets: 100, nps: 90, renewal: 100 },
}

async function renderForm(routes: Parameters<typeof stubFetch>[0] = {}) {
  const stub = stubFetch({ "GET /api/metrics": { status: 200, body: metricsFixture }, ...routes })
  const view = renderWithProviders(<NewClientPage />)
  await screen.findByRole("heading", { name: "Datos del cliente" })
  return { ...stub, ...view }
}

async function fill(user: ReturnType<typeof renderWithProviders>["user"], v: { usage: number; tickets: string; nps: number; days: string }) {
  const slider = screen.getByRole("slider", { name: "Uso del producto" })
  slider.focus()
  await user.keyboard("{Home}")
  for (let i = 0; i < v.usage; i++) await user.keyboard("{ArrowRight}")
  await user.type(screen.getByLabelText(/Tickets de soporte/), v.tickets)
  await user.type(screen.getByLabelText("Días hasta renovación"), v.days)
  await user.click(screen.getByRole("radio", { name: `NPS ${v.nps}` }))
}

describe("Nuevo cliente (US2)", () => {
  it("toma las opciones de NPS de GET /metrics", async () => {
    const ranges = metricsFixture.map((r) => (r.name === "nps" ? { ...r, max: 5 } : r))
    stubFetch({ "GET /api/metrics": { status: 200, body: ranges } })
    renderWithProviders(<NewClientPage />)
    await screen.findByRole("heading", { name: "Datos del cliente" })
    expect(screen.getAllByRole("radio", { name: /^NPS \d+$/ })).toHaveLength(6)
  })

  it("envía solo las cuatro métricas y muestra el resultado de la API", async () => {
    const { user, calls } = await renderForm({ "POST /api/score": { status: 200, body: RESULT } })
    await user.type(screen.getByLabelText("Nombre"), "Acme Ficticia")
    await fill(user, { usage: 90, tickets: "0", nps: 9, days: "300" })
    await user.click(screen.getByRole("button", { name: "Calcular score" }))

    expect(await screen.findByText("Resultado")).toBeInTheDocument()
    const post = calls.find((c) => c.key === "POST /api/score")!
    expect(JSON.parse(String(post.init?.body))).toEqual({
      usage: 90,
      support_tickets: 0,
      nps: 9,
      days_to_renewal: 300,
    })
    expect(screen.getByRole("img", { name: "Score 95 de 100" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Acme Ficticia" })).toBeInTheDocument()
  })

  it("muestra el error 422 bajo el campo y no muestra score", async () => {
    const { user } = await renderForm({
      "POST /api/score": {
        status: 422,
        body: {
          detail: [
            { loc: ["body", "support_tickets"], msg: "debe ser un entero mayor o igual a 0", type: "int_type" },
          ],
        },
      },
    })
    await fill(user, { usage: 50, tickets: "2.5", nps: 7, days: "90" })
    await user.click(screen.getByRole("button", { name: "Calcular score" }))

    expect(await screen.findByText("debe ser un entero mayor o igual a 0")).toBeInTheDocument()
    expect(screen.getByLabelText(/Tickets de soporte/)).toHaveAttribute("aria-invalid", "true")
    expect(screen.queryByText("Resultado")).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Tickets de soporte/)).toHaveValue(2.5)
  })

  it("bloquea el envío si faltan métricas", async () => {
    const { user, calls } = await renderForm()
    await user.click(screen.getByRole("button", { name: "Calcular score" }))
    expect(screen.getAllByText("Introduce un número entero")).toHaveLength(4)
    expect(calls.some((c) => c.key === "POST /api/score")).toBe(false)
  })

  it("deshabilita el botón mientras calcula", async () => {
    const { user } = await renderForm({ "POST /api/score": () => pending() })
    await fill(user, { usage: 50, tickets: "1", nps: 7, days: "90" })
    await user.click(screen.getByRole("button", { name: "Calcular score" }))
    await waitFor(() => expect(screen.getByRole("button", { name: /Calculando/ })).toBeDisabled())
  })
})
