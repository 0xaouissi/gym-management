import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Ban,
  IdCard,
  ScanLine,
  Nfc,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  AlertTriangle,
  XCircle
} from 'lucide-react'
import type { ClientListItem, RfidCardStatus, RfidCardWithClient } from '@shared/types'
import { RFID_CARD_STATUS_LABELS } from '@shared/constants'
import { clientFullName, formatDate, formatDateTime, formatNumber } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useDebouncedValue } from '@renderer/hooks/useDebouncedValue'
import { runAction } from '@renderer/lib/action'
import { PageHeader } from '@renderer/components/ui/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { ClientStatusBadge, CardStatusBadge } from '@renderer/components/ui/status-badges'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { StatCard } from '@renderer/components/ui/stat-card'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { ScanUidButton } from '@renderer/components/scan-uid-button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

type CardAction = 'BLOCK' | 'UNBLOCK' | 'MARK_LOST' | 'REVOKE'

const STATUS_OPTIONS: (RfidCardStatus | 'ALL')[] = ['ALL', 'ACTIVE', 'BLOCKED', 'LOST', 'REVOKED']

const ACTION_META: Record<CardAction, { title: string; confirmLabel: string; success: string; destructive: boolean }> = {
  BLOCK: {
    title: 'Block this card?',
    confirmLabel: 'Block card',
    success: 'Card blocked',
    destructive: true
  },
  UNBLOCK: {
    title: 'Unblock this card?',
    confirmLabel: 'Unblock card',
    success: 'Card unblocked',
    destructive: false
  },
  MARK_LOST: {
    title: 'Mark this card as lost?',
    confirmLabel: 'Mark as lost',
    success: 'Card marked as lost',
    destructive: true
  },
  REVOKE: {
    title: 'Revoke this card?',
    confirmLabel: 'Revoke card',
    success: 'Card revoked',
    destructive: true
  }
}

function actionDescription(action: CardAction, card: RfidCardWithClient): ReactNode {
  switch (action) {
    case 'BLOCK':
      return (
        <>
          Card <span className="font-mono">{card.uid}</span> of {card.clientName} will be refused at the turnstile
          until it is unblocked.
        </>
      )
    case 'UNBLOCK':
      return (
        <>
          Card <span className="font-mono">{card.uid}</span> of {card.clientName} will be usable again if the
          subscription is valid.
        </>
      )
    case 'MARK_LOST':
      return (
        <>
          Card <span className="font-mono">{card.uid}</span> of {card.clientName} will be marked as lost and refused at
          the turnstile. Issue a new card from the client profile afterwards.
        </>
      )
    case 'REVOKE':
      return (
        <>
          Card <span className="font-mono">{card.uid}</span> of {card.clientName} will be permanently revoked and can
          never open the turnstile again. This cannot be undone.
        </>
      )
  }
}

