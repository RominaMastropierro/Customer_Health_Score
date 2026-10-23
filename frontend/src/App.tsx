import { useCallback, useEffect, useRef, useState } from "react"

import { getPortfolio } from "@/api/client"
import { useApi } from "@/api/useApi"
import AppHeader from "@/components/AppHeader"
import MobileNav from "@/components/MobileNav"
import Notice, { type NoticeContent } from "@/components/Notice"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { formatCuil } from "@/lib/display"
import { toHash, useHashRoute } from "@/lib/useHashRoute"
import { useTheme } from "@/lib/useTheme"
import CategoriesPage from "@/pages/categories/CategoriesPage"
import ClientDetailSheet from "@/pages/client-detail/ClientDetailSheet"
import ConfigPage from "@/pages/config/ConfigPage"
import NewClientPage from "@/pages/new-client/NewClientPage"
import PortfolioPage from "@/pages/portfolio/PortfolioPage"

export default function App() {
  const { theme, toggle } = useTheme()
  // Ref espejo de "hay cambios sin guardar en el detalle": el bloqueo de navegación y el cierre
  // del panel la leen en el momento, sin esperar a que React vuelva a renderizar.
  const detailDirty = useRef(false)
  const { route, navigate, pendingRoute, allowNext, confirmPending, cancelPending } = useHashRoute(
    () => detailDirty.current,
  )
  // Una sola carga compartida: Cartera y Por categoría muestran siempre los mismos conteos.
  const portfolio = useApi(getPortfolio, [])
  const openedFromTable = useRef(false)
  const [notice, setNotice] = useState<NoticeContent | null>(null)
  const [discardOnClose, setDiscardOnClose] = useState(false)

  const setDetailDirty = useCallback((dirty: boolean) => {
    detailDirty.current = dirty
  }, [])

  // El aviso de una operación pertenece a la pantalla donde ocurrió.
  useEffect(() => setNotice(null), [route.page])

  const openClient = useCallback(
    (clientId: string) => {
      openedFromTable.current = true
      navigate({ page: "cartera", clientId })
    },
    [navigate],
  )

  const doCloseClient = useCallback(() => {
    if (openedFromTable.current) {
      openedFromTable.current = false
      window.history.back()
    } else {
      navigate({ page: "cartera" }, { replace: true })
    }
  }, [navigate])

  const closeClient = useCallback(() => {
    if (detailDirty.current) setDiscardOnClose(true)
    else doCloseClient()
  }, [doCloseClient])

  const keepEditing = () => {
    setDiscardOnClose(false)
    cancelPending()
  }

  const discardChanges = () => {
    detailDirty.current = false
    if (discardOnClose) {
      setDiscardOnClose(false)
      allowNext()
      doCloseClient()
    } else {
      confirmPending()
    }
  }

  return (
    <TooltipProvider>
      <AppHeader page={route.page} theme={theme} onToggleTheme={toggle} />
      <main className="mx-auto w-[min(1440px,92vw)] pt-10 pb-28 md:pt-12 md:pb-20">
        {notice && <Notice {...notice} onClose={() => setNotice(null)} />}
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
        {route.page === "nuevo" && (
          <NewClientPage
            onClientsChanged={portfolio.reload}
            onSaved={(record) =>
              setNotice({
                // "Cliente nuevo" y no displayName: sin nombre, displayName mostraría el UUID.
                text: `Cliente guardado: ${record.name ?? "Cliente nuevo"} · ${formatCuil(record.cuil)}`,
                action: {
                  label: "Ver en la cartera",
                  href: toHash({ page: "cartera", clientId: record.client_id }),
                },
              })
            }
          />
        )}
        {route.page === "configuracion" && <ConfigPage />}
      </main>
      {route.page === "cartera" && route.clientId !== undefined && (
        <ClientDetailSheet
          clientId={route.clientId}
          onClose={closeClient}
          onClientsChanged={portfolio.reload}
          onNotice={(text) => setNotice({ text })}
          onDirtyChange={setDetailDirty}
          onDeleted={(name) => {
            // replace: la entrada del detalle de un cliente eliminado no debe quedar en "atrás".
            openedFromTable.current = false
            navigate({ page: "cartera" }, { replace: true })
            setNotice({ text: `Cliente eliminado: ${name}` })
            portfolio.reload()
          }}
        />
      )}
      <AlertDialog
        open={discardOnClose || pendingRoute !== null}
        onOpenChange={(open) => !open && keepEditing()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>Los cambios sin guardar se perderán.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction onClick={discardChanges}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <MobileNav page={route.page} />
    </TooltipProvider>
  )
}
