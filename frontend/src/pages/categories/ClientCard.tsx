import { AlertTriangle } from "lucide-react"

import type { ClientScoreResult } from "@/api/types"
import { displayName, initials, weakestMetric } from "@/lib/display"

export default function ClientCard({ entry }: { entry: ClientScoreResult }) {
  const name = displayName(entry)
  const weakest = entry.result ? weakestMetric(entry.result.sub_scores) : null
  return (
    <article className="bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-xs">
      <div className="flex items-center gap-3">
        <span className="bg-brand-soft text-brand grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold">
          {initials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm">{name}</strong>
          <span className="text-muted-foreground text-xs">{entry.client_id}</span>
        </div>
        <b className="text-xl">{entry.result ? entry.result.score : "—"}</b>
      </div>
      {weakest ? (
        <div className="bg-muted flex items-center justify-between rounded-md px-3 py-2 text-xs">
          <span className="text-muted-foreground">Métrica más débil</span>
          <strong className="flex gap-2">
            {weakest.view.label}
            <b>{weakest.value}</b>
          </strong>
        </div>
      ) : (
        <p className="text-risk flex items-center gap-1.5 text-xs">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {entry.errors?.length ?? 0} errores de validación
        </p>
      )}
    </article>
  )
}
