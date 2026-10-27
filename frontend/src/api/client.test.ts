import { describe, expect, it } from "vitest"

import {
  ApiError,
  createClient,
  deleteClient,
  getClientScore,
  getPortfolio,
  postScore,
  updateClient,
} from "@/api/client"
import type { ClientData } from "@/api/types"
import { clientRecordFixture, portfolioFixture, stubFetch } from "@/test/fixtures"

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error("se esperaba un error")
}

const METRICS = { usage: 90, support_tickets: 0, nps: 9, days_to_renewal: 300 }

describe("api client", () => {
  it("devuelve el JSON de la API sin transformarlo", async () => {
    stubFetch({ "GET /api/portfolio": { status: 200, body: portfolioFixture } })
    expect(await getPortfolio()).toEqual(portfolioFixture)
  })

  it("convierte un 422 de métrica en un error por campo", async () => {
    stubFetch({
      "POST /api/score": {
        status: 422,
        body: { detail: [{ loc: ["body", "nps"], msg: "debe ser un entero entre 0 y 10", type: "x" }] },
      },
    })
    const error = await caught(postScore(METRICS))
    expect(error.status).toBe(422)
    expect(error.fieldErrors).toEqual({ nps: "debe ser un entero entre 0 y 10" })
    expect(error.formErrors).toEqual([])
  })

  it("deja como error general un 422 que no es de una métrica", async () => {
    stubFetch({
      "POST /api/score": {
        status: 422,
        body: { detail: [{ loc: ["body"], msg: "cuerpo inválido", type: "x" }] },
      },
    })
    const error = await caught(postScore(METRICS))
    expect(error.formErrors).toEqual(["cuerpo inválido"])
  })

  it("informa el 404 con su status", async () => {
    stubFetch({})
    const error = await caught(getClientScore("NO-EXISTE"))
    expect(error.status).toBe(404)
  })

  it("convierte un fallo de red en status 0", async () => {
    stubFetch({
      "GET /api/portfolio": () => Promise.reject(new TypeError("Failed to fetch")),
    })
    const error = await caught(getPortfolio())
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
  })

  it("envía solo las cuatro métricas", async () => {
    const { calls } = stubFetch({ "POST /api/score": { status: 200, body: {} } })
    await postScore({ ...METRICS, name: "Acme" } as typeof METRICS)
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(METRICS)
  })

  it("codifica el id del cliente en la URL", async () => {
    const { calls } = stubFetch({ "GET /api/clients/A%2FB/score": { status: 200, body: {} } })
    await getClientScore("A/B")
    expect(calls[0].key).toBe("GET /api/clients/A%2FB/score")
  })
})

const DATA: ClientData = {
  cuil: "20-90000024-4",
  name: "Cliente Ficticio",
  metrics: { usage: 60, support_tickets: 3, nps: 7, days_to_renewal: 90 },
}

const DUPLICATE = "El CUIL '20900000015' ya está registrado en otro cliente"

describe("api client: clientes (spec 004)", () => {
  it("crea un cliente sin enviar client_id y devuelve el registro", async () => {
    const { calls } = stubFetch({ "POST /api/clients": { status: 201, body: clientRecordFixture } })
    const record = await createClient({ ...DATA, client_id: "X" } as ClientData)
    expect(record).toEqual(clientRecordFixture)
    expect(calls[0].key).toBe("POST /api/clients")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(DATA)
  })

  it("actualiza por id codificado", async () => {
    const { calls } = stubFetch({
      "PUT /api/clients/C-002": { status: 200, body: clientRecordFixture },
      "PUT /api/clients/a%2Fb": { status: 200, body: clientRecordFixture },
    })
    await updateClient("C-002", DATA)
    await updateClient("a/b", DATA)
    expect(calls.map((c) => c.key)).toEqual(["PUT /api/clients/C-002", "PUT /api/clients/a%2Fb"])
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(DATA)
  })

  it("elimina y acepta un 204 sin cuerpo", async () => {
    const { calls } = stubFetch({ "DELETE /api/clients/C-001": { status: 204 } })
    await expect(deleteClient("C-001")).resolves.toBeUndefined()
    expect(calls[0].key).toBe("DELETE /api/clients/C-001")
  })

  it("asocia los 422 de /clients a cada campo y deja el resto como error general", async () => {
    stubFetch({
      "POST /api/clients": {
        status: 422,
        body: {
          detail: [
            { loc: ["body", "metrics", "usage"], msg: "debe ser un entero entre 0 y 100", type: "x" },
            { loc: ["body", "cuil"], msg: "el dígito verificador del CUIL no es válido", type: "x" },
            { loc: ["body", "name"], msg: "nombre inválido", type: "x" },
            { loc: ["body", "metrics"], msg: "campo obligatorio", type: "x" },
            { loc: ["body", "client_id"], msg: "campo no permitido", type: "x" },
          ],
        },
      },
    })
    const error = await caught(createClient(DATA))
    expect(error.status).toBe(422)
    expect(error.fieldErrors).toEqual({
      usage: "debe ser un entero entre 0 y 100",
      cuil: "el dígito verificador del CUIL no es válido",
      name: "nombre inválido",
    })
    expect(error.formErrors).toEqual(["campo obligatorio", "campo no permitido"])
  })

  it("convierte el 409 de CUIL duplicado en error del campo cuil, al crear y al actualizar", async () => {
    stubFetch({
      "POST /api/clients": { status: 409, body: { detail: DUPLICATE } },
      "PUT /api/clients/C-002": { status: 409, body: { detail: DUPLICATE } },
    })
    for (const promise of [createClient(DATA), updateClient("C-002", DATA)]) {
      const error = await caught(promise)
      expect(error.status).toBe(409)
      expect(error.fieldErrors).toEqual({ cuil: DUPLICATE })
    }
  })

  it("deja como error general un 409 que no es de CUIL", async () => {
    const detail = "Ya existe un cliente con el identificador 'x'"
    stubFetch({ "POST /api/clients": { status: 409, body: { detail } } })
    const error = await caught(createClient(DATA))
    expect(error.status).toBe(409)
    expect(error.formErrors).toEqual([detail])
    expect(error.fieldErrors).toBeUndefined()
  })

  it("informa el 404 al actualizar o eliminar", async () => {
    stubFetch({})
    expect((await caught(updateClient("C-999", DATA))).status).toBe(404)
    expect((await caught(deleteClient("C-999"))).status).toBe(404)
  })
})
