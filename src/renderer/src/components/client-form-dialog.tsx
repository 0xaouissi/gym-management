import { useEffect, useState, type FormEvent } from 'react'
import type { Client, ClientStatus } from '@shared/types'
import { CLIENT_STATUS_LABELS } from '@shared/constants'
import { runAction } from '@renderer/lib/action'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'

interface ClientFormState {
  firstName: string
  lastName: string
  phone: string
  email: string
  dateOfBirth: string
  address: string
  notes: string
  status: ClientStatus
  rfidUid: string
}

const EMPTY_FORM: ClientFormState = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  address: '',
  notes: '',
  status: 'ACTIVE',
  rfidUid: ''
}

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  client: Client | null
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const [form, setForm] = useState<ClientFormState>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      client
        ? {
            firstName: client.firstName,
            lastName: client.lastName,
            phone: client.phone ?? '',
            email: client.email ?? '',
            dateOfBirth: client.dateOfBirth ?? '',
            address: client.address ?? '',
            notes: client.notes ?? '',
            status: client.status,
            rfidUid: ''
          }
        : EMPTY_FORM
    )
  }, [open, client])

  const patch = (values: Partial<ClientFormState>): void => setForm((current) => ({ ...current, ...values }))

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First name and last name are required.')
      return
    }

    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      dateOfBirth: form.dateOfBirth || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status
    }

    setBusy(true)
    try {
      const result = client
        ? await runAction(window.api.clients.update(client.id, payload), 'Client updated')
        : await runAction(
            window.api.clients.create({ ...payload, rfidUid: form.rfidUid.trim() || null }),
            'Client created'
          )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to save the client.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{client ? 'Edit client' : 'New client'}</DialogTitle>
          <DialogDescription>
            {client
              ? 'Update the member profile. RFID cards are managed from the card section.'
              : 'Register a new member. You can assign an RFID card now or later.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="client-first">First name *</Label>
              <Input
                id="client-first"
                value={form.firstName}
                onChange={(event) => patch({ firstName: event.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-last">Last name *</Label>
              <Input
                id="client-last"
                value={form.lastName}
                onChange={(event) => patch({ lastName: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={form.phone}
                onChange={(event) => patch({ phone: event.target.value })}
                placeholder="+213 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(event) => patch({ email: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-dob">Date of birth</Label>
              <Input
                id="client-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(event) => patch({ dateOfBirth: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-status">Status</Label>
              <Select value={form.status} onValueChange={(value) => patch({ status: value as ClientStatus })}>
                <SelectTrigger id="client-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>
                      {CLIENT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!client ? (
            <div className="space-y-1.5">
              <Label htmlFor="client-uid">RFID card UID (optional)</Label>
              <Input
                id="client-uid"
                value={form.rfidUid}
                onChange={(event) => patch({ rfidUid: event.target.value })}
                placeholder="AABBCCDDEE"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Scan the card while this dialog is open, or type the UID. It must not belong to another member.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="client-address">Address</Label>
            <Input
              id="client-address"
              value={form.address}
              onChange={(event) => patch({ address: event.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="client-notes">Notes</Label>
            <Textarea
              id="client-notes"
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              rows={2}
            />
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : client ? 'Save changes' : 'Create client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
