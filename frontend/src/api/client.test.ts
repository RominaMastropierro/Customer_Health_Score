import { describe, expect, it } from "vitest"

import { ApiError, getClientScore, getPortfolio, postScore } from "@/api/client"
import { portfolioFixture, stubFetch } from "@/test/fixtures"

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
