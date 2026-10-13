import { useState } from "react"

import type { ClientScoreResult } from "@/api/types"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { GROUP_TONE, TONE_CLASSES, type DisplayGroup } from "@/lib/display"
import { cn } from "@/lib/utils"
import ClientCard from "@/pages/categories/ClientCard"

export default function CategoryColumn({
  group,
  count,
  share,
  clients,
}: {
  group: DisplayGroup
  count: number
  share: number
  clients: ClientScoreResult[]
}) {
  const [open, setOpen] = useState(true)
  const tone = TONE_CLASSES[GROUP_TONE[group]]
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      asChild
    >
      <section
        aria-label={group}
        className={cn("bg-muted/60 flex flex-col gap-3 rounded-xl border border-t-4 p-3", tone.border)}
      >
        <CollapsibleTrigger className="focus-visible:ring-ring/50 flex w-full cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-[3px]">
          <span aria-hidden="true" className={cn("size-2.5 rounded-full", tone.bg)} />
          <strong>{group}</strong>
          <b className="bg-card rounded-full border px-2 text-xs">{count}</b>
          <span className="text-muted-foreground ml-auto text-xs">{share.toFixed(1)}%</span>
          <i aria-hidden="true" className="text-muted-foreground w-4 text-center not-italic">
            {open ? "−" : "+"}
          </i>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2.5">
          {clients.length ? (
            clients.map((entry, index) => (
              <ClientCard key={entry.client_id ?? `sin-id-${index}`} entry={entry} />
            ))
          ) : (
            <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              Sin clientes en esta categoría
            </div>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}
