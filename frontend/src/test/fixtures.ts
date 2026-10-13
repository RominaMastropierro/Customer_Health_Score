// Datos ficticios solo para tests (FR-005: la app no contiene datos de ejemplo).
// Nombres tomados de data/clients.json.

import { vi } from "vitest"

import type { MetricRange, PortfolioResult, ScoringConfig } from "@/api/types"

export const portfolioFixture: PortfolioResult = {
  results: [
    {
      client_id: "C-001",
      name: "Acme Ficticia",
      metrics: { usage: 90, support_tickets: 0, nps: 9, days_to_renewal: 300 },
      result: {
        score: 95,
        level: "Top",
        sub_scores: { usage: 90, support_tickets: 100, nps: 90, renewal: 100 },
      },
      errors: null,
    },
    {
      client_id: "C-002",
      name: "Globex Demo",
      metrics: { usage: 60, support_tickets: 3, nps: 7, days_to_renewal: 90 },
      result: {
        score: 63,
        level: "Estable",
        sub_scores: { usage: 60, support_tickets: 70, nps: 70, renewal: 50 },
      },
      errors: null,
    },
    {
      client_id: "C-003",
      name: "Initech Inventada",
      metrics: { usage: 10, support_tickets: 15, nps: 2, days_to_renewal: 10 },
      result: {
        score: 11,
        level: "En riesgo",
        sub_scores: { usage: 10, support_tickets: 0, nps: 20, renewal: 5.56 },
      },
      errors: null,
    },
    {
      client_id: "C-004",
      name: "Umbrella Ejemplo",
      metrics: { usage: 40, support_tickets: 6, nps: 5, days_to_renewal: 60 },
      result: {
        score: 42,
        level: "En riesgo",
        sub_scores: { usage: 40, support_tickets: 40, nps: 50, renewal: 33.33 },
      },
      errors: null,
    },
    {
      client_id: "C-005",
      name: null,
      metrics: { usage: 120, support_tickets: 1, nps: 8, days_to_renewal: 60 },
      result: null,
      errors: [{ field: "metrics.usage", message: "debe ser un entero entre 0 y 100" }],
    },
  ],
  summary: { total: 5, by_level: { Top: 1, Estable: 1, "En riesgo": 2 }, invalid: 1 },
}

export const configFixture: ScoringConfig = {
  weights: { usage: 25, support_tickets: 25, nps: 25, renewal: 25 },
  thresholds: { top: 75, at_risk: 50 },
  normalization: { ticket_cap: 10, renewal_horizon_days: 180 },
}

export const metricsFixture: MetricRange[] = [
  { name: "usage", min: 0, max: 100, message: "debe ser un entero entre 0 y 100" },
  { name: "support_tickets", min: 0, max: null, message: "debe ser un entero mayor o igual a 0" },
  { name: "nps", min: 0, max: 10, message: "debe ser un entero entre 0 y 10" },
  { name: "days_to_renewal", min: 0, max: null, message: "debe ser un entero mayor o igual a 0" },
]

export type StubRoute =
  | { status: number; body?: unknown }
  | ((init?: RequestInit) => Promise<Response>)

export interface FetchCall {
  key: string
  init?: RequestInit
}

/** Reemplaza fetch con rutas fijas, p. ej. { "GET /api/portfolio": { status: 200, body } }. */
export function stubFetch(routes: Record<string, StubRoute>) {
  const calls: FetchCall[] = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url
    const key = `${init?.method ?? "GET"} ${url}`
    calls.push({ key, init })
    const route = routes[key]
    if (!route) return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 })
    if (typeof route === "function") return route(init)
    return new Response(route.body === undefined ? "" : JSON.stringify(route.body), {
      status: route.status,
      headers: { "Content-Type": "application/json" },
    })
  })
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return { calls, fetchMock }
}

/** Una promesa que no se resuelve nunca, para observar estados "en curso". */
export function pending(): Promise<Response> {
  return new Promise(() => {})
}
