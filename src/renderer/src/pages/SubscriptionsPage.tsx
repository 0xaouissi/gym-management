import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, Pencil, Plus, RefreshCw, Search, Settings2, Trash2 } from 'lucide-react'
import type { DurationUnit, Paged, SubscriptionPlan, SubscriptionStatus, SubscriptionWithDetails } from '@shared/types'
import { SUBSCRIPTION_STATUS_LABELS } from '@shared/constants'
import { formatCurrency, formatDate } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useDebouncedValue } from '@renderer/hooks/useDebouncedValue'
import { useSettings } from '@renderer/hooks/useSettings'
import { runAction } from '@renderer/lib/action'
import { PageHeader } from '@renderer/components/ui/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { Pagination } from '@renderer/components/ui/pagination'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { PaymentStatusBadge, SubscriptionStatusBadge } from '@renderer/components/ui/status-badges'
import {
  CancelSubscriptionDialog,
  ChangePlanDialog,
  ExtendSubscriptionDialog,
  RenewSubscriptionDialog,
  ResumeSubscriptionDialog,
  SubscriptionRowActions,
  SuspendSubscriptionDialog,
  type SubscriptionActionHandlers
} from '@renderer/components/subscription-dialogs'

const PAGE_SIZE = 25
const STATUS_OPTIONS: (SubscriptionStatus | 'ALL')[] = ['ALL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED']
const DURATION_UNITS: DurationUnit[] = ['DAYS', 'WEEKS', 'MONTHS']
const DURATION_UNIT_LABELS: Record<DurationUnit, string> = { DAYS: 'Days', WEEKS: 'Weeks', MONTHS: 'Months' }

