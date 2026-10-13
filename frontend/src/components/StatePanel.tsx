import { AlertTriangle, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const DEFAULTS = {
  loading: { title: "Cargando datos", description: "Estamos preparando la información." },
  error: {
    title: "No pudimos cargar los datos",
    description: "Revisa tu conexión e inténtalo de nuevo.",
  },
  empty: {
    title: "Aún no hay clientes",
    description: "Calcula un score para empezar a construir tu cartera.",
  },
}

export default function StatePanel({
  type,
  retry,
  title,
  description,
  bare = false,
  className,
}: {
  type: "loading" | "error" | "empty"
  retry?: () => void
  title?: string
  description?: string
  bare?: boolean
  className?: string
}) {
  const text = DEFAULTS[type]
  const body = (
    <div
      role={type === "loading" ? "status" : type === "error" ? "alert" : undefined}
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-14 text-center",
        className,
      )}
    >
      {type === "loading" ? (
        <div aria-hidden="true" className="mb-2 flex w-48 flex-col gap-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4 self-center" />
        </div>
      ) : (
        <span
          className={cn(
            "mb-2 grid size-11 place-items-center rounded-xl",
            type === "error" ? "bg-risk-soft text-risk" : "bg-brand-soft text-brand",
          )}
        >
          {type === "error" ? <AlertTriangle className="size-5" /> : <Users className="size-5" />}
        </span>
      )}
      <strong className="text-base">{title ?? text.title}</strong>
      <span className="text-muted-foreground max-w-sm text-sm">{description ?? text.description}</span>
      {retry && (
        <Button variant="secondary" className="mt-3" onClick={retry}>
          Reintentar
        </Button>
      )}
    </div>
  )
  return bare ? body : <Card className="py-0">{body}</Card>
}
