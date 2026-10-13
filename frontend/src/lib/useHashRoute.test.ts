import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { parseHash, toHash, useHashRoute } from "@/lib/useHashRoute"

describe("rutas por hash", () => {
  it("interpreta cada pantalla y usa Cartera por defecto", () => {
    expect(parseHash("")).toEqual({ page: "cartera" })
    expect(parseHash("#/desconocida")).toEqual({ page: "cartera" })
    expect(parseHash("#/categorias")).toEqual({ page: "categorias" })
    expect(parseHash("#/nuevo")).toEqual({ page: "nuevo" })
    expect(parseHash("#/configuracion")).toEqual({ page: "configuracion" })
  })

  it("lee y escribe el id de cliente codificado", () => {
    expect(parseHash("#/cartera/A%2FB")).toEqual({ page: "cartera", clientId: "A/B" })
    expect(toHash({ page: "cartera", clientId: "A/B" })).toBe("#/cartera/A%2FB")
  })

  it("navega y reemplaza el hash", () => {
    const { result } = renderHook(() => useHashRoute())
    act(() => result.current.navigate({ page: "nuevo" }, { replace: true }))
    expect(window.location.hash).toBe("#/nuevo")
    expect(result.current.route).toEqual({ page: "nuevo" })
  })
})
