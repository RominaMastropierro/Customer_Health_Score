import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import NewClientPage from "@/pages/new-client/NewClientPage"
import { clientRecordFixture, type FetchCall, metricsFixture, pending, stubFetch } from "@/test/fixtures"
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

describe("Nuevo cliente sin CUIL (US6, spec 003)", () => {
  it("no muestra CUIL en el resultado de un cliente no guardado", async () => {
    const { user } = await renderForm({ "POST /api/score": { status: 200, body: RESULT } })
    // usage 1: pocas pulsaciones en el slider; el resultado lo da el stub, no las métricas.
    await fill(user, { usage: 1, tickets: "0", nps: 9, days: "300" })
    await user.click(screen.getByRole("button", { name: "Calcular score" }))
    expect(await screen.findByText("Resultado")).toBeInTheDocument()
    // Solo el panel de resultado: el formulario ahora tiene el campo CUIT/CUIL (spec 004). En el
    // panel, la única mención es el motivo de "Guardar en cartera" deshabilitado, no un valor.
    const panel = screen.getByText("Resultado").closest("[aria-live]") as HTMLElement
    const save = within(panel).getByRole("button", { name: /Guardar en cartera/ })
    for (const node of within(panel).queryAllByText(/CUIL/)) expect(save).toContainElement(node)
    expect(panel).not.toHaveTextContent(/\d{2}-\d{8}-\d/)
  })
})

type User = ReturnType<typeof renderWithProviders>["user"]

const CUIT = "20-90000024-4"
const SAVE = /Guardar en cartera/

function created(): Response {
  return new Response(JSON.stringify(clientRecordFixture), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  })
}

async function renderSave(routes: Parameters<typeof stubFetch>[0] = {}) {
  const stub = stubFetch({
    "GET /api/metrics": { status: 200, body: metricsFixture },
    "POST /api/score": { status: 200, body: RESULT },
    ...routes,
  })
  const onSaved = vi.fn()
  const onClientsChanged = vi.fn()
  const view = renderWithProviders(<NewClientPage onSaved={onSaved} onClientsChanged={onClientsChanged} />)
  await screen.findByRole("heading", { name: "Datos del cliente" })
  return { ...stub, ...view, onSaved, onClientsChanged }
}

// usage 1: pocas pulsaciones en el slider; el resultado lo da el stub, no las métricas.
async function calculate(user: User, { cuil = CUIT, name = "Cliente Ficticio" } = {}) {
  if (cuil) await user.type(screen.getByLabelText("CUIT/CUIL"), cuil)
  if (name) await user.type(screen.getByLabelText("Nombre"), name)
  await fill(user, { usage: 1, tickets: "0", nps: 9, days: "300" })
  await user.click(screen.getByRole("button", { name: "Calcular score" }))
  await screen.findByText("Resultado")
}

function posts(calls: FetchCall[]) {
  return calls.filter((c) => c.key === "POST /api/clients")
}

