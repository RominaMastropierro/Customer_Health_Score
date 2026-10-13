import type { PortfolioResult } from "@/api/types"
import type { RemoteState } from "@/api/useApi"
import PageHeader from "@/components/PageHeader"
import StatePanel from "@/components/StatePanel"
import { DISPLAY_GROUPS, groupCount, groupOf, percent } from "@/lib/display"
import CategoryColumn from "@/pages/categories/CategoryColumn"

export default function CategoriesPage({
  state,
  reload,
}: {
  state: RemoteState<PortfolioResult>
  reload: () => void
}) {
  const header = (
    <PageHeader
      eyebrow="Segmentación"
      title="Clientes por categoría"
      description="Prioriza el trabajo del equipo según el nivel de salud de cada cuenta."
    />
  )
  if (state.status === "loading") return <StatePanel type="loading" />
  if (state.status === "error") return <StatePanel type="error" retry={reload} />

  const { results, summary } = state.data
  if (summary.total === 0) {
    return (
      <>
        {header}
        <StatePanel type="empty" />
      </>
    )
  }
  return (
    <>
      {header}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {DISPLAY_GROUPS.map((group) => {
          const count = groupCount(summary, group)
          return (
            <CategoryColumn
              key={group}
              group={group}
              count={count}
              share={percent(count, summary.total)}
              clients={results.filter((entry) => groupOf(entry) === group)}
            />
          )
        })}
      </div>
    </>
  )
}
