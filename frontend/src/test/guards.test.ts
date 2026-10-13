import { describe, expect, it } from "vitest"

// Principio VI: los rangos de las métricas solo se definen en el motor y llegan por GET /metrics.
// FR-005: la app no contiene datos de ejemplo; los nombres ficticios solo viven en src/test.
const sources = import.meta.glob(["/src/**/*.{ts,tsx}", "!/src/test/**", "!/src/**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

describe("guardas del frontend", () => {
  it("encuentra los archivos de la app", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10)
  })

  it.each([/min=\{0\}/, /max=\{100\}/, /max=\{10\}/, /length:\s*11/])(
    "no escribe rangos de métricas a mano (%s)",
    (pattern) => {
      const offending = Object.entries(sources)
        .filter(([path]) => path.startsWith("/src/pages/"))
        .filter(([, code]) => pattern.test(code))
        .map(([path]) => path)
      expect(offending).toEqual([])
    },
  )

  it("no incluye datos de ejemplo", () => {
    const offending = Object.entries(sources)
      .filter(([, code]) => /Acme Ficticia|Globex|Initech|Umbrella|mockClients|mockApi/.test(code))
      .map(([path]) => path)
    expect(offending).toEqual([])
  })
})
