import type {
  ClientMetrics,
  ClientScoreResult,
  MetricName,
  MetricRange,
  PortfolioResult,
  ScoreResult,
  ScoringConfig,
} from "@/api/types"

// Son los nombres de campo del contrato, no reglas: los rangos llegan de GET /metrics.
const METRIC_NAMES: readonly MetricName[] = ["usage", "support_tickets", "nps", "days_to_renewal"]

export class ApiError extends Error {
  status: number
  fieldErrors?: Partial<Record<MetricName, string>>
  formErrors?: string[]

  constructor(
    status: number,
    message: string,
    details: { fieldErrors?: Partial<Record<MetricName, string>>; formErrors?: string[] } = {},
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.fieldErrors = details.fieldErrors
    this.formErrors = details.formErrors
  }
}

interface ValidationItem {
  loc?: unknown[]
  msg?: string
}

function validationError(body: unknown): ApiError {
  const fieldErrors: Partial<Record<MetricName, string>> = {}
  const formErrors: string[] = []
  const detail = (body as { detail?: unknown })?.detail
  for (const item of Array.isArray(detail) ? (detail as ValidationItem[]) : []) {
    const [where, field] = item.loc ?? []
    const message = item.msg ?? "Valor inválido"
    if (where === "body" && METRIC_NAMES.includes(field as MetricName)) {
      fieldErrors[field as MetricName] ??= message
    } else {
      formErrors.push(message)
    }
  }
  return new ApiError(422, "Datos no válidos", { fieldErrors, formErrors })
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError(0, "No se pudo conectar con el servicio")
  }
  const body = await readJson(response)
  if (response.ok) {
    if (body === undefined) throw new ApiError(response.status, "Respuesta inesperada del servicio")
    return body as T
  }
  if (response.status === 422) throw validationError(body)
  const detail = (body as { detail?: unknown })?.detail
  throw new ApiError(response.status, typeof detail === "string" ? detail : `Error ${response.status}`)
}

export function getPortfolio(signal?: AbortSignal) {
  return request<PortfolioResult>("/portfolio", { signal })
}

export function getClientScore(clientId: string, signal?: AbortSignal) {
  return request<ClientScoreResult>(`/clients/${encodeURIComponent(clientId)}/score`, { signal })
}

export function postScore(metrics: ClientMetrics, signal?: AbortSignal) {
  const body: ClientMetrics = {
    usage: metrics.usage,
    support_tickets: metrics.support_tickets,
    nps: metrics.nps,
    days_to_renewal: metrics.days_to_renewal,
  }
  return request<ScoreResult>("/score", { method: "POST", body: JSON.stringify(body), signal })
}

export function getConfig(signal?: AbortSignal) {
  return request<ScoringConfig>("/config", { signal })
}

export function getMetrics(signal?: AbortSignal) {
  return request<MetricRange[]>("/metrics", { signal })
}
