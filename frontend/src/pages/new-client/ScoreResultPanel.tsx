import type { ScoreResult } from "@/api/types"
import LevelBadge from "@/components/LevelBadge"
import ScoreRing from "@/components/ScoreRing"
import StatePanel from "@/components/StatePanel"
import SubScoreBars from "@/components/SubScoreBars"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default function ScoreResultPanel({
  result,
  title,
  loading,
}: {
  result: ScoreResult | null
  title: string
  loading: boolean
}) {
  return (
    <Card aria-live="polite" className="h-fit gap-0 py-0">
      {loading ? (
        <StatePanel type="loading" bare title="Calculando" description="Estamos evaluando al cliente." />
      ) : result ? (
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-brand mb-1 text-xs font-bold tracking-widest uppercase">Resultado</p>
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <LevelBadge group={result.level} />
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <ScoreRing score={result.score} group={result.level} />
            <p className="text-muted-foreground text-sm">
              Score global calculado según la configuración actual.
            </p>
          </div>
          <SubScoreBars subScores={result.sub_scores} />
          <Button variant="secondary" disabled className="h-auto flex-col gap-0 py-2">
            Guardar en cartera
            <span className="text-faint text-xs font-normal">Disponible próximamente</span>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <div
            aria-hidden="true"
            className="text-faint mb-2 grid size-28 place-items-center rounded-full border-8 border-dashed text-2xl"
          >
            —
          </div>
          <h2 className="font-semibold">Tu resultado aparecerá aquí</h2>
          <p className="text-muted-foreground max-w-xs text-sm">
            Completa los datos y calcula el score para ver la salud del cliente.
          </p>
        </div>
      )}
    </Card>
  )
}
