import { useCallback, useEffect, useState } from "react"

import { ApiError } from "@/api/client"

export type RemoteState<T> =
  | { status: "loading" }
  | { status: "error"; error: ApiError }
  | { status: "success"; data: T }

export function useApi<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): { state: RemoteState<T>; reload: () => void; loadedAt: Date | null } {
  const [state, setState] = useState<RemoteState<T>>({ status: "loading" })
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Cada carga tiene su controlador: si cambia la pantalla o el id, la respuesta
    // tardía se descarta en lugar de pisar lo que se muestra ahora.
    const controller = new AbortController()
    setState({ status: "loading" })
    loader(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return
        setState({ status: "success", data })
        setLoadedAt(new Date())
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const apiError =
          error instanceof ApiError ? error : new ApiError(0, "Error inesperado")
        setState({ status: "error", error: apiError })
      },
    )
    return () => controller.abort()
  }, [...deps, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, reload, loadedAt }
}
