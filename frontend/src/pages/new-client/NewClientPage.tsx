import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"

import { ApiError, getMetrics, postScore } from "@/api/client"
import type { MetricName, MetricRange, ScoreResult } from "@/api/types"
import { useApi } from "@/api/useApi"
import PageHeader from "@/components/PageHeader"
import StatePanel from "@/components/StatePanel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import ScoreForm, { type FormValues, type ScoreFormState } from "@/pages/new-client/ScoreForm"
import ScoreResultPanel from "@/pages/new-client/ScoreResultPanel"

const METRIC_FIELDS: readonly MetricName[] = ["usage", "support_tickets", "nps", "days_to_renewal"]

// Sin valores de ejemplo (FR-005): el formulario arranca vacío.
const EMPTY: FormValues = { name: "", usage: "", support_tickets: "", nps: "", days_to_renewal: "" }

type Status = "idle" | "submitting" | "success" | "error"

export default function NewClientPage() {
  const { state: rangesState, reload } = useApi(getMetrics, [])
  const [form, setForm] = useState<ScoreFormState>({ values: EMPTY, fieldErrors: {}, formErrors: [] })
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [resultTitle, setResultTitle] = useState("")
  const [generalError, setGeneralError] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  if (rangesState.status === "loading") return <StatePanel type="loading" />
  if (rangesState.status === "error") return <StatePanel type="error" retry={reload} />

  const ranges = Object.fromEntries(rangesState.data.map((r) => [r.name, r])) as Record<
    MetricName,
    MetricRange
  >

  const change = (field: keyof FormValues, value: string) => {
    setForm((prev) => ({
      values: { ...prev.values, [field]: value },
      fieldErrors: { ...prev.fieldErrors, [field]: undefined },
      formErrors: prev.formErrors,
    }))
  }

  const submit = async () => {
    // Solo se bloquea lo que no es un número; el resto de las reglas las valida el servidor.
    const missing: Partial<Record<MetricName, string>> = {}
    for (const field of METRIC_FIELDS) {
      const raw = form.values[field].trim()
      if (raw === "" || Number.isNaN(Number(raw))) missing[field] = "Introduce un número entero"
    }
    if (Object.keys(missing).length > 0) {
      setForm((prev) => ({ ...prev, fieldErrors: missing }))
      return
    }

    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setStatus("submitting")
    setGeneralError(false)
    setForm((prev) => ({ ...prev, fieldErrors: {}, formErrors: [] }))
    try {
      const data = await postScore(
        {
          usage: Number(form.values.usage),
          support_tickets: Number(form.values.support_tickets),
          nps: Number(form.values.nps),
          days_to_renewal: Number(form.values.days_to_renewal),
        },
        controller.signal,
      )
      setResult(data)
      setResultTitle(form.values.name.trim() || "Cliente nuevo")
      setStatus("success")
    } catch (error) {
      if (controller.signal.aborted) return
      setResult(null)
      setStatus("error")
      if (error instanceof ApiError && error.status === 422) {
        setForm((prev) => ({
          ...prev,
          fieldErrors: error.fieldErrors ?? {},
          formErrors: error.formErrors ?? [],
        }))
      } else {
        setGeneralError(true)
      }
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Evaluación individual"
        title="Nuevo cliente"
        description="Introduce las señales de salud para calcular un score actualizado."
      />
      {generalError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>No pudimos calcular el score. Inténtalo de nuevo.</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <ScoreForm
          ranges={ranges}
          form={form}
          submitting={status === "submitting"}
          onChange={change}
          onSubmit={submit}
        />
        <ScoreResultPanel result={result} title={resultTitle} loading={status === "submitting"} />
      </div>
    </>
  )
}
