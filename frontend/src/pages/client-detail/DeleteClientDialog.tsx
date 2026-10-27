import { useRef, useState } from "react"
import { AlertTriangle, Loader2, Trash2 } from "lucide-react"

import { ApiError, deleteClient } from "@/api/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { CUIL_LABEL, formatCuil } from "@/lib/display"

export default function DeleteClientDialog({
  clientId,
  name,
  cuil,
  onDeleted,
  onNotFound,
}: {
  clientId: string
  name: string
  cuil: string | null | undefined
  onDeleted: () => void
  onNotFound: () => void
}) {
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)
  const deletingRef = useRef(false)

  const changeOpen = (next: boolean) => {
    // Mientras se elimina no se cierra: el resultado de la operación decide qué sigue.
    if (deletingRef.current) return
    setOpen(next)
    if (next) setFailed(false)
  }

  const confirm = async () => {
    if (deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    setFailed(false)
    try {
      await deleteClient(clientId)
      setOpen(false)
      onDeleted()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setOpen(false)
        onNotFound()
      } else {
        setFailed(true)
      }
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={changeOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="secondary">
          <Trash2 aria-hidden="true" />
          Eliminar
        </Button>
      </AlertDialogTrigger>
      {/* AlertDialog no se cierra con un clic fuera por diseño; la spec lo pide como forma de
          cancelar (US4, escenario 2). */}
      <AlertDialogContent onOverlayClick={() => changeOpen(false)}>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
          <AlertDialogDescription>
            {name} · {CUIL_LABEL} {formatCuil(cuil)}. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertDescription>No pudimos eliminar el cliente. Inténtalo de nuevo.</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          {/* No es AlertDialogAction: ese cierra el diálogo antes de que termine la llamada. */}
          <Button variant="destructive" disabled={deleting} onClick={confirm}>
            {deleting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Eliminando
              </>
            ) : (
              "Eliminar cliente"
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
