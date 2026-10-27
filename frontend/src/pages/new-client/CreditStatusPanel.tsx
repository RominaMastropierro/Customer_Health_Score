import { AlertTriangle, Landmark, Loader2 } from "lucide-react"

import type { CreditTone } from "@/api/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { TONE_CLASSES, type Tone } from "@/lib/display"
import { cn } from "@/lib/utils"
import type { CreditCheckState } from "@/pages/new-client/useCreditCheck"

export const CREDIT_LOADING_TEXT = "Consultando situación en el BCRA…"
// Para la persona, un servicio caído tiene el mismo efecto que un BCRA sin respuesta.
export const CREDIT_FAILED_MESSAGE =
  "No pudimos consultar la situación en el BCRA en este momento. Inténtalo de nuevo en unos minutos."

const CREDIT_TONE: Record<CreditTone, Tone> = { positive: "top", warning: "stable", risk: "risk" }

function RetryAlert({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    // role={undefined}: el contenedor ya es role="status"; un role="alert" anidado se
    // anunciaría dos veces y de forma asertiva.
    <Alert role={undefined}>
      <AlertTriangle aria-hidden="true" />
      <AlertDescription className="flex flex-col items-start gap-2">
        <p className="break-words">{message}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function Content({ state, onRetry }: { state: CreditCheckState; onRetry: () => void }) {
  if (state.kind === "loading") {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        {CREDIT_LOADING_TEXT}
      </p>
    )
  }
  if (state.kind === "failed") return <RetryAlert message={CREDIT_FAILED_MESSAGE} onRetry={onRetry} />
  if (state.kind !== "done") return null

  const { status, tone, message } = state.result
  if (status === "bcra_unavailable" || status === "summary_unavailable") {
    return <RetryAlert message={message} onRetry={onRetry} />
  }
  const toneClasses = tone ? TONE_CLASSES[CREDIT_TONE[tone]] : null
  return (
    <Alert role={undefined} className={cn(toneClasses && [toneClasses.soft, "border-transparent"])}>
      <Landmark aria-hidden="true" className={cn(toneClasses?.text)} />
      <AlertDescription className="text-foreground flex flex-col gap-1">
        {/* Texto plano tal como llega del servicio (FR-021): no se interpreta HTML ni Markdown. */}
        <p className="break-words whitespace-pre-line">{message}</p>
        {status === "with_debts" && (
          <small className="text-muted-foreground">Fuente: Central de Deudores del BCRA</small>
        )}
      </AlertDescription>
    </Alert>
  )
}

/** Resultado de la consulta bajo el campo CUIT/CUIL. Siempre presente para que el anuncio
 * de las tecnologías de asistencia funcione sin mover el foco (FR-022). */
export default function CreditStatusPanel({
  state,
  onRetry,
}: {
  state: CreditCheckState
  onRetry: () => void
}) {
  return (
    <div role="status" aria-live="polite" data-testid="credit-status">
      <Content state={state} onRetry={onRetry} />
    </div>
  )
}
