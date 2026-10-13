import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"

import { GROUP_TONE, TONE_COLOR, type DisplayGroup } from "@/lib/display"

const SIZE = 132

export default function ScoreRing({ score, group }: { score: number; group: DisplayGroup }) {
  return (
    <div
      className="relative"
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label={`Score ${score} de 100`}
    >
      <RadialBarChart
        width={SIZE}
        height={SIZE}
        innerRadius="80%"
        outerRadius="100%"
        startAngle={90}
        endAngle={-270}
        data={[{ value: score }]}
      >
        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
        <RadialBar
          dataKey="value"
          cornerRadius={8}
          background={{ fill: "var(--color-muted)" }}
          fill={TONE_COLOR[GROUP_TONE[group]]}
          isAnimationActive={false}
        />
      </RadialBarChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="text-4xl leading-none font-bold tracking-tight">{score}</strong>
        <span className="text-muted-foreground mt-1 text-xs">de 100</span>
      </div>
    </div>
  )
}
