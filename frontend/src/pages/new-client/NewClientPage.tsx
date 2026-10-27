import { useEffect, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"

import { ApiError, createClient, getMetrics, postScore } from "@/api/client"
import type { ClientRecord, MetricName, MetricRange, ScoreResult } from "@/api/types"
import { useApi } from "@/api/useApi"
import { blankMetricErrors, toMetrics } from "@/components/ClientFields"
import PageHeader from "@/components/PageHeader"
import StatePanel from "@/components/StatePanel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { validateCuit } from "@/lib/cuit"
import { CUIL_LABEL } from "@/lib/display"
import CreditStatusPanel from "@/pages/new-client/CreditStatusPanel"
import ScoreForm, { type FormValues, type ScoreFormState } from "@/pages/new-client/ScoreForm"
import ScoreResultPanel from "@/pages/new-client/ScoreResultPanel"
import { useCreditCheck } from "@/pages/new-client/useCreditCheck"

// Sin valores de ejemplo (FR-005): el formulario arranca vacío.
const EMPTY: FormValues = { cuil: "", name: "", usage: "", support_tickets: "", nps: "", days_to_renewal: "" }

type Status = "idle" | "submitting" | "success" | "error"

function sameValues(a: FormValues, b: FormValues): boolean {
  return (Object.keys(a) as (keyof FormValues)[]).every((key) => a[key] === b[key])
}

export default function NewClientPage({
  onClientsChanged,
  onSaved,
}: {
  // Separadas a propósito: la cartera se refresca siempre que el alta se completó, y el aviso
  // solo se da si la persona sigue en esta pantalla (spec 004, caso límite "el servicio tarda").
  onClientsChanged?: () => void
  onSaved?: (record: ClientRecord) => void
} = {}) {
  const { state: rangesState, reload } = useApi(getMetrics, [])
  const [form, setForm] = useState<ScoreFormState>({ values: EMPTY, fieldErrors: {}, formErrors: [] })
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<ScoreResult | null>(null)
  const [resultTitle, setResultTitle] = useState("")
  const [generalError, setGeneralError] = useState(false)
  // Valores con que se calculó el resultado: es lo único que se puede guardar (research R5).
  const [calculatedFrom, setCalculatedFrom] = useState<FormValues | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const inFlight = useRef<AbortController | null>(null)
  const savingRef = useRef(false)
  const mounted = useRef(true)
  const credit = useCreditCheck()

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      inFlight.current?.abort()
    }
  }, [])

  if (rangesState.status === "loading") return <StatePanel type="loading" />
  if (rangesState.status === "error") return <StatePanel type="error" retry={reload} />

  const ranges = Object.fromEntries(rangesState.data.map((r) => [r.name, r])) as Record<
    MetricName,
    MetricRange
  >

  const change = (field: keyof FormValues, value: string) => {
    // Un resultado nunca debe corresponder a un CUIT distinto del escrito (FR-008).
    if (field === "cuil") credit.reset()
    setForm((prev) => ({
      values: { ...prev.values, [field]: value },
      fieldErrors: { ...prev.fieldErrors, [field]: undefined },
      formErrors: prev.formErrors,
    }))
  }

  // La consulta al BCRA se dispara al salir del campo, nunca mientras se escribe (FR-001).
  const cuilBlur = () => {
    const value = form.values.cuil
    if (value === "") return
    const validation = validateCuit(value)
    if (validation.ok) {
      credit.check(validation.digits)
      return
    }
    // El mismo fieldErrors.cuil del alta: hereda aria-invalid, aria-describedby y el borrado
    // al escribir (research R12).
    const message = validation.message
    setForm((prev) => ({ ...prev, fieldErrors: { ...prev.fieldErrors, cuil: message } }))
  }

  const submit = async () => {
    const missing = blankMetricErrors(form.values)
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
      const data = await postScore(toMetrics(form.values), controller.signal)
      setResult(data)
      setCalculatedFrom(form.values)
      setResultTitle(form.values.name.trim() || "Cliente nuevo")
      setStatus("success")
    } catch (error) {
      if (controller.signal.aborted) return
      setResult(null)
      setCalculatedFrom(null)
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

  const missingCuil = form.values.cuil.trim() === ""
  const stale = calculatedFrom === null || !sameValues(calculatedFrom, form.values)
  const canSave = result !== null && !missingCuil && !stale
  const saveHint = missingCuil ? `Falta el ${CUIL_LABEL}` : stale ? "Vuelve a calcular para guardar" : undefined

  const save = async () => {
    if (savingRef.current || !canSave || calculatedFrom === null) return
    savingRef.current = true
    setSaving(true)
    setSaveError(false)
    setForm((prev) => ({ ...prev, fieldErrors: {}, formErrors: [] }))
    try {
      // El CUIT va tal como se escribió: lo normaliza y valida el servidor.
      const record = await createClient({
        cuil: calculatedFrom.cuil,
        name: calculatedFrom.name.trim() || null,
        metrics: toMetrics(calculatedFrom),
      })
      onClientsChanged?.()
      if (!mounted.current) return
      setForm({ values: EMPTY, fieldErrors: {}, formErrors: [] })
      credit.clear()
      setResult(null)
      setCalculatedFrom(null)
      setStatus("idle")
      onSaved?.(record)
    } catch (error) {
      if (!mounted.current) return
      // Con 422/409 se conserva calculatedFrom: corregir el campo y recalcular habilita guardar.
      if (error instanceof ApiError && (error.status === 422 || error.status === 409)) {
        setForm((prev) => ({
          ...prev,
          fieldErrors: error.fieldErrors ?? {},
          formErrors: error.formErrors ?? [],
        }))
      } else {
        setSaveError(true)
      }
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
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
      {saveError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>No pudimos guardar los cambios. Inténtalo de nuevo.</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
        <ScoreForm
          ranges={ranges}
          form={form}
          submitting={status === "submitting"}
          onChange={change}
          onSubmit={submit}
          onCuilBlur={cuilBlur}
          cuilStatus={
            <CreditStatusPanel state={credit.state} onRetry={credit.retry} />
          }
        />
        <ScoreResultPanel
          result={result}
          title={resultTitle}
          loading={status === "submitting"}
          canSave={canSave}
          saveHint={saveHint}
          saving={saving}
          onSave={save}
        />
      </div>
    </>
  )
}
