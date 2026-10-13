import { Cell, Pie, PieChart } from "recharts"

import type { PortfolioSummary } from "@/api/types"
import StatePanel from "@/components/StatePanel"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DISPLAY_GROUPS,
  GROUP_TONE,
  TONE_CLASSES,
  TONE_COLOR,
  groupCount,
  percent,
} from "@/lib/display"
import { cn } from "@/lib/utils"

const SIZE = 200

export default function DistributionChart({ summary }: { summary: PortfolioSummary }) {
  const slices = DISPLAY_GROUPS.map((group) => ({
    group,
    count: groupCount(summary, group),
    color: TONE_COLOR[GROUP_TONE[group]],
  }))

  return (
    <Card className="h-fit">
      <CardHeader className="flex-col gap-1">
        <CardTitle>Distribución de salud</CardTitle>
        <CardDescription>Clientes por categoría</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {summary.total === 0 ? (
          <StatePanel type="empty" bare />
        ) : (
          <>
            <div
              role="img"
              aria-label="Distribución de clientes por categoría"
              className="relative mx-auto"
              style={{ width: SIZE, height: SIZE }}
            >
              <PieChart width={SIZE} height={SIZE}>
                <Pie
                  data={slices.filter((s) => s.count > 0)}
                  dataKey="count"
                  nameKey="group"
                  innerRadius={SIZE * 0.34}
                  outerRadius={SIZE / 2}
                  paddingAngle={1}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={false}
                >
                  {slices
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <Cell key={s.group} fill={s.color} />
                    ))}
                </Pie>
              </PieChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <strong className="text-3xl font-bold">{summary.total}</strong>
                <span className="text-muted-foreground text-xs">clientes</span>
              </div>
            </div>
            <ul className="flex flex-col gap-2.5">
              {slices.map(({ group, count }) => (
                <li key={group} className="grid grid-cols-[auto_1fr_auto_3.5rem] items-center gap-2.5 text-sm">
                  <span
                    aria-hidden="true"
                    className={cn("size-2.5 rounded-full", TONE_CLASSES[GROUP_TONE[group]].bg)}
                  />
                  <span>{group}</span>
                  <strong>{count}</strong>
                  <small className="text-muted-foreground text-right">
                    {percent(count, summary.total).toFixed(1)}%
                  </small>
                </li>
              ))}
            </ul>
            <div aria-label="Distribución porcentual" className="flex h-2 overflow-hidden rounded-full">
              {slices
                .filter((s) => s.count > 0)
                .map(({ group, count }) => (
                  <span
                    key={group}
                    className={TONE_CLASSES[GROUP_TONE[group]].bg}
                    style={{ width: `${percent(count, summary.total)}%` }}
                    title={`${group}: ${percent(count, summary.total).toFixed(1)}%`}
                  />
                ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