function PlanForm({
  plan,
  onDone,
  onCancel
}: {
  plan: SubscriptionPlan | null
  onDone(): void | Promise<void>
  onCancel(): void
}): React.JSX.Element {
  const { settings } = useSettings()
  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')
  const [durationValue, setDurationValue] = useState(plan ? String(plan.durationValue) : '1')
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(plan?.durationUnit ?? 'MONTHS')
  const [price, setPrice] = useState(plan ? String(plan.price) : '')
  const [isActive, setIsActive] = useState(plan?.isActive ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Plan name is required.')
      return
    }
    const value = Number(durationValue)
    if (!Number.isInteger(value) || value <= 0) {
      setError('Duration must be a positive whole number.')
      return
    }
    const numericPrice = Number(price)
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError('Price must be zero or more.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const input = {
        name: trimmedName,
        description: description.trim() || null,
        durationValue: value,
        durationUnit,
        price: numericPrice,
        isActive
      }
      const result = plan
        ? await runAction(window.api.plans.update(plan.id, input), 'Plan updated')
        : await runAction(window.api.plans.create(input), 'Plan created')
      if (result.ok) {
        await onDone()
      } else {
        setError(result.error ?? 'Unable to save the plan.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="plan-name">Name *</Label>
        <Input id="plan-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="plan-description">Description</Label>
        <Input
          id="plan-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional note shown to staff"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="plan-duration">Duration *</Label>
          <Input
            id="plan-duration"
            type="number"
            min="1"
            step="1"
            value={durationValue}
            onChange={(event) => setDurationValue(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-unit">Unit</Label>
          <Select value={durationUnit} onValueChange={(next) => setDurationUnit(next as DurationUnit)}>
            <SelectTrigger id="plan-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_UNITS.map((unit) => (
                <SelectItem key={unit} value={unit}>
                  {DURATION_UNIT_LABELS[unit]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-price">Price ({settings.currency}) *</Label>
          <Input
            id="plan-price"
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
        Active — can be chosen for new subscriptions
      </label>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Back to list
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}
        </Button>
      </DialogFooter>
    </form>
  )
}

function PlansDialog({
  open,
  onOpenChange,
  onChanged
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onChanged(): void | Promise<void>
}): React.JSX.Element {
  const { settings } = useSettings()
  const plans = useAsyncData(() => window.api.plans.list(true), [], { live: true })
  const [editing, setEditing] = useState<SubscriptionPlan | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SubscriptionPlan | null>(null)

  const deletePlan = async (): Promise<void> => {
    if (!deleteTarget) return
    const result = await runAction(window.api.plans.delete(deleteTarget.id), 'Plan deleted')
    setDeleteTarget(null)
    if (result.ok) await onChanged()
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next)
          if (!next) setEditing(null)
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? (editing === 'new' ? 'New plan' : `Edit ${editing.name}`) : 'Subscription plans'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Plans define the duration and list price used when creating or renewing subscriptions.'
                : `Prices are in ${settings.currency}. Inactive plans stay on existing subscriptions but can't be picked for new ones.`}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <PlanForm
              key={editing === 'new' ? 'new' : editing.id}
              plan={editing === 'new' ? null : editing}
              onDone={async () => {
                setEditing(null)
                await onChanged()
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <>
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setEditing('new')}>
                  <Plus className="mr-1.5 size-4" />
                  New plan
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border">
                {plans.loading ? (
                  <LoadingPanel label="Loading plans…" />
                ) : (plans.data ?? []).length === 0 ? (
                  <EmptyState title="No plans yet" description="Create your first plan to start selling subscriptions." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(plans.data ?? []).map((plan) => (
                        <TableRow key={plan.id}>
                          <TableCell>
                            <p className="font-medium">{plan.name}</p>
                            {plan.description ? <p className="text-xs text-muted-foreground">{plan.description}</p> : null}
                          </TableCell>
                          <TableCell className="text-sm">
                            {plan.durationValue} {DURATION_UNIT_LABELS[plan.durationUnit].toLowerCase()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(plan.price, settings.currency)}</TableCell>
                          <TableCell>
                            <Badge variant={plan.isActive ? 'success' : 'muted'}>{plan.isActive ? 'Active' : 'Inactive'}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon-sm" title="Edit plan" onClick={() => setEditing(plan)}>
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Delete plan"
                                onClick={() => setDeleteTarget(plan)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}

          {!editing ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null)
        }}
        title="Delete plan"
        description={
          deleteTarget
            ? `Delete “${deleteTarget.name}”? Plans in use by subscriptions can't be deleted — deactivate them instead.`
            : ''
        }
        confirmLabel="Delete plan"
        destructive
        onConfirm={deletePlan}
      />
    </>
  )
}

export function SubscriptionsPage(): React.JSX.Element {
  const { settings } = useSettings()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [status, setStatus] = useState<SubscriptionStatus | 'ALL'>('ALL')
  const [expiringOnly, setExpiringOnly] = useState(false)
  const [page, setPage] = useState(1)

  const subscriptions = useAsyncData(
    () =>
      window.api.subs.list({
        search: debouncedSearch.trim() || undefined,
        status,
        expiringOnly,
        page,
        pageSize: PAGE_SIZE
      }),
    [debouncedSearch, status, expiringOnly, page],
    { live: true }
  )

  const plans = useAsyncData(() => window.api.plans.list(true), [])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, expiringOnly])

  const [plansOpen, setPlansOpen] = useState(false)
  const [renewTarget, setRenewTarget] = useState<SubscriptionWithDetails | null>(null)
  const [extendTarget, setExtendTarget] = useState<SubscriptionWithDetails | null>(null)
  const [changePlanTarget, setChangePlanTarget] = useState<SubscriptionWithDetails | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<SubscriptionWithDetails | null>(null)
  const [resumeTarget, setResumeTarget] = useState<SubscriptionWithDetails | null>(null)
  const [cancelTarget, setCancelTarget] = useState<SubscriptionWithDetails | null>(null)

  const data: Paged<SubscriptionWithDetails> = subscriptions.data ?? { items: [], total: 0 }
  const planList = plans.data ?? []

  const subscriptionHandlers: SubscriptionActionHandlers = {
    onRenew: setRenewTarget,
    onExtend: setExtendTarget,
    onChangePlan: setChangePlanTarget,
    onSuspend: setSuspendTarget,
    onResume: setResumeTarget,
    onCancel: setCancelTarget
  }

  if (subscriptions.loading) return <LoadingPanel label="Loading subscriptions…" />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Every subscription across all clients — renew, extend or adjust them here."
        actions={
          <>
            <Button variant="outline" onClick={() => void subscriptions.refresh()}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => setPlansOpen(true)}>
              <Settings2 className="mr-2 size-4" />
              Manage plans
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by client, plan or subscription #…"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={(next) => setStatus(next as SubscriptionStatus | 'ALL')}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option === 'ALL' ? 'All statuses' : SUBSCRIPTION_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={expiringOnly} onCheckedChange={(checked) => setExpiringOnly(checked === true)} />
          Expiring in {settings.expirationWarningDays} days
        </label>
      </div>

      <div>
        <div className="rounded-xl border bg-card">
          {data.items.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No subscriptions found"
              description={
                search || status !== 'ALL' || expiringOnly
                  ? 'Try adjusting the filters or search term.'
                  : 'Create a subscription from a client page to get started.'
              }
              className="py-12"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((subscription) => (
                  <TableRow key={subscription.id}>
                    <TableCell>
                      <Link
                        to={`/clients/${subscription.clientId}`}
                        className="font-medium hover:underline"
                      >
                        {subscription.clientName}
                      </Link>
                      <p className="text-xs text-muted-foreground">#{subscription.id}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{subscription.planName}</p>
                      <p className="text-xs text-muted-foreground">
                        {subscription.planDurationValue} {subscription.planDurationUnit.toLowerCase()}
                        {subscription.isRenewal ? ' · renewal' : ''}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(subscription.startDate)} → {formatDate(subscription.endDate)}
                    </TableCell>
                    <TableCell>
                      <SubscriptionStatusBadge status={subscription.status} />
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={subscription.paymentStatus} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatCurrency(subscription.paidAmount, settings.currency)} /{' '}
                        {formatCurrency(subscription.price, settings.currency)}
                      </p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(subscription.price, settings.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <SubscriptionRowActions subscription={subscription} handlers={subscriptionHandlers} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPageChange={setPage} />
      </div>

      {planList.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No active plans yet — open{' '}
          <button type="button" className="underline hover:text-foreground" onClick={() => setPlansOpen(true)}>
            Manage plans
          </button>{' '}
          to create one so new subscriptions can be sold.
        </p>
      ) : null}

      <PlansDialog
        open={plansOpen}
        onOpenChange={setPlansOpen}
        onChanged={async () => {
          await plans.refresh()
          await subscriptions.refresh()
        }}
      />

      <RenewSubscriptionDialog
        open={renewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenewTarget(null)
        }}
        subscription={renewTarget}
        plans={planList}
        onSaved={() => subscriptions.refresh()}
      />

      <ExtendSubscriptionDialog
        open={extendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExtendTarget(null)
        }}
        subscription={extendTarget}
        onSaved={() => subscriptions.refresh()}
      />

      <ChangePlanDialog
        open={changePlanTarget !== null}
        onOpenChange={(open) => {
          if (!open) setChangePlanTarget(null)
        }}
        subscription={changePlanTarget}
        plans={planList}
        onSaved={() => subscriptions.refresh()}
      />

      <SuspendSubscriptionDialog
        open={suspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSuspendTarget(null)
        }}
        subscription={suspendTarget}
        onSaved={() => subscriptions.refresh()}
      />

      <ResumeSubscriptionDialog
        open={resumeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResumeTarget(null)
        }}
        subscription={resumeTarget}
        onSaved={() => subscriptions.refresh()}
      />

      <CancelSubscriptionDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
        subscription={cancelTarget}
        onSaved={() => subscriptions.refresh()}
      />
    </div>
  )
}
