import { useCallback, useEffect, useRef, useState } from "react"

// Navegación por hash sin biblioteca de ruteo (research D6).

export type Page = "cartera" | "categorias" | "nuevo" | "configuracion"

export interface Route {
  page: Page
  clientId?: string
}

const PAGES: readonly Page[] = ["cartera", "categorias", "nuevo", "configuracion"]

export function parseHash(hash: string): Route {
  const [page, ...rest] = hash.replace(/^#\/?/, "").split("/")
  if (page === "cartera" && rest.length > 0 && rest.join("/") !== "") {
    return { page: "cartera", clientId: decodeURIComponent(rest.join("/")) }
  }
  return { page: PAGES.includes(page as Page) ? (page as Page) : "cartera" }
}

export function toHash(route: Route): string {
  return route.clientId !== undefined
    ? `#/${route.page}/${encodeURIComponent(route.clientId)}`
    : `#/${route.page}`
}

/**
 * `blocker` devuelve true cuando hay cambios sin guardar (spec 004, FR-009): el cambio de hash
 * se revierte y la ruta pedida queda en `pendingRoute` hasta que se confirme o se cancele.
 */
export function useHashRoute(blocker?: () => boolean) {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  const [pendingRoute, setPendingRoute] = useState<Route | null>(null)
  const routeRef = useRef(route)
  const blockerRef = useRef(blocker)
  const allowRef = useRef(false)
  const pendingRef = useRef<Route | null>(null)
  blockerRef.current = blocker

  useEffect(() => {
    const onChange = () => {
      const next = parseHash(window.location.hash)
      const current = routeRef.current
      // Revertir el hash con replaceState vuelve a avisar en algunos entornos: no es una navegación.
      if (toHash(next) === toHash(current)) return
      if (!allowRef.current && blockerRef.current?.()) {
        window.history.replaceState(null, "", toHash(current))
        pendingRef.current = next
        setPendingRoute(next)
        return
      }
      allowRef.current = false
      routeRef.current = next
      setRoute(next)
    }
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])

  const navigate = useCallback((next: Route, options: { replace?: boolean } = {}) => {
    const hash = toHash(next)
    if (options.replace) {
      // replaceState no dispara hashchange: se avisa a mano para que todos los oyentes se enteren.
      window.history.replaceState(null, "", hash)
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    } else {
      window.location.hash = hash
    }
  }, [])

  // Las navegaciones que inicia la app después de "Descartar" no pueden depender de que React ya
  // haya actualizado el estado que lee el blocker: se deja pasar el próximo cambio sin consultarlo.
  const allowNext = useCallback(() => {
    allowRef.current = true
  }, [])

  // replace: la entrada que agregó la navegación bloqueada ya se revirtió al hash anterior, así
  // que se reemplaza por la ruta pedida y "atrás" vuelve a donde estaba la persona.
  const confirmPending = useCallback(() => {
    const pending = pendingRef.current
    pendingRef.current = null
    setPendingRoute(null)
    if (pending) {
      allowRef.current = true
      navigate(pending, { replace: true })
    }
  }, [navigate])

  const cancelPending = useCallback(() => {
    pendingRef.current = null
    setPendingRoute(null)
  }, [])

  return { route, navigate, pendingRoute, allowNext, confirmPending, cancelPending }
}
