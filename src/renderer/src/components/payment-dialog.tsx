import { useEffect, useState, type FormEvent } from 'react'
import type { PaymentMethod, SubscriptionWithDetails } from '@shared/types'
import { PAYMENT_METHOD_LABELS } from '@shared/constants'
import { formatDate, todayISO } from '@shared/utils'
import { runAction } from '@renderer/lib/action'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'

export interface PaymentFieldsValue {
  amount: string
  method: PaymentMethod
  reference: string
}

export const EMPTY_PAYMENT_FIELDS: PaymentFieldsValue = {
  amount: '',
  method: 'CASH',
  reference: ''
}

export function PaymentFields({
  value,
  onChange,
  currency,
  idPrefix = 'payment'
}: {
  value: PaymentFieldsValue
  onChange(patch: Partial<PaymentFieldsValue>): void
  currency: string
  idPrefix?: string
}): React.JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-amount`}>Amount ({currency}) *</Label>
        <Input
          id={`${idPrefix}-amount`}
          type="number"
          min="0"
          step="0.01"
          value={value.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-method`}>Method</Label>
        <Select value={value.method} onValueChange={(next) => onChange({ method: next as PaymentMethod })}>
          <SelectTrigger id={`${idPrefix}-method`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((method) => (
              <SelectItem key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor={`${idPrefix}-reference`}>Reference</Label>
        <Input
          id={`${idPrefix}-reference`}
          value={value.reference}
          onChange={(event) => onChange({ reference: event.target.value })}
          placeholder="Receipt number, transfer ID…"
        />
      </div>
    </div>
  )
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  client,
  subscriptions,
  currency,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  client: { id: number; name: string } | null
  subscriptions?: SubscriptionWithDetails[]
  currency: string
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const [fields, setFields] = useState<PaymentFieldsValue>(EMPTY_PAYMENT_FIELDS)
  const [paymentDate, setPaymentDate] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [subscriptionId, setSubscriptionId] = useState('AUTO')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setFields(EMPTY_PAYMENT_FIELDS)
    setPaymentDate(todayISO())
    setNotes('')
    setSubscriptionId('AUTO')
    setError('')
  }, [open, client])

  const options = (subscriptions ?? []).filter((subscription) => subscription.status !== 'CANCELLED')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!client) return
    setError('')
    const amount = Number(fields.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setBusy(true)
    try {
      const result = await runAction(
        window.api.payments.create({
          clientId: client.id,
          subscriptionId: subscriptionId === 'AUTO' ? null : Number(subscriptionId),
          amount,
          paymentDate: paymentDate || undefined,
          paymentMethod: fields.method,
          reference: fields.reference.trim() || null,
          notes: notes.trim() || null
        }),
        'Payment recorded'
      )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to record the payment.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {client ? `Register a payment for ${client.name}.` : 'Register a payment.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <PaymentFields
            value={fields}
            onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
            currency={currency}
          />

          {options.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="payment-subscription">Apply to subscription</Label>
              <Select value={subscriptionId} onValueChange={setSubscriptionId}>
                <SelectTrigger id="payment-subscription">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Latest subscription (automatic)</SelectItem>
                  {options.map((subscription) => (
                    <SelectItem key={subscription.id} value={String(subscription.id)}>
                      #{subscription.id} · {subscription.planName} · ends {formatDate(subscription.endDate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-date">Payment date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-notes">Notes</Label>
            <Textarea id="payment-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
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
            <Button type="submit" disabled={busy || !client}>
              {busy ? 'Saving…' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
