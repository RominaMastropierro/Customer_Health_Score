import { useCallback, useEffect, useState } from "react"

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

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
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

  return { route, navigate }
}
