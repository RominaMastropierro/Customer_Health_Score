import type { FormEvent, ReactNode } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import type { MetricName, MetricRange } from "@/api/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export type FormValues = { name: string } & Record<MetricName, string>

export interface ScoreFormState {
  values: FormValues
  fieldErrors: Partial<Record<MetricName, string>>
  formErrors: string[]
}

function Field({
  id,
  label,
  hint,
  value,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  value?: string
  error?: string
  children: ReactNode
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
    </div>
  )
}

function integerOptions(range: MetricRange): number[] {
  if (range.max === null) return []
  return Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i)
}

export default function ScoreForm({
  ranges,
  form,
  submitting,
  onChange,
  onSubmit,
}: {
  ranges: Record<MetricName, MetricRange>
  form: ScoreFormState
  submitting: boolean
  onChange: (field: keyof FormValues, value: string) => void
  onSubmit: () => void
}) {
  const { values, fieldErrors, formErrors } = form
  const usage = ranges.usage
  const nps = ranges.nps
  const invalid = (name: MetricName) => ({
    "aria-invalid": fieldErrors[name] ? true : undefined,
    "aria-describedby": fieldErrors[name] ? `${name}-error` : undefined,
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Card className="gap-0 py-0">
      <form onSubmit={submit} noValidate className="flex flex-col gap-6 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">Datos del cliente</h2>
            <p className="text-muted-foreground text-sm">Todos los indicadores son obligatorios.</p>
          </div>
          <span className="text-faint text-sm font-bold">01</span>
        </div>

        {formErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>{formErrors.join(" · ")}</AlertDescription>
          </Alert>
        )}

        <Field id="name" label="Nombre" hint="Opcional">
          <Input
            id="name"
            value={values.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="Ej. Cliente Ficticio"
          />
        </Field>

        <Field
          id="usage"
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
              id="usage"
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
            id="support_tickets"
            label="Tickets de soporte"
            hint="Últimos 30 días"
            error={fieldErrors.support_tickets}
          >
            <Input
              id="support_tickets"
              type="number"
              inputMode="numeric"
              min={ranges.support_tickets.min}
              step={1}
              value={values.support_tickets}
              onChange={(e) => onChange("support_tickets", e.target.value)}
              {...invalid("support_tickets")}
            />
          </Field>
          <Field id="days_to_renewal" label="Días hasta renovación" error={fieldErrors.days_to_renewal}>
            <Input
              id="days_to_renewal"
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
          id="nps"
          label="NPS"
          value={values.nps === "" ? undefined : `${values.nps}/${nps.max}`}
          error={fieldErrors.nps}
        >
          <ToggleGroup
            id="nps"
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

        <div className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center">
          <Button type="submit" size="lg" disabled={submitting} className={cn(submitting && "opacity-80")}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Calculando
              </>
            ) : (
              "Calcular score"
            )}
          </Button>
          <span className="text-muted-foreground text-sm">Los datos no se guardarán automáticamente.</span>
        </div>
      </form>
    </Card>
  )
}
