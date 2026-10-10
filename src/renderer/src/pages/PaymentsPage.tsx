import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import {
  Banknote,
  CircleDollarSign,
  CreditCard,
  Download,
  Landmark,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  Wallet
} from 'lucide-react'
import type {
  ClientListItem,
  PaymentMethod,
  PaymentWithDetails,
  SubscriptionWithDetails
} from '@shared/types'
import { PAYMENT_METHOD_LABELS } from '@shared/constants'
import { clientFullName, formatCurrency, formatDate, formatNumber, todayISO } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useDebouncedValue } from '@renderer/hooks/useDebouncedValue'
import { useSettings } from '@renderer/hooks/useSettings'
import { runAction, runExport } from '@renderer/lib/action'
import { exportCsv, timestampedName, type ExportColumn } from '@renderer/lib/export'
import { PageHeader } from '@renderer/components/ui/page-header'
import { StatCard } from '@renderer/components/ui/stat-card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Textarea } from '@renderer/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { Pagination } from '@renderer/components/ui/pagination'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { PaymentFields, EMPTY_PAYMENT_FIELDS, type PaymentFieldsValue } from '@renderer/components/payment-dialog'

type RangePreset = 'TODAY' | 'LAST_7' | 'LAST_30' | 'ALL' | 'CUSTOM'