function AssignCardDialog({
  open,
  onOpenChange,
  onSaved
}: {
  open: boolean
  onOpenChange(open: boolean): void
  onSaved(): void | Promise<void>
}): React.JSX.Element {
  const [clientSearch, setClientSearch] = useState('')
  const debouncedSearch = useDebouncedValue(clientSearch)
  const [selected, setSelected] = useState<ClientListItem | null>(null)
  const [uid, setUid] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setClientSearch('')
    setSelected(null)
    setUid('')
    setCardNumber('')
    setError('')
  }, [open])

  const results = useAsyncData<ClientListItem[]>(
    () =>
      debouncedSearch.trim().length >= 2
        ? window.api.clients.globalSearch(debouncedSearch.trim())
        : Promise.resolve([]),
    [debouncedSearch]
  )

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setError('')
    if (!selected) {
      setError('Select the member this card belongs to.')
      return
    }
    if (!uid.trim()) {
      setError('Enter or scan the card UID.')
      return
    }
    setBusy(true)
    try {
      const result = await runAction(
        window.api.rfid.assign({
          clientId: selected.id,
          uid: uid.trim().toUpperCase(),
          cardNumber: cardNumber.trim() || null
        }),
        'RFID card assigned'
      )
      if (result.ok) {
        onOpenChange(false)
        await onSaved()
      } else {
        setError(result.error ?? 'Unable to assign the card.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register RFID card</DialogTitle>
          <DialogDescription>
            Assign a physical card to a member. A member can have only one active card; use the replace action from the
            client profile to swap cards.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="card-client-search">Member *</Label>
            {selected ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{clientFullName(selected)}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.phone ?? 'No phone'} · #{selected.id}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="card-client-search"
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Search member by name, phone or ID…"
                    className="pl-9"
                  />
                </div>
                {results.data && results.data.length > 0 ? (
                  <div className="max-h-44 overflow-y-auto rounded-md border">
                    {results.data.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => setSelected(client)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span>{clientFullName(client)}</span>
                        <span className="text-xs text-muted-foreground">#{client.id}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {debouncedSearch.trim().length >= 2 && !results.loading && (results.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No member found for “{debouncedSearch.trim()}”.</p>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="card-uid">Card UID *</Label>
            <div className="flex gap-2">
              <Input
                id="card-uid"
                value={uid}
                onChange={(event) => setUid(event.target.value)}
                placeholder="AABBCCDDEE"
                className="font-mono"
              />
              <ScanUidButton onCaptured={(captured) => setUid(captured.toUpperCase())} disabled={busy} />
            </div>
            <p className="text-xs text-muted-foreground">
              Scan the card with the reader or type the UID printed on it. It must not belong to another member.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="card-number">Card number (optional)</Label>
            <Input
              id="card-number"
              value={cardNumber}
              onChange={(event) => setCardNumber(event.target.value)}
              placeholder="Printed number on the card"
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
              {busy ? 'Assigning…' : 'Assign card'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RfidCardsPage(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [status, setStatus] = useState<RfidCardStatus | 'ALL'>('ALL')
  const [assignOpen, setAssignOpen] = useState(false)
  const [actionTarget, setActionTarget] = useState<{ card: RfidCardWithClient; action: CardAction } | null>(null)
  const [lookupUid, setLookupUid] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupResult, setLookupResult] = useState<RfidCardWithClient | null | 'NOT_FOUND'>(null)

  const list = useAsyncData<RfidCardWithClient[]>(
    () => window.api.rfid.list({ status, search: debouncedSearch }),
    [status, debouncedSearch],
    { live: true }
  )

  const stats = useAsyncData<RfidCardWithClient[]>(() => window.api.rfid.list({ status: 'ALL' }), [], { live: true })

  const cards = list.data ?? []
  const allCards = stats.data ?? []
  const countByStatus = (value: RfidCardStatus): number => allCards.filter((card) => card.status === value).length

  const refreshLookup = async (cardId?: number): Promise<void> => {
    if (lookupResult === null || lookupResult === 'NOT_FOUND') return
    if (cardId !== undefined && lookupResult.id !== cardId) return
    const found = await window.api.rfid.find(lookupResult.uid)
    setLookupResult(found ?? 'NOT_FOUND')
  }

  const runLookup = async (uid: string): Promise<void> => {
    const trimmed = uid.trim()
    if (!trimmed) return
    setLookupBusy(true)
    try {
      const found = await window.api.rfid.find(trimmed)
      setLookupResult(found ?? 'NOT_FOUND')
    } finally {
      setLookupBusy(false)
    }
  }

  const performAction = async (): Promise<void> => {
    if (!actionTarget) return
    const { card, action } = actionTarget
    const promise =
      action === 'BLOCK'
        ? window.api.rfid.block(card.id)
        : action === 'UNBLOCK'
          ? window.api.rfid.unblock(card.id)
          : action === 'MARK_LOST'
            ? window.api.rfid.markLost(card.id)
            : window.api.rfid.revoke(card.id)
    const result = await runAction(promise, ACTION_META[action].success)
    if (result.ok) {
      setActionTarget(null)
      await list.refresh()
      await stats.refresh()
      await refreshLookup(card.id)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="RFID Cards"
        description="Every card ever issued, with its live status. One active card per member."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void list.reload()}>
              <RefreshCw className={list.loading ? 'size-4 animate-spin' : 'size-4'} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => setAssignOpen(true)}>
              <Plus className="size-4" />
              Register card
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active" value={formatNumber(countByStatus('ACTIVE'))} icon={Nfc} tone="success" />
        <StatCard label="Blocked" value={formatNumber(countByStatus('BLOCKED'))} icon={Ban} tone="destructive" />
        <StatCard label="Lost" value={formatNumber(countByStatus('LOST'))} icon={AlertTriangle} tone="warning" />
        <StatCard label="Revoked" value={formatNumber(countByStatus('REVOKED'))} icon={XCircle} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanLine className="size-4" />
            Card lookup
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              value={lookupUid}
              onChange={(event) => setLookupUid(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void runLookup(lookupUid)
                }
              }}
              placeholder="Enter a card UID to identify its owner…"
              className="max-w-xs font-mono"
            />
            <Button variant="outline" onClick={() => void runLookup(lookupUid)} disabled={lookupBusy}>
              <Search className="size-4" />
              {lookupBusy ? 'Looking up…' : 'Find card'}
            </Button>
            <ScanUidButton onCaptured={(captured) => void runLookup(captured)} />
          </div>

          {lookupResult === 'NOT_FOUND' ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              No card or member found for this UID. It is not registered in the system.
            </p>
          ) : null}

          {lookupResult && lookupResult !== 'NOT_FOUND' ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-mono font-medium">{lookupResult.uid}</span>
              <span>
                <Link to={`/clients/${lookupResult.clientId}`} className="hover:text-primary">
                  {lookupResult.clientName}
                </Link>{' '}
                <ClientStatusBadge status={lookupResult.clientStatus} />
              </span>
              <CardStatusBadge status={lookupResult.status} />
              <span className="text-xs text-muted-foreground">
                Issued {formatDateTime(lookupResult.issuedAt)}
                {lookupResult.revokedAt ? ` · Revoked ${formatDateTime(lookupResult.revokedAt)}` : ''}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by UID, card number or member name…"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value as RfidCardStatus | 'ALL')}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === 'ALL' ? 'All statuses' : RFID_CARD_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {list.loading && !list.data ? <LoadingPanel label="Loading RFID cards…" /> : null}

          {!list.loading && cards.length === 0 ? (
            <EmptyState
              icon={IdCard}
              title="No cards found"
              description="Adjust the filters or register a new card for a member."
            />
          ) : null}

          {cards.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UID</TableHead>
                  <TableHead>Card number</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Card status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Revoked</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cards.map((card) => (
                  <TableRow key={card.id}>
                    <TableCell className="font-mono text-sm">{card.uid}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{card.cardNumber ?? '—'}</TableCell>
                    <TableCell>
                      <Link to={`/clients/${card.clientId}`} className="font-medium hover:text-primary">
                        {card.clientName}
                      </Link>
                      <div className="mt-1">
                        <ClientStatusBadge status={card.clientStatus} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <CardStatusBadge status={card.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(card.issuedAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {card.revokedAt ? formatDate(card.revokedAt) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {card.status === 'REVOKED' ? (
                        <Badge variant="muted">No actions</Badge>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" title="Actions">
                              <Nfc className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {card.status === 'BLOCKED' ? (
                              <DropdownMenuItem
                                onSelect={() => setActionTarget({ card, action: 'UNBLOCK' })}
                              >
                                <ShieldCheck className="size-4" />
                                Unblock card
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onSelect={() => setActionTarget({ card, action: 'BLOCK' })}>
                                <Ban className="size-4" />
                                Block card
                              </DropdownMenuItem>
                            )}
                            {card.status === 'ACTIVE' ? (
                              <DropdownMenuItem onSelect={() => setActionTarget({ card, action: 'MARK_LOST' })}>
                                <AlertTriangle className="size-4" />
                                Mark as lost
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setActionTarget({ card, action: 'REVOKE' })}
                            >
                              <XCircle className="size-4" />
                              Revoke card
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-right text-xs text-muted-foreground">
        {formatNumber(cards.length)} card{cards.length === 1 ? '' : 's'} match the current filters
      </p>

      <AssignCardDialog open={assignOpen} onOpenChange={setAssignOpen} onSaved={() => list.reload()} />

      <ConfirmDialog
        open={actionTarget !== null}
        onOpenChange={(open) => {
          if (!open) setActionTarget(null)
        }}
        title={actionTarget ? ACTION_META[actionTarget.action].title : ''}
        description={actionTarget ? actionDescription(actionTarget.action, actionTarget.card) : ''}
        confirmLabel={actionTarget ? ACTION_META[actionTarget.action].confirmLabel : 'Confirm'}
        destructive={actionTarget ? ACTION_META[actionTarget.action].destructive : false}
        onConfirm={performAction}
      />

      {list.error ? <p className="text-sm text-destructive">{list.error}</p> : null}
    </div>
  )
}
