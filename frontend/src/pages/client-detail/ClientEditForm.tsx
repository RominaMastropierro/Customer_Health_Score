import { type FormEvent, useEffect, useRef, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { ApiError, getMetrics, updateClient } from "@/api/client"
import type { ClientRecord, MetricName, MetricRange } from "@/api/types"
import { useApi } from "@/api/useApi"
import ClientFields, {
  type ClientFormErrors,
  type ClientFormValues,
  blankMetricErrors,
  toMetrics,
} from "@/components/ClientFields"
import StatePanel from "@/components/StatePanel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CUIL_LABEL } from "@/lib/display"

// El CUIT se precarga con guiones y el original llega sin ellos: es el mismo valor, así que se
// comparan sin guiones solo para decidir si hubo cambios (nunca para enviarlo).
function isDirty(values: ClientFormValues, initial: ClientFormValues): boolean {
  return (Object.keys(values) as (keyof ClientFormValues)[]).some((key) =>
    key === "cuil"
      ? values.cuil.replace(/-/g, "") !== initial.cuil.replace(/-/g, "")
      : values[key] !== initial[key],
  )
}

export default function ClientEditForm({
  clientId,
  initial,
  onSaved,
  onNotFound,
  onCancel,
  onDirtyChange,
}: {
  clientId: string
  initial: ClientFormValues
  onSaved: (record: ClientRecord) => void
  onNotFound: () => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const { state: rangesState, reload } = useApi(getMetrics, [])
  const [values, setValues] = useState(initial)
  const [fieldErrors, setFieldErrors] = useState<ClientFormErrors>({})
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [saveError, setSaveError] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const mounted = useRef(true)
  const dirty = isDirty(values, initial)

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  // Al entrar en modo edición, el foco va al primer campo (FR-027).
  const rangesReady = rangesState.status === "success"
  useEffect(() => {
    if (rangesReady) document.getElementById("edit-cuil")?.focus()
  }, [rangesReady])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      onDirtyChange(false)
    }
  }, [onDirtyChange])

  if (rangesState.status === "loading") return <StatePanel type="loading" bare />
  if (rangesState.status === "error") return <StatePanel type="error" bare retry={reload} />

  const ranges = Object.fromEntries(rangesState.data.map((r) => [r.name, r])) as Record<
    MetricName,
    MetricRange
  >

  const change = (field: keyof ClientFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (savingRef.current || !dirty) return
    // En la edición no hay un cálculo previo que habilite el botón: el CUIT vacío se avisa aquí.
    const blocked: ClientFormErrors = {
      ...(values.cuil.trim() === "" ? { cuil: `Falta el ${CUIL_LABEL}` } : {}),
      ...blankMetricErrors(values),
    }
    if (Object.keys(blocked).length > 0) {
      setFieldErrors(blocked)
      return
    }

    savingRef.current = true
    setSaving(true)
    setSaveError(false)
    setFieldErrors({})
    setFormErrors([])
    try {
      const record = await updateClient(clientId, {
        cuil: values.cuil,
        name: values.name.trim() || null,
        metrics: toMetrics(values),
      })
      if (mounted.current) onSaved(record)
    } catch (error) {
      if (!mounted.current) return
      if (error instanceof ApiError && error.status === 404) {
        onNotFound()
      } else if (error instanceof ApiError && (error.status === 422 || error.status === 409)) {
        setFieldErrors(error.fieldErrors ?? {})
        setFormErrors(error.formErrors ?? [])
      } else {
        setSaveError(true)
      }
    } finally {
      savingRef.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        <span>Identificador</span> · <span className="text-foreground font-mono">{clientId}</span>
      </p>

      {saveError && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>No pudimos guardar los cambios. Inténtalo de nuevo.</AlertDescription>
        </Alert>
      )}
      {formErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>{formErrors.join(" · ")}</AlertDescription>
        </Alert>
      )}

      <ClientFields
        ranges={ranges}
        values={values}
        fieldErrors={fieldErrors}
        onChange={change}
        idPrefix="edit-"
      />

      <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row">
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Guardando
            </>
          ) : (
            "Guardar cambios"
          )}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