describe("Guardar en cartera (US1, spec 004)", () => {
  it("muestra el campo CUIT/CUIL como primer campo, con su ayuda", async () => {
    await renderSave()
    const cuil = screen.getByRole("textbox", { name: "CUIT/CUIL" })
    expect(cuil).toHaveAttribute("placeholder", "XX-XXXXXXXX-X")
    expect(cuil).toHaveAttribute("type", "text")
    expect(screen.getByText("Con o sin guiones")).toBeInTheDocument()
    const name = screen.getByLabelText("Nombre")
    expect(cuil.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("conserva el CUIT tal como se escribe", async () => {
    const { user } = await renderSave()
    const cuil = screen.getByLabelText("CUIT/CUIL")
    await user.type(cuil, CUIT)
    expect(cuil).toHaveValue(CUIT)
    await user.clear(cuil)
    await user.type(cuil, "00012345678")
    expect(cuil).toHaveValue("00012345678")
  })

  it("sin CUIT deshabilita Guardar e indica el motivo", async () => {
    const { user } = await renderSave()
    await calculate(user, { cuil: "" })
    const save = screen.getByRole("button", { name: SAVE })
    expect(save).toBeDisabled()
    expect(save).toHaveTextContent("Falta el CUIT/CUIL")
    expect(screen.queryByText(/Disponible próximamente/)).not.toBeInTheDocument()
  })

  it("pide recalcular si el formulario cambió después del cálculo", async () => {
    const { user } = await renderSave()
    await calculate(user)
    expect(screen.getByRole("button", { name: SAVE })).toBeEnabled()
    await user.type(screen.getByLabelText("Nombre"), " SA")
    const save = screen.getByRole("button", { name: SAVE })
    expect(save).toBeDisabled()
    expect(save).toHaveTextContent("Vuelve a calcular para guardar")
    await user.click(screen.getByRole("button", { name: "Calcular score" }))
    await waitFor(() => expect(screen.getByRole("button", { name: SAVE })).toBeEnabled())
  })

  it("envía el CUIT tal cual, el nombre y las métricas, sin client_id", async () => {
    const { user, calls } = await renderSave({ "POST /api/clients": { status: 201, body: clientRecordFixture } })
    await calculate(user)
    await user.click(screen.getByRole("button", { name: SAVE }))
    await waitFor(() => expect(posts(calls)).toHaveLength(1))
    expect(JSON.parse(String(posts(calls)[0].init?.body))).toEqual({
      cuil: CUIT,
      name: "Cliente Ficticio",
      metrics: { usage: 1, support_tickets: 0, nps: 9, days_to_renewal: 300 },
    })
  })

  it("envía name null si el nombre está vacío o tiene solo espacios", async () => {
    const { user, calls } = await renderSave({ "POST /api/clients": { status: 201, body: clientRecordFixture } })
    await calculate(user, { name: "   " })
    await user.click(screen.getByRole("button", { name: SAVE }))
    await waitFor(() => expect(posts(calls)).toHaveLength(1))
    expect(JSON.parse(String(posts(calls)[0].init?.body)).name).toBeNull()
  })

  it("tras guardar avisa, refresca la cartera y deja el formulario vacío", async () => {
    const { user, onSaved, onClientsChanged } = await renderSave({
      "POST /api/clients": { status: 201, body: clientRecordFixture },
    })
    await calculate(user)
    await user.click(screen.getByRole("button", { name: SAVE }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(clientRecordFixture))
    expect(onClientsChanged).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText("CUIT/CUIL")).toHaveValue("")
    expect(screen.getByLabelText("Nombre")).toHaveValue("")
    expect(screen.getByLabelText(/Tickets de soporte/)).toHaveValue(null)
    expect(screen.queryByText("Resultado")).not.toBeInTheDocument()
  })

  it("si la pantalla se desmonta antes de la respuesta, refresca la cartera pero no avisa", async () => {
    let respond: (response: Response) => void = () => {}
    const { user, unmount, onSaved, onClientsChanged } = await renderSave({
      "POST /api/clients": () => new Promise<Response>((resolve) => (respond = resolve)),
    })
    await calculate(user)
    await user.click(screen.getByRole("button", { name: SAVE }))
    unmount()
    respond(created())
    await waitFor(() => expect(onClientsChanged).toHaveBeenCalledTimes(1))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("no envía dos veces mientras guarda", async () => {
    const { user, calls } = await renderSave({ "POST /api/clients": () => pending() })
    await calculate(user)
    await user.click(screen.getByRole("button", { name: SAVE }))
    const saving = await screen.findByRole("button", { name: /Guardando/ })
    expect(saving).toBeDisabled()
    await user.click(saving)
    expect(posts(calls)).toHaveLength(1)
  })
})

function invalid(...detail: { loc: string[]; msg: string }[]) {
  return { status: 422, body: { detail: detail.map((d) => ({ ...d, type: "x" })) } }
}

const CHECK_DIGIT = "el dígito verificador del CUIL no es válido"
const FORMAT = "el CUIL debe tener 11 dígitos, con o sin guiones (XX-XXXXXXXX-X)"
const DUPLICATE = "El CUIL '20900000015' ya está registrado en otro cliente"
const USAGE = "debe ser un entero entre 0 y 100"
const SAVE_FAILED = "No pudimos guardar los cambios. Inténtalo de nuevo."

async function saveWith(post: Parameters<typeof stubFetch>[0][string]) {
  const view = await renderSave({ "POST /api/clients": post })
  await calculate(view.user)
  await view.user.click(screen.getByRole("button", { name: SAVE }))
  return view
}

describe("Errores al guardar (US2, spec 004)", () => {
  it("muestra el error de dígito verificador bajo el campo CUIT/CUIL", async () => {
    const { onSaved } = await saveWith(invalid({ loc: ["body", "cuil"], msg: CHECK_DIGIT }))
    expect(await screen.findByText(CHECK_DIGIT)).toBeInTheDocument()
    const cuil = screen.getByLabelText("CUIT/CUIL")
    expect(cuil).toHaveAttribute("aria-invalid", "true")
    expect(cuil).toHaveAttribute("aria-describedby", "cuil-error")
    expect(document.getElementById("cuil-error")).toHaveTextContent(CHECK_DIGIT)
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("muestra el error de formato bajo el campo CUIT/CUIL", async () => {
    await saveWith(invalid({ loc: ["body", "cuil"], msg: FORMAT }))
    expect(await screen.findByText(FORMAT)).toBeInTheDocument()
    expect(document.getElementById("cuil-error")).toHaveTextContent(FORMAT)
  })

  it("muestra el CUIL duplicado bajo el campo CUIT/CUIL", async () => {
    await saveWith({ status: 409, body: { detail: DUPLICATE } })
    expect(await screen.findByText(DUPLICATE)).toBeInTheDocument()
    expect(document.getElementById("cuil-error")).toHaveTextContent(DUPLICATE)
  })

  it("marca todos los campos con error a la vez", async () => {
    await saveWith(
      invalid({ loc: ["body", "cuil"], msg: CHECK_DIGIT }, { loc: ["body", "metrics", "usage"], msg: USAGE }),
    )
    expect(await screen.findByText(CHECK_DIGIT)).toBeInTheDocument()
    expect(document.getElementById("usage-error")).toHaveTextContent(USAGE)
    expect(screen.getByLabelText("Uso del producto (%)")).toHaveAttribute("aria-invalid", "true")
  })

  it("muestra como aviso del formulario lo que no es de un campo", async () => {
    await saveWith(invalid({ loc: ["body"], msg: "cuerpo inválido" }))
    expect(await screen.findByText("cuerpo inválido")).toBeInTheDocument()
  })

  it.each([
    ["servicio no disponible", { status: 503, body: { detail: "Servicio no disponible" } }],
    ["sin conexión", () => Promise.reject(new TypeError("Failed to fetch"))],
  ] as const)("ante %s avisa y conserva lo escrito", async (_, post) => {
    const { onSaved } = await saveWith(post)
    expect(await screen.findByText(SAVE_FAILED)).toBeInTheDocument()
    expect(screen.getByLabelText("CUIT/CUIL")).toHaveValue(CUIT)
    expect(screen.getByLabelText("Nombre")).toHaveValue("Cliente Ficticio")
    expect(screen.getByLabelText("Días hasta renovación")).toHaveValue(300)
    expect(screen.getByRole("button", { name: SAVE })).toBeEnabled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it("al corregir el CUIT se borra solo su error", async () => {
    const { user } = await saveWith(
      invalid({ loc: ["body", "cuil"], msg: CHECK_DIGIT }, { loc: ["body", "metrics", "usage"], msg: USAGE }),
    )
    await screen.findByText(CHECK_DIGIT)
    await user.type(screen.getByLabelText("CUIT/CUIL"), "0")
    expect(screen.queryByText(CHECK_DIGIT)).not.toBeInTheDocument()
    expect(screen.getByText(USAGE)).toBeInTheDocument()
  })

  it("sin CUIT nunca llama al servicio", async () => {
    const { user, calls } = await renderSave({ "POST /api/clients": { status: 201, body: clientRecordFixture } })
    await calculate(user, { cuil: "" })
    await user.click(screen.getByRole("button", { name: SAVE }))
    expect(posts(calls)).toHaveLength(0)
  })
})
