import { useCallback, useRef } from "react"

import { getPortfolio } from "@/api/client"
import { useApi } from "@/api/useApi"
import AppHeader from "@/components/AppHeader"
import MobileNav from "@/components/MobileNav"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useHashRoute } from "@/lib/useHashRoute"
import { useTheme } from "@/lib/useTheme"
import CategoriesPage from "@/pages/categories/CategoriesPage"
import ClientDetailSheet from "@/pages/client-detail/ClientDetailSheet"
import ConfigPage from "@/pages/config/ConfigPage"
import NewClientPage from "@/pages/new-client/NewClientPage"
import PortfolioPage from "@/pages/portfolio/PortfolioPage"

export default function App() {
  const { theme, toggle } = useTheme()
  const { route, navigate } = useHashRoute()
  // Una sola carga compartida: Cartera y Por categoría muestran siempre los mismos conteos.
  const portfolio = useApi(getPortfolio, [])
  const openedFromTable = useRef(false)

  const openClient = useCallback(
    (clientId: string) => {
      openedFromTable.current = true
      navigate({ page: "cartera", clientId })
    },
    [navigate],
  )

  const closeClient = useCallback(() => {
    if (openedFromTable.current) {
      openedFromTable.current = false
      window.history.back()
    } else {
      navigate({ page: "cartera" }, { replace: true })
    }
  }, [navigate])

  return (
    <TooltipProvider>
      <AppHeader page={route.page} theme={theme} onToggleTheme={toggle} />
      <main className="mx-auto w-[min(1440px,92vw)] pt-10 pb-28 md:pt-12 md:pb-20">
        {route.page === "cartera" && (
          <PortfolioPage
            state={portfolio.state}
            reload={portfolio.reload}
            loadedAt={portfolio.loadedAt}
            onOpenClient={openClient}
          />
        )}
        {route.page === "categorias" && (
          <CategoriesPage state={portfolio.state} reload={portfolio.reload} />
        )}
        {route.page === "nuevo" && <NewClientPage />}
        {route.page === "configuracion" && <ConfigPage />}
      </main>
      {route.page === "cartera" && route.clientId !== undefined && (
        <ClientDetailSheet clientId={route.clientId} onClose={closeClient} />
      )}
      <MobileNav page={route.page} />
    </TooltipProvider>
  )
}
