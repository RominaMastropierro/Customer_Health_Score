// Tipos del contrato HTTP (specs/002-health-score-dashboard/data-model.md §2).
// Mismos nombres de campo que el OpenAPI de la API.

export type MetricName = "usage" | "support_tickets" | "nps" | "days_to_renewal"

export interface ClientMetrics {
  usage: number
  support_tickets: number
  nps: number
  days_to_renewal: number
}

// Cuerpo de POST /clients y PUT /clients/{id}: sin client_id, que lo genera el servicio.
export interface ClientData {
  cuil: string
  name: string | null
  metrics: ClientMetrics
}

// El servicio devuelve el cuil normalizado, sin guiones.
export interface ClientRecord extends ClientData {
  client_id: string
}

export interface SubScores {
  usage: number
  support_tickets: number
  nps: number
  renewal: number
}

export type HealthLevel = "Top" | "Estable" | "En riesgo"

export interface ScoreResult {
  score: number
  level: HealthLevel
  sub_scores: SubScores
}

export interface FieldError {
  field: string
  message: string
}

export interface ClientScoreResult {
  client_id: string | null
  // Solo en la cartera almacenada (spec 003); ausente o null en otras respuestas.
  cuil?: string | null
  name: string | null
  metrics: Record<string, unknown> | null
  result: ScoreResult | null
  errors: FieldError[] | null
}

export interface PortfolioSummary {
  total: number
  by_level: Record<HealthLevel, number>
  invalid: number
}

export interface PortfolioResult {
  results: ClientScoreResult[]
  summary: PortfolioSummary
}

export interface ScoringConfig {
  weights: { usage: number; support_tickets: number; nps: number; renewal: number }
  thresholds: { top: number; at_risk: number }
  normalization: { ticket_cap: number; renewal_horizon_days: number }
}

export interface MetricRange {
  name: MetricName
  min: number
  max: number | null
  message: string
}

// Consulta al BCRA (spec 005): el dashboard muestra `message` tal como llega.
export type CreditStatusKind = "with_debts" | "no_data" | "bcra_unavailable" | "summary_unavailable"

export type CreditTone = "positive" | "warning" | "risk"

export interface CreditStatus {
  status: CreditStatusKind
  tone: CreditTone | null
  message: string
}
