import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Pencil } from "lucide-react"

import { getClientScore } from "@/api/client"
import type { ClientRecord, ClientScoreResult } from "@/api/types"
import { useApi } from "@/api/useApi"
import LevelBadge from "@/components/LevelBadge"
import ScoreRing from "@/components/ScoreRing"
import StatePanel from "@/components/StatePanel"
import SubScoreBars from "@/components/SubScoreBars"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import type { ClientFormValues } from "@/components/ClientFields"
import { CUIL_LABEL, METRIC_VIEWS, displayName, formatCuil, formatMetric, groupOf, initials } from "@/lib/display"
import ClientEditForm from "@/pages/client-detail/ClientEditForm"
import DeleteClientDialog from "@/pages/client-detail/DeleteClientDialog"

export interface DetailCallbacks {
  onClose: () => void
  onClientsChanged: () => void
  onNotice: (text: string) => void
  onDirtyChange: (dirty: boolean) => void
  onDeleted: (name: string) => void
}

function initialValues(client: ClientScoreResult): ClientFormValues {
  const metric = (name: keyof NonNullable<ClientScoreResult["metrics"]>) => {
    const value = client.metrics?.[name]
    return value === undefined || value === null ? "" : String(value)
  }
  return {
    cuil: client.cuil ? formatCuil(client.cuil) : "",
    name: client.name ?? "",
    usage: metric("usage"),
    support_tickets: metric("support_tickets"),
    nps: metric("nps"),
    days_to_renewal: metric("days_to_renewal"),
  }
}

function NotFound({ onClose }: { onClose: () => void }) {
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

function Body({
  clientId,
  onClose,
  onClientsChanged,
  onNotice,
  onDirtyChange,
  onDeleted,
}: { clientId: string } & DetailCallbacks) {
  const { state, reload } = useApi((signal) => getClientScore(clientId, signal), [clientId])
  const [mode, setMode] = useState<"view" | "edit">("view")
  const [notFound, setNotFound] = useState(false)
  const editButton = useRef<HTMLButtonElement>(null)
  const leftEdit = useRef(false)

  // Al volver de la edición, el foco regresa al botón que la abrió (FR-027).
  useEffect(() => {
    if (mode === "view" && leftEdit.current && state.status === "success") {
      leftEdit.current = false
      editButton.current?.focus()
    }
  }, [mode, state.status])

  const backToView = () => {
    leftEdit.current = true
    setMode("view")
  }

  const goneAfterWrite = () => {
    setNotFound(true)
    onClientsChanged()
  }

  if (notFound) return <NotFound onClose={onClose} />
  if (state.status === "loading") return <StatePanel type="loading" bare />
  if (state.status === "error") {
    if (state.error.status !== 404) return <StatePanel type="error" bare retry={reload} />
    return <NotFound onClose={onClose} />
  }

  const client = state.data
  if (mode === "edit") {
    return (
      <ClientEditForm
        clientId={clientId}
        initial={initialValues(client)}
        onSaved={(record: ClientRecord) => {
          backToView()
          reload()
          onClientsChanged()
          onNotice(`Cambios guardados: ${displayName(record)}`)
        }}
        onNotFound={goneAfterWrite}
        onCancel={backToView}
        onDirtyChange={onDirtyChange}
      />
    )
  }

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
              {client.client_id} ·{" "}
              <span className="font-mono">
                <span className="sr-only">{CUIL_LABEL} </span>
                {formatCuil(client.cuil)}
              </span>
            </p>
          </div>
        </div>
        <LevelBadge group={groupOf(client)} />
        <div className="flex flex-wrap gap-2">
          <Button ref={editButton} variant="secondary" onClick={() => setMode("edit")}>
            <Pencil aria-hidden="true" />
            Editar
          </Button>
          <DeleteClientDialog
            clientId={clientId}
            name={name}
            cuil={client.cuil}
            onDeleted={() => onDeleted(name)}
            onNotFound={goneAfterWrite}
          />
        </div>
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
  ...callbacks
}: { clientId: string } & DetailCallbacks) {
  const { onClose } = callbacks
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
        <Body clientId={clientId} {...callbacks} />
      </SheetContent>
    </Sheet>
  )
}
