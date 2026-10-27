import { CheckCircle2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { buttonVariants } from "@/components/ui/button"

export interface NoticeContent {
  text: string
  action?: { label: string; href: string }
}

// Confirmación de alta, edición o eliminación (spec 004, research R8): un aviso en línea en lugar
// de una biblioteca de toasts.
export default function Notice({ text, action, onClose }: NoticeContent & { onClose: () => void }) {
  return (
    <Alert role="status" className="mb-6 flex items-center gap-3">
      <CheckCircle2 aria-hidden="true" className="shrink-0" />
      <AlertDescription className="flex-1">{text}</AlertDescription>
      {action && (
        <a href={action.href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {action.label}
        </a>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 grid size-8 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-[3px]"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </Alert>
  )
}
