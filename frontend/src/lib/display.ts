// Solo presentación (research D8): agrupa, etiqueta y formatea valores que ya devolvió la API.
// Nada de aquí calcula scores, niveles ni conteos por nivel.

import type {
  ClientScoreResult,
  HealthLevel,
  MetricName,
  PortfolioSummary,
  SubScores,
} from "@/api/types"

export type DisplayGroup = HealthLevel | "Inválido"

export const DISPLAY_GROUPS: readonly DisplayGroup[] = ["Top", "Estable", "En riesgo", "Inválido"]

export function groupOf(entry: ClientScoreResult): DisplayGroup {
  return entry.result?.level ?? "Inválido"
}

export function groupCount(summary: PortfolioSummary, group: DisplayGroup): number {
  return group === "Inválido" ? summary.invalid : summary.by_level[group]
}

export function percent(count: number, total: number): number {
  return total === 0 ? 0 : (count / total) * 100
}

export type Tone = "top" | "stable" | "risk" | "invalid"

export const GROUP_TONE: Record<DisplayGroup, Tone> = {
  Top: "top",
  Estable: "stable",
  "En riesgo": "risk",
  Inválido: "invalid",
}

// Clases completas para que Tailwind las detecte al compilar.
export const TONE_CLASSES: Record<Tone, { bg: string; soft: string; text: string; border: string }> = {
  top: { bg: "bg-top", soft: "bg-top-soft", text: "text-top", border: "border-t-top" },
  stable: { bg: "bg-stable", soft: "bg-stable-soft", text: "text-stable", border: "border-t-stable" },
  risk: { bg: "bg-risk", soft: "bg-risk-soft", text: "text-risk", border: "border-t-risk" },
  invalid: { bg: "bg-invalid", soft: "bg-invalid-soft", text: "text-invalid", border: "border-t-invalid" },
}

export const TONE_COLOR: Record<Tone, string> = {
  top: "var(--color-top)",
  stable: "var(--color-stable)",
  risk: "var(--color-risk)",
  invalid: "var(--color-invalid)",
}

export interface MetricView {
  metric: MetricName
  subScore: keyof SubScores
  label: string
}

// Único lugar del frontend donde la métrica days_to_renewal se une al sub-score renewal.
export const METRIC_VIEWS: readonly MetricView[] = [
  { metric: "usage", subScore: "usage", label: "Uso" },
  { metric: "support_tickets", subScore: "support_tickets", label: "Tickets" },
  { metric: "nps", subScore: "nps", label: "NPS" },
  { metric: "days_to_renewal", subScore: "renewal", label: "Renovación" },
]

export function formatMetric(
  metric: MetricName,
  value: unknown,
  context: "table" | "detail",
): string {
  if (value === undefined || value === null) return "—"
  if (typeof value !== "number") return String(value)
  switch (metric) {
    case "usage":
      return `${value}%`
    case "support_tickets":
      return String(value)
    case "nps":
      return context === "detail" ? `${value}/10` : String(value)
    case "days_to_renewal":
      return context === "detail" ? `${value} días` : `${value} d`
  }
}

export function weakestMetric(subScores: SubScores): { view: MetricView; value: number } {
  let weakest = { view: METRIC_VIEWS[0], value: subScores[METRIC_VIEWS[0].subScore] }
  for (const view of METRIC_VIEWS) {
    const value = subScores[view.subScore]
    if (value < weakest.value) weakest = { view, value }
  }
  return weakest
}

export function displayName(entry: Pick<ClientScoreResult, "name" | "client_id">): string {
  return entry.name ?? entry.client_id ?? "—"
}

export function initials(text: string): string {
  return text.slice(0, 2).toUpperCase()
}

// CUIL (spec 003): solo presentación. El valor recibido no se altera ni se envía a la API.
export function formatCuil(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—"
  if (!/^\d{11}$/.test(value)) return value
  return `${value.slice(0, 2)}-${value.slice(2, 10)}-${value.slice(10)}`
}

// Solo compara búsquedas numéricas, para que buscar un nombre no coincida por CUIL.
export function matchesCuil(cuil: string | null | undefined, query: string): boolean {
  const digits = query.trim().replace(/-/g, "")
  if (!cuil || !/^\d+$/.test(digits)) return false
  return cuil.includes(digits)
}