const PAGE_SIZE = 25
const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'TODAY', label: 'Today' },
  { value: 'LAST_7', label: 'Last 7 days' },
  { value: 'LAST_30', label: 'Last 30 days' },
  { value: 'ALL', label: 'All time' },
  { value: 'CUSTOM', label: 'Custom range' }
]
const METHOD_OPTIONS: (PaymentMethod | 'ALL')[] = ['ALL', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER']

function presetRange(preset: RangePreset): { from: string; to: string } | null {
  const today = todayISO()
  if (preset === 'TODAY') return { from: today, to: today }
  if (preset === 'LAST_7') return { from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: today }
  if (preset === 'LAST_30') return { from: format(subDays(new Date(), 29), 'yyyy-MM-dd'), to: today }
  return null
}

function RecordPaymentForDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const { settings } = useSettings()
  const [clientSearch, setClientSearch] = useState('')
  const debouncedSearch = useDebouncedValue(clientSearch)
  const [selected, setSelected] = useState<ClientListItem | null>(null)
  const [fields, setFields] = useState<PaymentFieldsValue>(EMPTY_PAYMENT_FIELDS)
  const [paymentDate, setPaymentDate] = useState(todayISO())
  const [subscriptionId, setSubscriptionId] = useState('AUTO')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setClientSearch('')
    setSelected(null)
    setFields(EMPTY_PAYMENT_FIELDS)
    setPaymentDate(todayISO())
    setSubscriptionId('AUTO')
    setNotes('')
    setError('')
  }, [open])

  const results = useAsyncData<ClientListItem[]>(
    () =>
      !selected && debouncedSearch.trim().length >= 2
        ? window.api.clients.globalSearch(debouncedSearch.trim())
        : Promise.resolve([]),
    [debouncedSearch, selected]
  )

  const subscriptions = useAsyncData<SubscriptionWithDetails[]>(
    () => (selected ? window.api.subs.forClient(selected.id) : Promise.resolve([])),
    [selected]
  )
  const subscriptionOptions = (subscriptions.data ?? []).filter(
    (subscription) => subscription.status !== 'CANCELLED'
  )

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    if (!selected) {
      setError('Select the member this payment belongs to.')
      return
    }
    const amount = Number(fields.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setBusy(true)
    try {
      const result = await runAction(
        window.api.payments.create({
          clientId: selected.id,
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
            Register a cash, card or transfer payment and attach it to a subscription when relevant.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="payment-client-search">Member *</Label>
            {selected ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{clientFullName(selected)}</p>
                  <p className="text-xs text-muted-foreground">{selected.phone ?? 'No phone'} · #{selected.id}</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="payment-client-search"
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Search by name, phone or card…"
                    className="pl-8"
                  />
                </div>
                {clientSearch.trim().length >= 2 && !selected ? (
                  <div className="max-h-48 overflow-y-auto rounded-md border">
                    {results.loading ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
                    ) : (results.data ?? []).length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No member matches this search.</p>
                    ) : (
                      <ul className="divide-y">
                        {(results.data ?? []).map((client) => (
                          <li key={client.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setSelected(client)
                                setSubscriptionId('AUTO')
                              }}
                            >
                              <span className="font-medium">{clientFullName(client)}</span>
                              <span className="text-xs text-muted-foreground">{client.phone ?? `#${client.id}`}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <PaymentFields
            value={fields}
            onChange={(patch) => setFields((current) => ({ ...current, ...patch }))}
            currency={settings.currency}
            idPrefix="new-payment"
          />

          {subscriptionOptions.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="payment-subscription">Apply to subscription</Label>
              <Select value={subscriptionId} onValueChange={setSubscriptionId}>
                <SelectTrigger id="payment-subscription">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Latest subscription (automatic)</SelectItem>
                  {subscriptionOptions.map((subscription) => (
                    <SelectItem key={subscription.id} value={String(subscription.id)}>
                      #{subscription.id} · {subscription.planName} · ends {formatDate(subscription.endDate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="new-payment-date">Payment date</Label>
            <Input
              id="new-payment-date"
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-payment-notes">Notes</Label>
            <Textarea
              id="new-payment-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional note stored with the payment"
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
            <Button type="submit" disabled={busy || !selected}>
              {busy ? 'Saving…' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function PaymentsPage(): React.JSX.Element {
  const { settings } = useSettings()
  const initial = presetRange('LAST_30') ?? { from: '', to: '' }
  const [preset, setPreset] = useState<RangePreset>('LAST_30')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [method, setMethod] = useState<PaymentMethod | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PaymentWithDetails | null>(null)

  const payments = useAsyncData(
    () =>
      window.api.payments.list({
        from: from || undefined,
        to: to || undefined,
        method,
        search: debouncedSearch.trim() || undefined,
        page,
        pageSize: PAGE_SIZE
      }),
    [from, to, method, debouncedSearch, page]
  )

  const revenue = useAsyncData(
    () => window.api.reports.revenue({ from: from || '1970-01-01', to: to || todayISO(), groupBy: 'DAY' }),
    [from, to]
  )

  useEffect(() => {
    setPage(1)
  }, [from, to, method, debouncedSearch])

  const rangeRows = revenue.data ?? []
  const collected = rangeRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0)
  const paymentCount = rangeRows.reduce((sum, row) => sum + Number(row.count ?? 0), 0)
  const average = paymentCount > 0 ? collected / paymentCount : 0
  const today = todayISO()
  const todayAmount = rangeRows
    .filter((row) => String(row.period) === today)
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

  const mix = useMemo(() => {
    const sum = (key: string): number =>
      (revenue.data ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0)
    return [
      { method: 'CASH' as PaymentMethod, amount: sum('cash'), icon: Banknote },
      { method: 'CARD' as PaymentMethod, amount: sum('card'), icon: CreditCard },
      { method: 'BANK_TRANSFER' as PaymentMethod, amount: sum('bankTransfer'), icon: Landmark },
      { method: 'OTHER' as PaymentMethod, amount: sum('other'), icon: Wallet }
    ]
  }, [revenue.data])

  const applyPreset = (next: RangePreset): void => {
    setPreset(next)
    const range = presetRange(next)
    if (range) {
      setFrom(range.from)
      setTo(range.to)
    }
  }

  const exportColumns: ExportColumn<PaymentWithDetails>[] = [
    { header: 'Date', value: (row) => row.paymentDate },
    { header: 'Member', value: (row) => row.clientName },
    { header: 'Plan', value: (row) => row.planName ?? '' },
    { header: 'Amount', value: (row) => row.amount },
    { header: 'Method', value: (row) => PAYMENT_METHOD_LABELS[row.paymentMethod] },
    { header: 'Reference', value: (row) => row.reference ?? '' },
    { header: 'Notes', value: (row) => row.notes ?? '' }
  ]

  const exportData = async (): Promise<void> => {
    const batch = await window.api.payments.list({
      from: from || undefined,
      to: to || undefined,
      method,
      search: debouncedSearch.trim() || undefined,
      page: 1,
      pageSize: 200
    })
    await runExport(exportCsv(timestampedName('payments', 'csv'), exportColumns, batch.items), 'Payments list')
  }

  const deletePayment = async (): Promise<void> => {
    if (!deleteTarget) return
    const result = await runAction(window.api.payments.delete(deleteTarget.id), 'Payment deleted')
    setDeleteTarget(null)
    if (result.ok) {
      await payments.refresh()
      await revenue.refresh()
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description="Cash, card and transfer payments collected at the desk."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void exportData()}>
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void payments.reload()
                void revenue.reload()
              }}
            >
              <RefreshCw className={payments.loading ? 'size-4 animate-spin' : 'size-4'} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Record payment
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Collected in range"
          value={formatCurrency(collected, settings.currency)}
          hint={from && to ? `${formatDate(from)} → ${formatDate(to)}` : 'All recorded payments'}
          icon={CircleDollarSign}
          tone="success"
        />
        <StatCard
          label="Payments in range"
          value={formatNumber(paymentCount)}
          hint={paymentCount === 1 ? '1 transaction' : `${formatNumber(paymentCount)} transactions`}
          icon={Receipt}
        />
        <StatCard
          label="Average payment"
          value={formatCurrency(average, settings.currency)}
          hint="Across the selected period"
          icon={TrendingUp}
          tone="info"
        />
        <StatCard
          label="Collected today"
          value={formatCurrency(todayAmount, settings.currency)}
          hint={formatDate(today)}
          icon={Wallet}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by member, reference or payment #…"
            className="pl-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payments-period">Period</Label>
          <Select value={preset} onValueChange={(next) => applyPreset(next as RangePreset)}>
            <SelectTrigger id="payments-period" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payments-from">From</Label>
          <Input
            id="payments-from"
            type="date"
            value={from}
            onChange={(event) => {
              setPreset('CUSTOM')
              setFrom(event.target.value)
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payments-to">To</Label>
          <Input
            id="payments-to"
            type="date"
            value={to}
            onChange={(event) => {
              setPreset('CUSTOM')
              setTo(event.target.value)
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payments-method">Method</Label>
          <Select value={method} onValueChange={(next) => setMethod(next as PaymentMethod | 'ALL')}>
            <SelectTrigger id="payments-method" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METHOD_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'ALL' ? 'All methods' : PAYMENT_METHOD_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border bg-card">
          {payments.loading && !payments.data ? (
            <LoadingPanel label="Loading payments…" />
          ) : (payments.data?.items ?? []).length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No payments found"
              description={
                search || method !== 'ALL' || preset !== 'LAST_30'
                  ? 'Try a wider period or clear the filters.'
                  : 'Record the first payment to see it here.'
              }
              className="py-12"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payments.data?.items ?? []).map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>
                      <Link to={`/clients/${payment.clientId}`} className="font-medium hover:underline">
                        {payment.clientName}
                      </Link>
                      <p className="text-xs text-muted-foreground">#{payment.id}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {payment.planName ?? <span className="text-muted-foreground">Not linked</span>}
                      {payment.subscriptionId ? (
                        <p className="text-xs text-muted-foreground">Subscription #{payment.subscriptionId}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(payment.amount, settings.currency)}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md border px-2 py-1 text-xs">
                        {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                      {payment.reference ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Delete payment"
                        onClick={() => setDeleteTarget(payment)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payment methods</CardTitle>
            <CardDescription>How members paid within the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {revenue.loading && !revenue.data ? (
              <LoadingPanel label="Loading breakdown…" />
            ) : collected === 0 ? (
              <p className="text-sm text-muted-foreground">No payments collected in this period.</p>
            ) : (
              mix.map((entry) => {
                const share = collected > 0 ? (entry.amount / collected) * 100 : 0
                const Icon = entry.icon
                return (
                  <div key={entry.method} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="size-4 text-muted-foreground" />
                        {PAYMENT_METHOD_LABELS[entry.method]}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCurrency(entry.amount, settings.currency)}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                    </div>
                    <p className="text-right text-xs text-muted-foreground">{share.toFixed(0)}% of collections</p>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Pagination page={page} pageSize={PAGE_SIZE} total={payments.data?.total ?? 0} onPageChange={setPage} />
      <p className="text-right text-xs text-muted-foreground">
        CSV export contains up to 200 of the most recent matching payments.
      </p>

      <RecordPaymentForDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={async () => {
          await payments.refresh()
          await revenue.refresh()
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null)
        }}
        title="Delete this payment?"
        description={
          deleteTarget
            ? `The ${formatCurrency(deleteTarget.amount, settings.currency)} payment of ${deleteTarget.clientName} on ${formatDate(deleteTarget.paymentDate)} will be removed and the subscription payment status recalculated. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete payment"
        destructive
        onConfirm={deletePayment}
      />
    </div>
  )
}
