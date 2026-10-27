import type {
  ClientData,
  ClientMetrics,
  ClientRecord,
  ClientScoreResult,
  CreditStatus,
  MetricName,
  MetricRange,
  PortfolioResult,
  ScoreResult,
  ScoringConfig,
} from "@/api/types"

// Son los nombres de campo del contrato, no reglas: los rangos llegan de GET /metrics.
const METRIC_NAMES: readonly MetricName[] = ["usage", "support_tickets", "nps", "days_to_renewal"]

/** Campos de los formularios de cliente a los que se puede asociar un error del servicio. */
export type FormField = MetricName | "cuil" | "name"

export class ApiError extends Error {
  status: number
  fieldErrors?: Partial<Record<FormField, string>>
  formErrors?: string[]

  constructor(
    status: number,
    message: string,
    details: { fieldErrors?: Partial<Record<FormField, string>>; formErrors?: string[] } = {},
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

// POST /score ubica las métricas en ["body", m]; /clients, en ["body", "metrics", m].
function fieldOf(loc: unknown[]): FormField | null {
  const [where, first, second] = loc
  if (where !== "body") return null
  if (loc.length === 2 && (first === "cuil" || first === "name")) return first
  if (loc.length === 2 && METRIC_NAMES.includes(first as MetricName)) return first as MetricName
  if (loc.length === 3 && first === "metrics" && METRIC_NAMES.includes(second as MetricName)) {
    return second as MetricName
  }
  return null
}

function validationError(body: unknown): ApiError {
  const fieldErrors: Partial<Record<FormField, string>> = {}
  const formErrors: string[] = []
  const detail = (body as { detail?: unknown })?.detail
  for (const item of Array.isArray(detail) ? (detail as ValidationItem[]) : []) {
    const field = fieldOf(item.loc ?? [])
    const message = item.msg ?? "Valor inválido"
    if (field) {
      fieldErrors[field] ??= message
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
  if (response.status === 204) return undefined as T
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

// El CUIT va en el cuerpo y no en la URL para que no quede en los access logs (research R1).
export function getCreditStatus(cuil: string, signal?: AbortSignal) {
  return request<CreditStatus>("/credit-status", { method: "POST", body: JSON.stringify({ cuil }), signal })
}

export function getConfig(signal?: AbortSignal) {
  return request<ScoringConfig>("/config", { signal })
}

export function getMetrics(signal?: AbortSignal) {
  return request<MetricRange[]>("/metrics", { signal })
}

function clientBody(data: ClientData): string {
  const body: ClientData = {
    cuil: data.cuil,
    name: data.name,
    metrics: {
      usage: data.metrics.usage,
      support_tickets: data.metrics.support_tickets,
      nps: data.metrics.nps,
      days_to_renewal: data.metrics.days_to_renewal,
    },
  }
  return JSON.stringify(body)
}

// El único otro 409 posible es la colisión del UUID generado por el servicio (spec 003),
// que no menciona el CUIL: ese queda como error general del formulario.
async function withConflictOnCuil<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error
    throw error.message.includes("CUIL")
      ? new ApiError(409, error.message, { fieldErrors: { cuil: error.message } })
      : new ApiError(409, error.message, { formErrors: [error.message] })
  }
}

// Las escrituras no reciben AbortSignal: si la persona sale de la pantalla, la operación
// termina igual y la cartera se refresca con el resultado (research R7).
export function createClient(data: ClientData) {
  return withConflictOnCuil(
    request<ClientRecord>("/clients", { method: "POST", body: clientBody(data) }),
  )
}

export function updateClient(clientId: string, data: ClientData) {
  return withConflictOnCuil(
    request<ClientRecord>(`/clients/${encodeURIComponent(clientId)}`, {
      method: "PUT",
      body: clientBody(data),
    }),
  )
}

export function deleteClient(clientId: string): Promise<void> {
  return request<void>(`/clients/${encodeURIComponent(clientId)}`, { method: "DELETE" })
}
