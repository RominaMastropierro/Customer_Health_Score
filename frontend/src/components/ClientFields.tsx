import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

import type { FormField } from "@/api/client"
import type { MetricName, MetricRange } from "@/api/types"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CUIL_LABEL } from "@/lib/display"

// Campos de cliente compartidos por el alta y la edición (spec 004, research R6).

export type ClientFormValues = { cuil: string; name: string } & Record<MetricName, string>
export type ClientFormErrors = Partial<Record<FormField, string>>

const METRIC_FIELDS: readonly MetricName[] = ["usage", "support_tickets", "nps", "days_to_renewal"]

// Solo se bloquea lo que no es un número; enteros y rangos los valida el servidor.
export function blankMetricErrors(values: ClientFormValues): ClientFormErrors {
  const errors: ClientFormErrors = {}
  for (const field of METRIC_FIELDS) {
    const raw = values[field].trim()
    if (raw === "" || Number.isNaN(Number(raw))) errors[field] = "Introduce un número entero"
  }
  return errors
}

export function toMetrics(values: ClientFormValues) {
  return {
    usage: Number(values.usage),
    support_tickets: Number(values.support_tickets),
    nps: Number(values.nps),
    days_to_renewal: Number(values.days_to_renewal),
  }
}

function Field({
  id,
  label,
  hint,
  value,
  error,
  children,
  after,
}: {
  id: string
  label: string
  hint?: string
  value?: string
  error?: string
  children: ReactNode
  after?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 text-sm">
        <label htmlFor={id} className="font-semibold">
          {label}
        </label>
        {hint && <small className="text-faint">{hint}</small>}
        {value && <b className="text-brand ml-auto">{value}</b>}
      </div>
      {children}
      {error && (
        <span id={`${id}-error`} className="text-risk flex items-center gap-1.5 text-sm">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </span>
      )}
      {after}
    </div>
  )
}

function integerOptions(range: MetricRange): number[] {
  if (range.max === null) return []
  return Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)
}

export default function ClientFields({
  ranges,
  values,
  fieldErrors,
  onChange,
  idPrefix = "",
  onCuilBlur,
  cuilStatus,
}: {
  ranges: Record<MetricName, MetricRange>
  values: ClientFormValues
  fieldErrors: ClientFormErrors
  onChange: (field: keyof ClientFormValues, value: string) => void
  idPrefix?: string
  // Solo el alta las pasa (consulta al BCRA, spec 005); sin ellas, la edición no cambia.
  onCuilBlur?: () => void
  cuilStatus?: ReactNode
}) {
  const usage = ranges.usage
  const nps = ranges.nps
  const id = (field: FormField) => `${idPrefix}${field}`
  const invalid = (field: FormField) => ({
    "aria-invalid": fieldErrors[field] ? true : undefined,
    "aria-describedby": fieldErrors[field] ? `${id(field)}-error` : undefined,
  })

  return (
    <>
      {/* Texto puro: sin reformatear ni recortar, para no alterar ceros iniciales ni guiones
          (FR-001). El servidor valida formato y dígito verificador al guardar; el alta además
          los comprueba al salir del campo, antes de consultar al BCRA (spec 005). */}
      <Field
        id={id("cuil")}
        label={CUIL_LABEL}
        hint="Con o sin guiones"
        error={fieldErrors.cuil}
        after={cuilStatus}
      >
        <Input
          id={id("cuil")}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="XX-XXXXXXXX-X"
          value={values.cuil}
          onChange={(e) => onChange("cuil", e.target.value)}
          onBlur={onCuilBlur}
          {...invalid("cuil")}
        />
      </Field>

      <Field id={id("name")} label="Nombre" hint="Opcional" error={fieldErrors.name}>
        <Input
          id={id("name")}
          value={values.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Ej. Cliente Ficticio"
          {...invalid("name")}
        />
      </Field>

      <Field
        id={id("usage")}
        label="Uso del producto"
        value={values.usage === "" ? "Sin definir" : `${values.usage}%`}
        error={fieldErrors.usage}
      >
        <div className="flex items-center gap-4">
          <div className="flex flex-1 flex-col gap-2">
            {/* Radix no dibuja el control con value=[]: mientras el campo está vacío se
                muestra en el mínimo, pero el valor sigue sin definir hasta que se mueve. */}
            <Slider
              aria-label="Uso del producto"
              min={usage.min}
              max={usage.max ?? undefined}
              step={1}
              value={[values.usage === "" || Number.isNaN(Number(values.usage)) ? usage.min : Number(values.usage)]}
              onValueChange={([v]) => onChange("usage", String(v))}
              {...invalid("usage")}
            />
            <div className="text-faint flex justify-between text-xs" aria-hidden="true">
              <span>{usage.min}%</span>
              <span>{usage.max}%</span>
            </div>
          </div>
          <Input
            id={id("usage")}
            type="number"
            inputMode="numeric"
            aria-label="Uso del producto (%)"
            min={usage.min}
            max={usage.max ?? undefined}
            step={1}
            value={values.usage}
            onChange={(e) => onChange("usage", e.target.value)}
            className="w-20"
            {...invalid("usage")}
          />
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field
          id={id("support_tickets")}
          label="Tickets de soporte"
          hint="Últimos 30 días"
          error={fieldErrors.support_tickets}
        >
          <Input
            id={id("support_tickets")}
            type="number"
            inputMode="numeric"
            min={ranges.support_tickets.min}
            step={1}
            value={values.support_tickets}
            onChange={(e) => onChange("support_tickets", e.target.value)}
            {...invalid("support_tickets")}
          />
        </Field>
        <Field id={id("days_to_renewal")} label="Días hasta renovación" error={fieldErrors.days_to_renewal}>
          <Input
            id={id("days_to_renewal")}
            type="number"
            inputMode="numeric"
            min={ranges.days_to_renewal.min}
            step={1}
            value={values.days_to_renewal}
            onChange={(e) => onChange("days_to_renewal", e.target.value)}
            {...invalid("days_to_renewal")}
          />
        </Field>
      </div>

      <Field
        id={id("nps")}
        label="NPS"
        value={values.nps === "" ? undefined : `${values.nps}/${nps.max}`}
        error={fieldErrors.nps}
      >
        <ToggleGroup
          id={id("nps")}
          type="single"
          aria-label="NPS"
          value={values.nps}
          onValueChange={(v) => {
            if (v !== "") onChange("nps", v)
          }}
          className="grid grid-cols-6 sm:flex"
          {...invalid("nps")}
        >
          {integerOptions(nps).map((n) => (
            <ToggleGroupItem key={n} value={String(n)} aria-label={`NPS ${n}`}>
              {n}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </>
  )
}
