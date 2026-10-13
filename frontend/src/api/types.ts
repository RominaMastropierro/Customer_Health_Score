// Tipos del contrato HTTP (specs/002-health-score-dashboard/data-model.md §2).
// Mismos nombres de campo que el OpenAPI de la API.

export type MetricName = "usage" | "support_tickets" | "nps" | "days_to_renewal"

export interface ClientMetrics {
  usage: number
  support_tickets: number
  nps: number
  days_to_renewal: number
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
