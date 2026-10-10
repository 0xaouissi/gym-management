import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowLeftRight,
  CalendarPlus,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  XCircle
} from 'lucide-react'
import type { SubscriptionPlan, SubscriptionWithDetails } from '@shared/types'
import { computeRenewalDates, formatCurrency, formatDate, planEndDate, planTotalPrice, todayISO } from '@shared/utils'
import { useSettings } from '@renderer/hooks/useSettings'
import { runAction } from '@renderer/lib/action'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from './ui/dropdown-menu'
import { EMPTY_PAYMENT_FIELDS, PaymentFields, type PaymentFieldsValue } from './payment-dialog'

export interface ClientRef {
  id: number
  name: string
}

function activePlanOptions(plans: SubscriptionPlan[], currentId?: number): SubscriptionPlan[] {
  return plans.filter((plan) => plan.isActive || plan.id === currentId)
}

function PlanSelectField({
  id,
  plans,
  value,
  currentId,
  onChange
}: {
  id: string
  plans: SubscriptionPlan[]
  value: number | null
  currentId?: number
  onChange(planId: number): void
}): React.JSX.Element {
  const { settings } = useSettings()
  const options = activePlanOptions(plans, currentId)
  const selected = options.find((plan) => plan.id === value) ?? null

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Plan *</Label>
      <Select value={value === null ? undefined : String(value)} onValueChange={(next) => onChange(Number(next))}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select a plan…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((plan) => (
            <SelectItem key={plan.id} value={String(plan.id)}>
              {plan.name} · {plan.durationValue} {plan.durationUnit.toLowerCase()} ·{' '}
              {formatCurrency(plan.price, settings.currency)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected ? (
        <p className="text-xs text-muted-foreground">
          {selected.durationValue} {selected.durationUnit.toLowerCase()} · list price{' '}
          {formatCurrency(selected.price, settings.currency)}
        </p>
      ) : null}
    </div>
  )
}

function AmountField({
  id,
  value,
  currency,
  onChange
}: {
  id: string
  value: string
  currency: string
  onChange(value: string): void
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Price ({currency})</Label>
      <Input id={id} type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function parseMonths(raw: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) return 1
  return Math.min(value, 36)
}

function MonthsField({
  id,
  value,
  onChange
}: {
  id: string
  value: string
  onChange(value: string): void
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Months</Label>
      <Input id={id} type="number" min="1" max="36" step="1" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function DialogError({ message }: { message: string }): React.JSX.Element | null {
  if (!message) return null
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  )
}

export function NewSubscriptionDialog({
  open,
  onOpenChange,
  client,
  plans,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  client: ClientRef | null
  plans: SubscriptionPlan[]
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const { settings } = useSettings()
  const [planId, setPlanId] = useState<number | null>(null)
  const [startDate, setStartDate] = useState(todayISO())
  const [months, setMonths] = useState('1')
  const [price, setPrice] = useState('')
  const [recordPayment, setRecordPayment] = useState(true)
  const [fields, setFields] = useState<PaymentFieldsValue>(EMPTY_PAYMENT_FIELDS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const first = plans.find((plan) => plan.isActive) ?? null
    setPlanId(first?.id ?? null)
    setStartDate(todayISO())
    setMonths('1')
    setPrice(first ? String(first.price) : '')
    setRecordPayment(true)
    setFields({ ...EMPTY_PAYMENT_FIELDS, amount: first ? String(first.price) : '' })
    setError('')
  }, [open, plans])

  const plan = plans.find((item) => item.id === planId) ?? null
  const monthCount = parseMonths(months)
  const previewEnd = plan ? planEndDate(startDate || todayISO(), plan, monthCount) : null

  const applyPrice = (target: SubscriptionPlan, count: number): void => {
    const total = planTotalPrice(target, count)
    setPrice(String(total))
    if (recordPayment) setFields((current) => ({ ...current, amount: String(total) }))
  }

  const handlePlanChange = (nextPlanId: number): void => {
    const next = plans.find((item) => item.id === nextPlanId) ?? null
    setPlanId(nextPlanId)
    if (next) applyPrice(next, monthCount)
  }

  const handleMonthsChange = (raw: string): void => {
    setMonths(raw)
    if (plan) applyPrice(plan, parseMonths(raw))
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!client || !plan) {
      setError('Select a plan to continue.')
      return
    }
    setError('')
    const numericPrice = Number(price)
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError('Price must be zero or more.')
      return
    }
    const paymentAmount = Number(fields.amount)
    if (recordPayment && (!Number.isFinite(paymentAmount) || paymentAmount <= 0)) {
      setError('Enter a payment amount greater than zero, or turn off “Record payment now”.')
      return
    }
    setBusy(true)
    try {
      const result = await runAction(
        window.api.subs.create({
          clientId: client.id,
          planId: plan.id,
          startDate,
          months: monthCount,
          price: numericPrice,
          payment: recordPayment
            ? {
                amount: paymentAmount,
                paymentMethod: fields.method,
                reference: fields.reference.trim() || null
              }
            : null
        }),
        'Subscription created'
      )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to create the subscription.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New subscription</DialogTitle>
          <DialogDescription>
            {client ? `Start a subscription for ${client.name}.` : 'Start a subscription.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <PlanSelectField id="new-sub-plan" plans={plans} value={planId} onChange={handlePlanChange} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-sub-start">Start date</Label>
              <Input id="new-sub-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <MonthsField id="new-sub-months" value={months} onChange={handleMonthsChange} />
            <AmountField id="new-sub-price" value={price} currency={settings.currency} onChange={setPrice} />
          </div>

          {previewEnd ? (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {monthCount > 1 ? `${monthCount} months of ${plan?.name ?? 'plan'} — ` : ''}Active from{' '}
              <span className="font-medium text-foreground">{formatDate(startDate || todayISO())}</span> to{' '}
              <span className="font-medium text-foreground">{formatDate(previewEnd)}</span>.
            </p>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={recordPayment}
              onCheckedChange={(checked) => setRecordPayment(checked === true)}
            />
            Record payment now
          </label>

          {recordPayment ? (
            <PaymentFields
              value={fields}
              onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
              currency={settings.currency}
              idPrefix="new-sub-payment"
            />
          ) : null}

          <DialogError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !client || !plan}>
              {busy ? 'Saving…' : 'Create subscription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RenewSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  baseEndDate,
  plans,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  subscription: SubscriptionWithDetails | null
  /** Latest live end date across all subscriptions, when known — renewals stack after it. */
  baseEndDate?: string | null
  plans: SubscriptionPlan[]
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const { settings } = useSettings()
  const [planId, setPlanId] = useState<number | null>(null)
  const [months, setMonths] = useState('1')
  const [price, setPrice] = useState('')
  const [recordPayment, setRecordPayment] = useState(true)
  const [fields, setFields] = useState<PaymentFieldsValue>(EMPTY_PAYMENT_FIELDS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !subscription) return
    setPlanId(subscription.planId)
    setMonths('1')
    setPrice(String(subscription.price))
    setRecordPayment(true)
    setFields({ ...EMPTY_PAYMENT_FIELDS, amount: String(subscription.price) })
    setError('')
  }, [open, subscription])

  const currentPlan = subscription ? plans.find((item) => item.id === subscription.planId) ?? null : null
  const plan = plans.find((item) => item.id === planId) ?? null
  const monthCount = parseMonths(months)
  const preview = plan && subscription
    ? computeRenewalDates(baseEndDate ?? subscription.endDate, plan, todayISO(), monthCount)
    : null

  const applyPrice = (target: SubscriptionPlan, count: number): void => {
    const total = planTotalPrice(target, count)
    setPrice(String(total))
    if (recordPayment) setFields((current) => ({ ...current, amount: String(total) }))
  }

  const handlePlanChange = (nextPlanId: number): void => {
    const next = plans.find((item) => item.id === nextPlanId) ?? null
    setPlanId(nextPlanId)
    if (next) applyPrice(next, monthCount)
  }

  const handleMonthsChange = (raw: string): void => {
    setMonths(raw)
    if (plan) applyPrice(plan, parseMonths(raw))
  }

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!subscription || !plan) {
      setError('Select a plan to continue.')
      return
    }
    setError('')
    const numericPrice = Number(price)
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError('Price must be zero or more.')
      return
    }
    const paymentAmount = Number(fields.amount)
    if (recordPayment && (!Number.isFinite(paymentAmount) || paymentAmount <= 0)) {
      setError('Enter a payment amount greater than zero, or turn off “Record payment now”.')
      return
    }
    setBusy(true)
    try {
      const result = await runAction(
        window.api.subs.renew({
          subscriptionId: subscription.id,
          planId: plan.id,
          months: monthCount,
          price: numericPrice,
          payment: recordPayment
            ? {
                amount: paymentAmount,
                paymentMethod: fields.method,
                reference: fields.reference.trim() || null
              }
            : null
        }),
        'Subscription renewed'
      )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to renew the subscription.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Renew subscription</DialogTitle>
          <DialogDescription>
            {subscription
              ? `${subscription.clientName} · current ${currentPlan?.name ?? subscription.planName} ends ${formatDate(subscription.endDate)}. Renewals extend from the latest end date.`
              : 'Renew the subscription.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <PlanSelectField
            id="renew-sub-plan"
            plans={plans}
            value={planId}
            currentId={subscription?.planId}
            onChange={handlePlanChange}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <MonthsField id="renew-sub-months" value={months} onChange={handleMonthsChange} />
            <AmountField id="renew-sub-price" value={price} currency={settings.currency} onChange={setPrice} />
          </div>

          {preview ? (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {monthCount > 1 ? `${monthCount} months of ${plan?.name ?? 'plan'} — ` : ''}New period:{' '}
              <span className="font-medium text-foreground">{formatDate(preview.startDate)}</span> →{' '}
              <span className="font-medium text-foreground">{formatDate(preview.endDate)}</span>
            </p>
          ) : null}

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={recordPayment} onCheckedChange={(checked) => setRecordPayment(checked === true)} />
            Record payment now
          </label>

          {recordPayment ? (
            <PaymentFields
              value={fields}
              onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
              currency={settings.currency}
              idPrefix="renew-sub-payment"
            />
          ) : null}

          <DialogError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !subscription || !plan}>
              {busy ? 'Renewing…' : 'Renew subscription'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ExtendSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  subscription: SubscriptionWithDetails | null
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const [days, setDays] = useState('7')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setDays('7')
    setError('')
  }, [open])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!subscription) return
    const value = Number(days)
    if (!Number.isInteger(value) || value <= 0) {
      setError('Days must be a positive whole number.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const result = await runAction(window.api.subs.extend(subscription.id, value), 'Subscription extended')
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to extend the subscription.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extend subscription</DialogTitle>
          <DialogDescription>
            {subscription
              ? `Add extra days to ${subscription.clientName}'s subscription (ends ${formatDate(subscription.endDate)}).`
              : 'Add extra days to the subscription.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="extend-days">Extra days</Label>
            <Input
              id="extend-days"
              type="number"
              min="1"
              step="1"
              value={days}
              onChange={(event) => setDays(event.target.value)}
              autoFocus
            />
          </div>

          <DialogError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !subscription}>
              {busy ? 'Extending…' : 'Extend'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  showReason = true,
  reasonLabel = 'Reason (optional)',
  onConfirm
}: {
  open: boolean
  onOpenChange(open: boolean): void
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  showReason?: boolean
  reasonLabel?: string
  onConfirm(reason: string): Promise<string | null>
}): React.JSX.Element {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setReason('')
    setError('')
  }, [open])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    try {
      const message = await onConfirm(reason.trim())
      if (message) {
        setError(message)
      } else {
        onOpenChange(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          {showReason ? (
            <div className="space-y-1.5">
              <Label htmlFor="reason-field">{reasonLabel}</Label>
              <Textarea
                id="reason-field"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                autoFocus
              />
            </div>
          ) : null}

          <DialogError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Keep as is
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={busy}>
              {busy ? 'Working…' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  subscription: SubscriptionWithDetails | null
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cancel subscription"
      description={
        subscription
          ? `Cancelling stops access immediately for ${subscription.clientName}. The record stays in the history.`
          : 'Cancel the subscription.'
      }
      confirmLabel="Cancel subscription"
      destructive
      reasonLabel="Cancellation reason (optional)"
      onConfirm={async (reason) => {
        if (!subscription) return 'No subscription selected.'
        const result = await runAction(window.api.subs.cancel(subscription.id, reason || undefined), 'Subscription cancelled')
        if (result.ok) {
          await onSaved()
          return null
        }
        return result.error ?? 'Unable to cancel the subscription.'
      }}
    />
  )
}

export function SuspendSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  subscription: SubscriptionWithDetails | null
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Suspend subscription"
      description={
        subscription
          ? `${subscription.clientName} will be denied at the turnstile until the subscription is resumed.`
          : 'Suspend the subscription.'
      }
      confirmLabel="Suspend"
      reasonLabel="Suspension reason (optional)"
      onConfirm={async (reason) => {
        if (!subscription) return 'No subscription selected.'
        const result = await runAction(window.api.subs.suspend(subscription.id, reason || undefined), 'Subscription suspended')
        if (result.ok) {
          await onSaved()
          return null
        }
        return result.error ?? 'Unable to suspend the subscription.'
      }}
    />
  )
}

export function ResumeSubscriptionDialog({
  open,
  onOpenChange,
  subscription,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  subscription: SubscriptionWithDetails | null
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Resume subscription"
      description={
        subscription
          ? `Resume access for ${subscription.clientName}. If the end date has passed, the subscription becomes expired instead.`
          : 'Resume the subscription.'
      }
      confirmLabel="Resume"
      showReason={false}
      onConfirm={async () => {
        if (!subscription) return 'No subscription selected.'
        const result = await runAction(window.api.subs.resume(subscription.id), 'Subscription resumed')
        if (result.ok) {
          await onSaved()
          return null
        }
        return result.error ?? 'Unable to resume the subscription.'
      }}
    />
  )
}

export function ChangePlanDialog({
  open,
  onOpenChange,
  subscription,
  plans,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  subscription: SubscriptionWithDetails | null
  plans: SubscriptionPlan[]
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const [planId, setPlanId] = useState<number | null>(null)
  const [recalculateEndDate, setRecalculateEndDate] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !subscription) return
    setPlanId(subscription.planId)
    setRecalculateEndDate(true)
    setError('')
  }, [open, subscription])

  const plan = plans.find((item) => item.id === planId) ?? null
  const previewEnd =
    plan && subscription
      ? recalculateEndDate
        ? planEndDate(subscription.startDate, plan)
        : subscription.endDate
      : null

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!subscription || !plan) {
      setError('Select a plan to continue.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const result = await runAction(
        window.api.subs.changePlan(subscription.id, plan.id, recalculateEndDate),
        'Plan changed'
      )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to change the plan.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            {subscription ? `Switch ${subscription.clientName} to a different plan.` : 'Change the plan.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <PlanSelectField
            id="change-plan-select"
            plans={plans}
            value={planId}
            currentId={subscription?.planId}
            onChange={setPlanId}
          />

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={recalculateEndDate} onCheckedChange={(checked) => setRecalculateEndDate(checked === true)} />
            Recalculate end date from the start of the current period
          </label>

          {previewEnd ? (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              End date will be <span className="font-medium text-foreground">{formatDate(previewEnd)}</span>.
            </p>
          ) : null}

          <DialogError message={error} />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !subscription || !plan}>
              {busy ? 'Saving…' : 'Change plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface SubscriptionActionHandlers {
  onRenew(subscription: SubscriptionWithDetails): void
  onExtend(subscription: SubscriptionWithDetails): void
  onChangePlan(subscription: SubscriptionWithDetails): void
  onSuspend(subscription: SubscriptionWithDetails): void
  onResume(subscription: SubscriptionWithDetails): void
  onCancel(subscription: SubscriptionWithDetails): void
}

export function SubscriptionRowActions({
  subscription,
  handlers
}: {
  subscription: SubscriptionWithDetails
  handlers: SubscriptionActionHandlers
}): React.JSX.Element {
  const cancelled = subscription.status === 'CANCELLED'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Subscription actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!cancelled ? (
          <>
            <DropdownMenuItem onSelect={() => handlers.onRenew(subscription)}>
              <RotateCcw className="size-4" />
              Renew
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onExtend(subscription)}>
              <CalendarPlus className="size-4" />
              Extend
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onChangePlan(subscription)}>
              <ArrowLeftRight className="size-4" />
              Change plan
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {subscription.status === 'SUSPENDED' ? (
          <DropdownMenuItem onSelect={() => handlers.onResume(subscription)}>
            <PlayCircle className="size-4" />
            Resume
          </DropdownMenuItem>
        ) : null}
        {subscription.status === 'ACTIVE' || subscription.status === 'EXPIRED' ? (
          <DropdownMenuItem onSelect={() => handlers.onSuspend(subscription)}>
            <PauseCircle className="size-4" />
            Suspend
          </DropdownMenuItem>
        ) : null}
        {!cancelled ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => handlers.onCancel(subscription)}
          >
            <XCircle className="size-4" />
            Cancel subscription
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
