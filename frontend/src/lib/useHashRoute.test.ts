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

function goTo(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent("hashchange"))
  })
}

describe("navegación con cambios sin guardar (spec 004)", () => {
  it("bloquea el cambio de hash, lo revierte y guarda la ruta pedida", () => {
    window.location.hash = "#/cartera/C-001"
    const { result } = renderHook(() => useHashRoute(() => true))
    goTo("#/categorias")
    expect(window.location.hash).toBe("#/cartera/C-001")
    expect(result.current.route).toEqual({ page: "cartera", clientId: "C-001" })
    expect(result.current.pendingRoute).toEqual({ page: "categorias" })
  })

  it("confirmPending navega a la ruta pendiente aunque el bloqueo siga activo", () => {
    window.location.hash = "#/cartera/C-001"
    const { result } = renderHook(() => useHashRoute(() => true))
    goTo("#/categorias")
    act(() => result.current.confirmPending())
    expect(result.current.route).toEqual({ page: "categorias" })
    expect(window.location.hash).toBe("#/categorias")
    expect(result.current.pendingRoute).toBeNull()
  })

  it("cancelPending descarta la ruta pendiente sin navegar", () => {
    window.location.hash = "#/cartera/C-001"
    const { result } = renderHook(() => useHashRoute(() => true))
    goTo("#/categorias")
    act(() => result.current.cancelPending())
    expect(result.current.pendingRoute).toBeNull()
    expect(result.current.route).toEqual({ page: "cartera", clientId: "C-001" })
  })

  it("allowNext deja pasar solo el siguiente cambio", () => {
    window.location.hash = "#/cartera/C-001"
    const { result } = renderHook(() => useHashRoute(() => true))
    act(() => result.current.allowNext())
    goTo("#/cartera")
    expect(result.current.route).toEqual({ page: "cartera" })
    goTo("#/nuevo")
    expect(result.current.route).toEqual({ page: "cartera" })
    expect(result.current.pendingRoute).toEqual({ page: "nuevo" })
  })

  it("sin bloqueo navega normalmente", () => {
    window.location.hash = "#/cartera"
    const { result } = renderHook(() => useHashRoute(() => false))
    goTo("#/nuevo")
    expect(result.current.route).toEqual({ page: "nuevo" })
    expect(result.current.pendingRoute).toBeNull()
  })
})
