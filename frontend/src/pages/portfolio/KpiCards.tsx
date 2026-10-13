import { Users } from "lucide-react"

import type { PortfolioSummary } from "@/api/types"
import { Card } from "@/components/ui/card"
import { DISPLAY_GROUPS, GROUP_TONE, TONE_CLASSES, groupCount, percent } from "@/lib/display"
import { cn } from "@/lib/utils"

export default function KpiCards({ summary }: { summary: PortfolioSummary }) {
  return (
    <section
      aria-label="Indicadores de la cartera"
      className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      <Card className="flex-row items-center gap-4 px-5 py-5">
        <span className="bg-brand-soft text-brand grid size-11 shrink-0 place-items-center rounded-xl">
          <Users className="size-5" aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <span className="text-muted-foreground text-sm">Total clientes</span>
          <strong className="text-3xl font-bold tracking-tight">{summary.total}</strong>
          <small className="text-faint text-xs">Cartera activa</small>
        </div>
      </Card>
      {DISPLAY_GROUPS.map((group) => {
        const count = groupCount(summary, group)
        return (
          <Card key={group} className="relative gap-1 overflow-hidden px-5 py-5">
            <span className="text-muted-foreground text-sm">{group}</span>
            <strong className="text-3xl font-bold tracking-tight">{count}</strong>
            <small className="text-faint text-xs">
              {percent(count, summary.total).toFixed(0)}% del total
            </small>
            <span
              aria-hidden="true"
              className={cn("absolute inset-x-0 bottom-0 h-1", TONE_CLASSES[GROUP_TONE[group]].bg)}
            />
          </Card>
        )
      })}
    </section>
  )
}
