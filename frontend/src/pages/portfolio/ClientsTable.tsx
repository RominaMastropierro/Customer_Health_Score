import { useDeferredValue, useMemo } from "react"
import { AlertTriangle, ChevronRight, Search } from "lucide-react"

import type { ClientScoreResult } from "@/api/types"
import LevelBadge from "@/components/LevelBadge"
import StatePanel from "@/components/StatePanel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { DISPLAY_GROUPS, METRIC_VIEWS, displayName, formatMetric, groupOf, type DisplayGroup } from "@/lib/display"

export type GroupFilter = DisplayGroup | "Todas"

export interface TableState {
  query: string
  group: GroupFilter
  ascending: boolean
}

export default function ClientsTable({
  results,
  state,
  onStateChange,
  onOpen,
}: {
  results: ClientScoreResult[]
  state: TableState
  onStateChange: (state: TableState) => void
  onOpen: (clientId: string) => void
}) {
  const query = useDeferredValue(state.query)

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = results.filter(
      (entry) =>
        (state.group === "Todas" || groupOf(entry) === state.group) &&
        `${entry.client_id ?? ""} ${entry.name ?? ""}`.toLowerCase().includes(needle),
    )
    // Los inválidos no tienen score: siempre al final, en el orden que tenían.
    return filtered.sort((a, b) => {
      if (!a.result || !b.result) return Number(!a.result) - Number(!b.result)
      return state.ascending ? a.result.score - b.result.score : b.result.score - a.result.score
    })
  }, [results, query, state.group, state.ascending])

  return (
    <Card className="min-w-0 gap-0 py-0">
      <div className="flex flex-col gap-4 border-b p-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="font-semibold">Todos los clientes</h2>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {rows.length} resultados
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 sm:flex-none">
            <span className="sr-only">Buscar cliente</span>
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              value={state.query}
              onChange={(e) => onStateChange({ ...state, query: e.target.value })}
              placeholder="Buscar cliente"
              className="pl-9 sm:w-56"
            />
          </label>
          <Select
            value={state.group}
            onValueChange={(value) => onStateChange({ ...state, group: value as GroupFilter })}
          >
            <SelectTrigger aria-label="Filtrar por categoría" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas</SelectItem>
              {DISPLAY_GROUPS.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            className="h-10"
            onClick={() => onStateChange({ ...state, ascending: !state.ascending })}
            aria-label={`Ordenar por score ${state.ascending ? "descendente" : "ascendente"}`}
          >
            Score <span aria-hidden="true">{state.ascending ? "↑" : "↓"}</span>
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <StatePanel
          type="empty"
          bare
          title="Sin resultados"
          description="Prueba con otra búsqueda o filtro."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Cliente</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Estado</TableHead>
              {METRIC_VIEWS.map((view) => (
                <TableHead key={view.metric}>{view.label}</TableHead>
              ))}
              <TableHead>
                <span className="sr-only">Detalle</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry, index) => {
              const id = entry.client_id
              const open = id ? () => onOpen(id) : undefined
              return (
                <TableRow
                  key={id ?? `sin-id-${index}`}
                  tabIndex={open ? 0 : undefined}
                  onClick={open}
                  onKeyDown={(e) => {
                    if (open && e.key === "Enter") open()
                  }}
                  className={open ? "focus-visible:ring-ring/50 cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-inset" : undefined}
                >
                  <TableCell className="pl-5">
                    <strong className="block">{displayName(entry)}</strong>
                    <span className="text-muted-foreground text-xs">{id ?? "sin id"}</span>
                  </TableCell>
                  <TableCell>
                    <b className="text-base">{entry.result ? entry.result.score : "—"}</b>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <LevelBadge group={groupOf(entry)} />
                      {entry.errors && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-risk focus-visible:ring-ring/50 rounded outline-none focus-visible:ring-[3px]"
                              aria-label={`Errores: ${entry.errors.map((e) => e.message).join(" · ")}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <AlertTriangle className="size-4" aria-hidden="true" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {entry.errors.map((e) => e.message).join(" · ")}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </TableCell>
                  {METRIC_VIEWS.map((view) => (
                    <TableCell key={view.metric}>
                      {formatMetric(view.metric, entry.metrics?.[view.metric], "table")}
                    </TableCell>
                  ))}
                  <TableCell className="text-faint">
                    {open && <ChevronRight className="size-4" aria-hidden="true" />}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
