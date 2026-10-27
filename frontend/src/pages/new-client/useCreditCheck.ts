import { useCallback, useEffect, useRef, useState } from "react"

import { getCreditStatus } from "@/api/client"
import type { CreditStatus } from "@/api/types"

// Consulta de la situación en el BCRA del CUIT del alta (spec 005). Nada se guarda: el estado
// vive solo mientras la pantalla está montada (FR-024).

export type CreditCheckState =
  | { kind: "idle" }
  | { kind: "loading"; digits: string }
  | { kind: "done"; digits: string; result: CreditStatus }
  | { kind: "failed"; digits: string }

// Los tiempos límite del BCRA y del SDK son por operación de red, no por la duración total
// (research R6): el servicio solo no garantiza el aviso en menos de 30 s (SC-005).
export const CREDIT_CHECK_TIMEOUT_MS = 28_000

interface InFlight {
  controller: AbortController
  timer: ReturnType<typeof setTimeout>
}

type DoneState = Extract<CreditCheckState, { kind: "done" }>

export function useCreditCheck() {
  const [state, setStateValue] = useState<CreditCheckState>({ kind: "idle" })
  // Copia sincrónica del estado: check() decide la deduplicación sin esperar un render.
  const stateRef = useRef<CreditCheckState>(state)
  const inFlight = useRef<InFlight | null>(null)
  const lastDone = useRef<DoneState | null>(null)

  const setState = useCallback((next: CreditCheckState) => {
    stateRef.current = next
    setStateValue(next)
  }, [])

  const cancel = useCallback(() => {
    if (!inFlight.current) return
    clearTimeout(inFlight.current.timer)
    inFlight.current.controller.abort()
    inFlight.current = null
  }, [])

  const start = useCallback(
    (digits: string) => {
      cancel()
      const controller = new AbortController()
      // Se compara por identidad: una respuesta de una consulta ya reemplazada o cancelada
      // nunca se muestra, aunque fetch no respete la señal de aborto.
      const request: InFlight = {
        controller,
        timer: setTimeout(() => {
          if (inFlight.current !== request) return
          inFlight.current = null
          controller.abort()
          setState({ kind: "failed", digits })
        }, CREDIT_CHECK_TIMEOUT_MS),
      }
      inFlight.current = request
      setState({ kind: "loading", digits })
      getCreditStatus(digits, controller.signal).then(
        (result) => {
          if (inFlight.current !== request) return
          clearTimeout(request.timer)
          inFlight.current = null
          const done: DoneState = { kind: "done", digits, result }
          // Un "no disponible" no se conserva: volver al CUIT debe consultar otra vez.
          if (result.status === "with_debts" || result.status === "no_data") lastDone.current = done
          setState(done)
        },
        () => {
          if (inFlight.current !== request) return
          clearTimeout(request.timer)
          inFlight.current = null
          setState({ kind: "failed", digits })
        },
      )
    },
    [cancel, setState],
  )

  const check = useCallback(
    (digits: string) => {
      const current = stateRef.current
      // Una sola solicitud por CUIT normalizado: en curso o con resultado visible (FR-006, FR-007).
      if ((current.kind === "loading" || current.kind === "done") && current.digits === digits) return
      // El mismo CUIT escrito de otra forma recupera el resultado sin consultar (US3, esc. 3).
      if (current.kind === "idle" && lastDone.current?.digits === digits) {
        setState(lastDone.current)
        return
      }
      start(digits)
    },
    [setState, start],
  )

  // reset() se usa al modificar el campo: oculta el resultado pero lo conserva por si se vuelve
  // al mismo CUIT. clear() se usa al guardar: el resultado ya no corresponde a ningún alta.
  const reset = useCallback(() => {
    cancel()
    setState({ kind: "idle" })
  }, [cancel, setState])

  const clear = useCallback(() => {
    lastDone.current = null
    reset()
  }, [reset])

  // "Reintentar" repite la consulta del mismo CUIT saltando la deduplicación; solo existe
  // cuando la consulta falló o alguna fuente no estuvo disponible (US4).
  const retry = useCallback(() => {
    const current = stateRef.current
    const retryable =
      current.kind === "failed" ||
      (current.kind === "done" &&
        (current.result.status === "bcra_unavailable" || current.result.status === "summary_unavailable"))
    if (retryable) start(current.digits)
  }, [start])

  useEffect(() => cancel, [cancel])

  return { state, check, reset, clear, retry }
}
