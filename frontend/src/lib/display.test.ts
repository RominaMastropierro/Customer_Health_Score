import { describe, expect, it } from "vitest"

import {
  displayName,
  formatMetric,
  groupCount,
  groupOf,
  initials,
  percent,
  weakestMetric,
} from "@/lib/display"
import { portfolioFixture } from "@/test/fixtures"

const [top, , , , invalid] = portfolioFixture.results

describe("display", () => {
  it("agrupa por el nivel que devolvió la API, o Inválido si no hay result", () => {
    expect(groupOf(top)).toBe("Top")
    expect(groupOf(invalid)).toBe("Inválido")
  })

  it("toma los conteos del summary, sin recontar", () => {
    const summary = { total: 9, by_level: { Top: 4, Estable: 3, "En riesgo": 1 }, invalid: 1 }
    expect(groupCount(summary, "Estable")).toBe(3)
    expect(groupCount(summary, "Inválido")).toBe(1)
  })

  it("devuelve 0 % con total 0", () => {
    expect(percent(0, 0)).toBe(0)
    expect(percent(1, 4)).toBe(25)
  })

  it("muestra las métricas originales tal como llegan", () => {
    expect(formatMetric("usage", 120, "table")).toBe("120%")
    expect(formatMetric("usage", "abc", "table")).toBe("abc")
    expect(formatMetric("nps", undefined, "detail")).toBe("—")
    expect(formatMetric("nps", 7, "detail")).toBe("7/10")
    expect(formatMetric("days_to_renewal", 90, "table")).toBe("90 d")
    expect(formatMetric("days_to_renewal", 90, "detail")).toBe("90 días")
  })

  it("elige el menor sub-score como métrica más débil", () => {
    const weakest = weakestMetric({ usage: 60, support_tickets: 70, nps: 70, renewal: 50 })
    expect(weakest.view.label).toBe("Renovación")
    expect(weakest.value).toBe(50)
  })

  it("usa el id cuando no hay nombre", () => {
    expect(displayName(invalid)).toBe("C-005")
    expect(initials(displayName(invalid))).toBe("C-")
    expect(initials("Acme Ficticia")).toBe("AC")
  })
})
