import { AlertTriangle } from "lucide-react"

import { getClientScore } from "@/api/client"
import { useApi } from "@/api/useApi"
import LevelBadge from "@/components/LevelBadge"
import ScoreRing from "@/components/ScoreRing"
import StatePanel from "@/components/StatePanel"
import SubScoreBars from "@/components/SubScoreBars"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { METRIC_VIEWS, displayName, formatCuil, formatMetric, groupOf, initials } from "@/lib/display"

function Body({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { state, reload } = useApi((signal) => getClientScore(clientId, signal), [clientId])

  if (state.status === "loading") return <StatePanel type="loading" bare />
  if (state.status === "error") {
    if (state.error.status !== 404) return <StatePanel type="error" bare retry={reload} />
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="bg-risk-soft text-risk grid size-11 place-items-center rounded-xl">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold">Cliente no encontrado</h2>
        <p className="text-muted-foreground text-sm">Este cliente ya no está disponible.</p>
        <Button variant="secondary" onClick={onClose}>
          Volver a la cartera
        </Button>
      </div>
    )
  }

  const client = state.data
  const name = displayName(client)
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-brand-soft text-brand grid size-12 place-items-center rounded-xl text-sm font-bold">
            {initials(name)}
          </span>
          <div>
            <h2 className="text-lg font-semibold">{name}</h2>
            <p className="text-muted-foreground text-sm">
              {client.client_id} · <span className="font-mono">{formatCuil(client.cuil)}</span>
            </p>
          </div>
        </div>
        <LevelBadge group={groupOf(client)} />
      </div>

      {client.result && (
        <div className="flex items-center gap-5">
          <ScoreRing score={client.result.score} group={client.result.level} />
          <p className="text-muted-foreground text-sm">
            Calculado con la configuración y señales más recientes.
          </p>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold">Señales de salud</h3>
        <dl className="grid grid-cols-2 gap-3">
          {METRIC_VIEWS.map((view) => (
            <div key={view.metric} className="bg-muted rounded-lg p-3">
              <dt className="text-muted-foreground text-xs">{view.label}</dt>
              <dd className="text-lg font-semibold">
                {formatMetric(view.metric, client.metrics?.[view.metric], "detail")}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {client.result && <SubScoreBars subScores={client.result.sub_scores} />}

      {client.errors && (
        <section className="border-risk/30 bg-risk-soft flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <strong className="text-risk">Errores del registro</strong>
          {client.errors.map((error) => (
            <p key={error.field}>
              <b className="mr-2">{error.field}</b>
              {error.message}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}

export default function ClientDetailSheet({
  clientId,
  onClose,
}: {
  clientId: string
  onClose: () => void
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="p-6 pt-8">
        <div>
          <p className="text-brand text-xs font-bold tracking-widest uppercase">Detalle del cliente</p>
          <SheetTitle className="sr-only">Detalle del cliente</SheetTitle>
          <SheetDescription className="sr-only">
            Score, nivel, señales de salud y errores del cliente {clientId}
          </SheetDescription>
        </div>
        <Body clientId={clientId} onClose={onClose} />
      </SheetContent>
    </Sheet>
  )
}
