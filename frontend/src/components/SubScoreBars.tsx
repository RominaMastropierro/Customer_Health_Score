import type { SubScores } from "@/api/types"
import { Progress } from "@/components/ui/progress"
import { METRIC_VIEWS } from "@/lib/display"

export default function SubScoreBars({ subScores }: { subScores: SubScores }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">Desglose del score</h3>
      {METRIC_VIEWS.map((view) => {
        const value = subScores[view.subScore]
        return (
          <div key={view.metric} className="flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{view.label}</span>
              <strong>{value}</strong>
            </div>
            <Progress value={value} aria-label={view.label} />
          </div>
        )
      })}
    </section>
  )
}
