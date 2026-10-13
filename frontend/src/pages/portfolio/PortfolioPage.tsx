import { useState } from "react"

import type { PortfolioResult } from "@/api/types"
import type { RemoteState } from "@/api/useApi"
import PageHeader from "@/components/PageHeader"
import StatePanel from "@/components/StatePanel"
import { Button } from "@/components/ui/button"
import ClientsTable, { type TableState } from "@/pages/portfolio/ClientsTable"
import DistributionChart from "@/pages/portfolio/DistributionChart"
import KpiCards from "@/pages/portfolio/KpiCards"

const TIME = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" })

export default function PortfolioPage({
  state,
  reload,
  loadedAt,
  onOpenClient,
}: {
  state: RemoteState<PortfolioResult>
  reload: () => void
  loadedAt: Date | null
  onOpenClient: (clientId: string) => void
}) {
  // Vive aquí para que abrir y cerrar el detalle no pierda búsqueda, filtro ni orden (FR-020).
  const [table, setTable] = useState<TableState>({ query: "", group: "Todas", ascending: false })

  if (state.status === "loading") return <StatePanel type="loading" />
  if (state.status === "error") return <StatePanel type="error" retry={reload} />

  const { results, summary } = state.data
  return (
    <>
      <PageHeader
        eyebrow="Vista general"
        title="Cartera de clientes"
        description="Supervisa la salud de tu cartera y detecta cuentas que necesitan atención."
        action={
          <Button variant="secondary" onClick={reload} aria-label="Actualizar cartera">
            <span aria-hidden="true" className="bg-top size-2 rounded-full" />
            Actualizado {loadedAt ? TIME.format(loadedAt) : "ahora"}
          </Button>
        }
      />
      <KpiCards summary={summary} />
      {summary.total === 0 ? (
        <StatePanel type="empty" />
      ) : (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(280px,1fr)_2fr]">
          <DistributionChart summary={summary} />
          <ClientsTable
            results={results}
            state={table}
            onStateChange={setTable}
            onOpen={onOpenClient}
          />
        </section>
      )}
    </>
  )
}
