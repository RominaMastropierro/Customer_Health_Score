import type { FormEvent } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import type { MetricName, MetricRange } from "@/api/types"
import ClientFields, { type ClientFormErrors, type ClientFormValues } from "@/components/ClientFields"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type FormValues = ClientFormValues

export interface ScoreFormState {
  values: FormValues
  fieldErrors: ClientFormErrors
  formErrors: string[]
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

        <ClientFields ranges={ranges} values={values} fieldErrors={fieldErrors} onChange={onChange} />

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
