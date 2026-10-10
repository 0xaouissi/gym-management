import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Banknote,
  Ban,
  CalendarClock,
  CreditCard,
  History,
  Nfc,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Timer,
  Trash2,
  UserRound,
  Wallet
} from 'lucide-react'
import type { PaymentWithDetails, SubscriptionWithDetails } from '@shared/types'
import { ACCESS_REASON_LABELS, PAYMENT_METHOD_LABELS } from '@shared/constants'
import { clientFullName, daysUntil, formatCurrency, formatDate, formatDateTime } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useSettings } from '@renderer/hooks/useSettings'
import { runAction } from '@renderer/lib/action'
import { Button, buttonVariants } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { PageHeader } from '@renderer/components/ui/page-header'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { StatCard } from '@renderer/components/ui/stat-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import {
  AccessResultBadge,
  CardStatusBadge,
  ClientStatusBadge,
  PaymentStatusBadge,
  SubscriptionStatusBadge
} from '@renderer/components/ui/status-badges'
import { ClientFormDialog } from '@renderer/components/client-form-dialog'
import { RecordPaymentDialog } from '@renderer/components/payment-dialog'
import { ScanUidButton } from '@renderer/components/scan-uid-button'
import {
  CancelSubscriptionDialog,
  ChangePlanDialog,
  ExtendSubscriptionDialog,
  NewSubscriptionDialog,
  RenewSubscriptionDialog,
  ResumeSubscriptionDialog,
  SubscriptionRowActions,
  SuspendSubscriptionDialog,
  type SubscriptionActionHandlers
} from '@renderer/components/subscription-dialogs'

function InfoRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function CardFormDialog({
  open,
  onOpenChange,
  mode,
  clientId,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  mode: 'assign' | 'replace'
  clientId: number
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const [uid, setUid] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setUid('')
    setCardNumber('')
    setError('')
  }, [open])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const normalized = uid.trim().toUpperCase()
    if (!normalized) {
      setError('Scan or type the card UID first.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const payload = { clientId, uid: normalized, cardNumber: cardNumber.trim() || null }
      const result =
        mode === 'assign'
          ? await runAction(window.api.rfid.assign(payload), 'Card assigned')
          : await runAction(
              window.api.rfid.replace({ clientId, newUid: normalized, cardNumber: cardNumber.trim() || null }),
              'Card replaced'
            )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to save the card.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'assign' ? 'Assign RFID card' : 'Replace RFID card'}</DialogTitle>
          <DialogDescription>
            {mode === 'assign'
              ? 'Scan a card with the reader or type its UID manually.'
              : 'Replacing revokes the current card and assigns the new one in one step.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-uid">Card UID *</Label>
            <div className="flex gap-2">
              <Input
                id="card-uid"
                value={uid}
                onChange={(event) => setUid(event.target.value.toUpperCase())}
                placeholder="e.g. AABBCCDDEE"
                className="font-mono"
              />
              <ScanUidButton onCaptured={(captured) => setUid(captured.toUpperCase())} disabled={busy} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="card-number">Card number</Label>
            <Input
              id="card-number"
              value={cardNumber}
              onChange={(event) => setCardNumber(event.target.value)}
              placeholder="Printed number on the card (optional)"
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
              {busy ? 'Saving…' : mode === 'assign' ? 'Assign card' : 'Replace card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ClientDetailPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>()
  const clientId = Number(id)
  const navigate = useNavigate()
  const { settings } = useSettings()

  const detail = useAsyncData(
    () => (Number.isFinite(clientId) ? window.api.clients.get(clientId) : Promise.resolve(null)),
    [clientId],
    { live: true }
  )
  const plans = useAsyncData(() => window.api.plans.list(true), [])

  const [editOpen, setEditOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [newSubOpen, setNewSubOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cardDialog, setCardDialog] = useState<'assign' | 'replace' | null>(null)
  const [cardBlockOpen, setCardBlockOpen] = useState(false)
  const [revokeCardOpen, setRevokeCardOpen] = useState(false)
  const [paymentToDelete, setPaymentToDelete] = useState<PaymentWithDetails | null>(null)
  const [renewTarget, setRenewTarget] = useState<SubscriptionWithDetails | null>(null)
  const [extendTarget, setExtendTarget] = useState<SubscriptionWithDetails | null>(null)
  const [changePlanTarget, setChangePlanTarget] = useState<SubscriptionWithDetails | null>(null)
  const [suspendTarget, setSuspendTarget] = useState<SubscriptionWithDetails | null>(null)
  const [resumeTarget, setResumeTarget] = useState<SubscriptionWithDetails | null>(null)
  const [cancelTarget, setCancelTarget] = useState<SubscriptionWithDetails | null>(null)

  const client = detail.data

  const latestEndDate = useMemo(() => {
    const live = (client?.subscriptions ?? []).filter((subscription) => subscription.status !== 'CANCELLED')
    if (live.length === 0) return null
    return live.reduce((max, subscription) => (subscription.endDate > max ? subscription.endDate : max), live[0].endDate)
  }, [client])

  if (detail.loading) return <LoadingPanel label="Loading client…" />

  if (!client) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Client not found"
          description={detail.error ?? 'This client may have been deleted.'}
          actions={
            <Link to="/clients" className={buttonVariants({ variant: 'outline' })}>
              <ArrowLeft className="mr-2 size-4" />
              Back to clients
            </Link>
          }
        />
        <div className="rounded-xl border bg-card">
          <EmptyState icon={UserRound} title="Nothing to show" description="The requested client does not exist in this database." />
        </div>
      </div>
    )
  }

  const currency = settings.currency
  const name = clientFullName(client)
  const currentSubscription = client.currentSubscription
  const card = client.rfidCard
  const planList = plans.data ?? []

  const daysLeft = currentSubscription ? daysUntil(currentSubscription.endDate) : null
  const daysLeftLabel =
    daysLeft === null
      ? '—'
      : daysLeft > 1
        ? `${daysLeft} days`
        : daysLeft === 1
          ? '1 day'
          : daysLeft === 0
            ? 'Today'
            : `${Math.abs(daysLeft)} days ago`
  const daysTone: 'default' | 'success' | 'warning' | 'destructive' =
    daysLeft === null ? 'default' : daysLeft < 0 ? 'destructive' : daysLeft <= settings.expirationWarningDays ? 'warning' : 'success'

  const toggleBlock = async (): Promise<void> => {
    const next = client.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED'
    const result = await runAction(
      window.api.clients.update(client.id, { status: next }),
      next === 'BLOCKED' ? 'Client blocked' : 'Client unblocked'
    )
    setBlockOpen(false)
    if (result.ok) await detail.refresh()
  }

  const removeClient = async (): Promise<void> => {
    const result = await runAction(window.api.clients.delete(client.id), 'Client deleted')
    setDeleteOpen(false)
    if (result.ok) navigate('/clients')
  }

  const removePayment = async (): Promise<void> => {
    if (!paymentToDelete) return
    const result = await runAction(window.api.payments.delete(paymentToDelete.id), 'Payment deleted')
    setPaymentToDelete(null)
    if (result.ok) await detail.refresh()
  }

  const toggleCardBlock = async (): Promise<void> => {
    if (!card) return
    const result =
      card.status === 'BLOCKED'
        ? await runAction(window.api.rfid.unblock(card.id), 'Card unblocked')
        : await runAction(window.api.rfid.block(card.id), 'Card blocked')
    setCardBlockOpen(false)
    if (result.ok) await detail.refresh()
  }

  const revokeCard = async (): Promise<void> => {
    if (!card) return
    const result = await runAction(window.api.rfid.revoke(card.id), 'Card revoked')
    setRevokeCardOpen(false)
    if (result.ok) await detail.refresh()
  }

  const subscriptionHandlers: SubscriptionActionHandlers = {
    onRenew: setRenewTarget,
    onExtend: setExtendTarget,
    onChangePlan: setChangePlanTarget,
    onSuspend: setSuspendTarget,
    onResume: setResumeTarget,
    onCancel: setCancelTarget
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        description={`Client #${client.id} · member since ${formatDate(client.createdAt)}`}
        actions={
          <>
            <Link to="/clients" className={buttonVariants({ variant: 'outline' })}>
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Link>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 size-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={() => setBlockOpen(true)}>
              {client.status === 'BLOCKED' ? (
                <ShieldCheck className="mr-2 size-4" />
              ) : (
                <Ban className="mr-2 size-4" />
              )}
              {client.status === 'BLOCKED' ? 'Unblock' : 'Block'}
            </Button>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 size-4" />
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total paid"
          value={formatCurrency(client.totals.totalPaid, currency)}
          hint={`${client.payments.length} payment${client.payments.length === 1 ? '' : 's'} recorded`}
          icon={Wallet}
          tone="success"
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(client.totals.outstanding, currency)}
          hint={currentSubscription ? `on subscription #${currentSubscription.id}` : 'no active subscription'}
          icon={CreditCard}
          tone={client.totals.outstanding > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label="Subscription ends"
          value={currentSubscription ? formatDate(currentSubscription.endDate) : '—'}
          hint={currentSubscription ? currentSubscription.planName : 'no subscription yet'}
          icon={CalendarClock}
          tone={daysLeft !== null && daysLeft < 0 ? 'destructive' : 'default'}
        />
        <StatCard label="Days left" value={daysLeftLabel} hint="until the current period ends" icon={Timer} tone={daysTone} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Tabs defaultValue="subscriptions">
            <TabsList>
              <TabsTrigger value="subscriptions">Subscriptions ({client.subscriptions.length})</TabsTrigger>
              <TabsTrigger value="payments">Payments ({client.payments.length})</TabsTrigger>
              <TabsTrigger value="access">Access ({client.recentAccess.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="subscriptions" className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setNewSubOpen(true)} disabled={planList.length === 0}>
                  <Plus className="mr-1.5 size-4" />
                  New subscription
                </Button>
              </div>
              <div className="rounded-xl border bg-card">
                {client.subscriptions.length === 0 ? (
                  <EmptyState
                    icon={CalendarClock}
                    title="No subscriptions yet"
                    description="Create the first subscription to grant turnstile access."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plan</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {client.subscriptions.map((subscription) => (
                        <TableRow key={subscription.id}>
                          <TableCell>
                            <p className="font-medium">{subscription.planName}</p>
                            <p className="text-xs text-muted-foreground">
                              #{subscription.id}
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
                              {formatCurrency(subscription.paidAmount, currency)} / {formatCurrency(subscription.price, currency)}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(subscription.price, currency)}
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
            </TabsContent>

            <TabsContent value="payments" className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setPaymentOpen(true)}>
                  <Plus className="mr-1.5 size-4" />
                  Record payment
                </Button>
              </div>
              <div className="rounded-xl border bg-card">
                {client.payments.length === 0 ? (
                  <EmptyState icon={Banknote} title="No payments yet" description="Payments recorded for this client will appear here." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {client.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDate(payment.paymentDate)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(payment.amount, currency)}
                          </TableCell>
                          <TableCell className="text-sm">{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</TableCell>
                          <TableCell className="text-sm">{payment.planName ?? '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{payment.reference ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Delete payment"
                              onClick={() => setPaymentToDelete(payment)}
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
            </TabsContent>

            <TabsContent value="access" className="space-y-3">
              <div className="rounded-xl border bg-card">
                {client.recentAccess.length === 0 ? (
                  <EmptyState icon={History} title="No access attempts" description="Turnstile scans for this client will appear here." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>UID</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Device</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {client.recentAccess.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-sm">{formatDateTime(log.timestamp)}</TableCell>
                          <TableCell className="font-mono text-xs">{log.rfidUid}</TableCell>
                          <TableCell>
                            <AccessResultBadge result={log.result} />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{ACCESS_REASON_LABELS[log.reason]}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{log.deviceId ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Status" value={<ClientStatusBadge status={client.status} />} />
              <InfoRow label="Phone" value={client.phone || '—'} />
              <InfoRow label="Email" value={client.email || '—'} />
              <InfoRow label="Date of birth" value={client.dateOfBirth ? formatDate(client.dateOfBirth) : '—'} />
              <InfoRow label="Address" value={client.address || '—'} />
              {client.notes ? (
                <div className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{client.notes}</div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Nfc className="size-4" />
                RFID card
              </CardTitle>
              {!card ? (
                <Button size="sm" variant="outline" onClick={() => setCardDialog('assign')}>
                  <Plus className="mr-1.5 size-3.5" />
                  Assign
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {card ? (
                <>
                  <div className="rounded-lg border bg-muted/40 px-3 py-2">
                    <p className="font-mono text-sm tracking-wider">{card.uid}</p>
                    <p className="text-xs text-muted-foreground">
                      {card.cardNumber ? `Card ${card.cardNumber} · ` : ''}issued {formatDate(card.issuedAt)}
                    </p>
                  </div>
                  <InfoRow label="Status" value={<CardStatusBadge status={card.status} />} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setCardDialog('replace')}>
                      <RefreshCw className="mr-1.5 size-3.5" />
                      Replace
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCardBlockOpen(true)}>
                      {card.status === 'BLOCKED' ? (
                        <ShieldCheck className="mr-1.5 size-3.5" />
                      ) : (
                        <Ban className="mr-1.5 size-3.5" />
                      )}
                      {card.status === 'BLOCKED' ? 'Unblock' : 'Block'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => setRevokeCardOpen(true)}
                    >
                      <Trash2 className="mr-1.5 size-3.5" />
                      Revoke
                    </Button>
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={Nfc}
                  title="No active card"
                  description="Assign an RFID card so this client can enter through the turnstile."
                  className="py-6"
                />
              )}
            </CardContent>
          </Card>

          {client.rfidCards.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Card history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {client.rfidCards.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs">{item.uid}</p>
                      <p className="text-xs text-muted-foreground">
                        issued {formatDate(item.issuedAt)}
                        {item.revokedAt ? ` · revoked ${formatDate(item.revokedAt)}` : ''}
                      </p>
                    </div>
                    <CardStatusBadge status={item.status} />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} onSaved={() => detail.refresh()} />

      <ConfirmDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={client.status === 'BLOCKED' ? 'Unblock client' : 'Block client'}
        description={
          client.status === 'BLOCKED'
            ? `${name} will be allowed through the turnstile again when their subscription is valid.`
            : `${name} will be denied at the turnstile until unblocked, even with a valid subscription.`
        }
        confirmLabel={client.status === 'BLOCKED' ? 'Unblock' : 'Block'}
        destructive={client.status !== 'BLOCKED'}
        onConfirm={toggleBlock}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete client"
        description={`This permanently deletes ${name} together with their subscriptions, cards and payments. Access logs are kept for auditing.`}
        confirmLabel="Delete client"
        destructive
        onConfirm={removeClient}
      />

      <CardFormDialog
        open={cardDialog !== null}
        onOpenChange={(open) => {
          if (!open) setCardDialog(null)
        }}
        mode={cardDialog ?? 'assign'}
        clientId={client.id}
        onSaved={() => detail.refresh()}
      />

      <ConfirmDialog
        open={cardBlockOpen}
        onOpenChange={setCardBlockOpen}
        title={card?.status === 'BLOCKED' ? 'Unblock card' : 'Block card'}
        description={
          card?.status === 'BLOCKED'
            ? 'The card will work again as long as everything else is valid.'
            : 'A blocked card is denied at the turnstile even if the client is active.'
        }
        confirmLabel={card?.status === 'BLOCKED' ? 'Unblock card' : 'Block card'}
        destructive={card?.status !== 'BLOCKED'}
        onConfirm={toggleCardBlock}
      />

      <ConfirmDialog
        open={revokeCardOpen}
        onOpenChange={setRevokeCardOpen}
        title="Revoke card"
        description="Revoking retires the card permanently — it can never be re-assigned. The client will need a new card."
        confirmLabel="Revoke card"
        destructive
        onConfirm={revokeCard}
      />

      <ConfirmDialog
        open={paymentToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPaymentToDelete(null)
        }}
        title="Delete payment"
        description={
          paymentToDelete
            ? `Delete the ${formatCurrency(paymentToDelete.amount, currency)} payment from ${formatDate(paymentToDelete.paymentDate)}? Subscription totals will be recalculated.`
            : ''
        }
        confirmLabel="Delete payment"
        destructive
        onConfirm={removePayment}
      />

      <NewSubscriptionDialog
        open={newSubOpen}
        onOpenChange={setNewSubOpen}
        client={{ id: client.id, name }}
        plans={planList}
        onSaved={() => detail.refresh()}
      />

      <RenewSubscriptionDialog
        open={renewTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenewTarget(null)
        }}
        subscription={renewTarget}
        baseEndDate={latestEndDate}
        plans={planList}
        onSaved={() => detail.refresh()}
      />

      <ExtendSubscriptionDialog
        open={extendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setExtendTarget(null)
        }}
        subscription={extendTarget}
        onSaved={() => detail.refresh()}
      />

      <ChangePlanDialog
        open={changePlanTarget !== null}
        onOpenChange={(open) => {
          if (!open) setChangePlanTarget(null)
        }}
        subscription={changePlanTarget}
        plans={planList}
        onSaved={() => detail.refresh()}
      />

      <SuspendSubscriptionDialog
        open={suspendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setSuspendTarget(null)
        }}
        subscription={suspendTarget}
        onSaved={() => detail.refresh()}
      />

      <ResumeSubscriptionDialog
        open={resumeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResumeTarget(null)
        }}
        subscription={resumeTarget}
        onSaved={() => detail.refresh()}
      />

      <CancelSubscriptionDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null)
        }}
        subscription={cancelTarget}
        onSaved={() => detail.refresh()}
      />

      <RecordPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        client={{ id: client.id, name }}
        subscriptions={client.subscriptions}
        currency={currency}
        onSaved={() => detail.refresh()}
      />
    </div>
  )
}
