import { getConfig } from "@/api/client"
import { useApi } from "@/api/useApi"
import LevelBadge from "@/components/LevelBadge"
import PageHeader from "@/components/PageHeader"
import StatePanel from "@/components/StatePanel"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { METRIC_VIEWS, percent } from "@/lib/display"

export default function ConfigPage() {
  const { state, reload } = useApi(getConfig, [])

  const header = (
    <PageHeader
      eyebrow="Modelo de salud"
      title="Configuración activa"
      description="Pesos y umbrales con los que se calculan los scores. Se editan en el archivo de configuración del servicio."
    />
  )
  if (state.status === "loading") return <StatePanel type="loading" />
  if (state.status === "error") return <StatePanel type="error" retry={reload} />

  const { weights, thresholds, normalization } = state.data
  const totalWeight = METRIC_VIEWS.reduce((sum, view) => sum + weights[view.subScore], 0)

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>Pesos</CardTitle>
            <CardDescription>Importancia de cada métrica en el score</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {METRIC_VIEWS.map((view) => {
              const share = percent(weights[view.subScore], totalWeight)
              const label = `${Number(share.toFixed(1))} %`
              return (
                <div key={view.metric} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{view.label}</span>
                    <strong>{label}</strong>
                  </div>
                  <Progress value={share} aria-label={`Peso de ${view.label}: ${label}`} />
                </div>
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>Umbrales</CardTitle>
            <CardDescription>Puntos de corte entre niveles</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4 text-sm">
              <li className="flex items-center justify-between gap-3">
                <LevelBadge group="Top" />
                <span>
                  score ≥ <strong>{thresholds.top}</strong>
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <LevelBadge group="Estable" />
                <span>
                  entre <strong>{thresholds.at_risk}</strong> y <strong>{thresholds.top - 1}</strong>
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <LevelBadge group="En riesgo" />
                <span>
                  score &lt; <strong>{thresholds.at_risk}</strong>
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-col gap-1">
            <CardTitle>Normalización</CardTitle>
            <CardDescription>Cómo se llevan las métricas a 0–100</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Tope de tickets</dt>
                <dd>
                  <strong>{normalization.ticket_cap}</strong> tickets
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Horizonte de renovación</dt>
                <dd>
                  <strong>{normalization.renewal_horizon_days}</strong> días
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
