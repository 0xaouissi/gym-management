import { useState } from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm(): void | Promise<void>
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm
}: ConfirmDialogProps): React.JSX.Element {
  const [pending, setPending] = useState(false)

  const handleConfirm = async (): Promise<void> => {
    setPending(true)
    try {
      await onConfirm()
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fm-overlay fixed inset-0 z-50 bg-black/70" />
        <AlertDialogPrimitive.Content className="fm-overlay fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-2xl">
          <AlertDialogPrimitive.Title className="text-base font-semibold">{title}</AlertDialogPrimitive.Title>
          {description ? (
            <AlertDialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
              {description}
            </AlertDialogPrimitive.Description>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                variant={destructive ? 'destructive' : 'default'}
                disabled={pending}
                onClick={(event) => {
                  event.preventDefault()
                  void handleConfirm()
                }}
              >
                {pending ? 'Working…' : confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
