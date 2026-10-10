import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound
} from 'lucide-react'
import type { Client, ClientListItem, ClientStatus, Paged } from '@shared/types'
import { CLIENT_STATUS_LABELS } from '@shared/constants'
import { clientFullName, formatDate, formatNumber } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useDebouncedValue } from '@renderer/hooks/useDebouncedValue'
import { runAction } from '@renderer/lib/action'
import { PageHeader } from '@renderer/components/ui/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { ClientStatusBadge, SubscriptionStatusBadge } from '@renderer/components/ui/status-badges'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { Pagination } from '@renderer/components/ui/pagination'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { ClientFormDialog } from '@renderer/components/client-form-dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
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

type SubscriptionFilter = 'ALL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NONE' | 'SUSPENDED'

const PAGE_SIZE = 25

export function ClientsPage(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [status, setStatus] = useState<ClientStatus | 'ALL'>('ALL')
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>('ALL')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ClientListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null)
  const [statusTarget, setStatusTarget] = useState<ClientListItem | null>(null)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, subscriptionFilter])

  const list = useAsyncData<Paged<ClientListItem>>(
    () =>
      window.api.clients.list({
        search: debouncedSearch,
        status,
        subscriptionFilter,
        page,
        pageSize: PAGE_SIZE
      }),
    [debouncedSearch, status, subscriptionFilter, page],
    { live: true }
  )

  const items = list.data?.items ?? []

  const toggleBlock = async (client: ClientListItem): Promise<void> => {
    const nextStatus: ClientStatus = client.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED'
    const result = await runAction(
      window.api.clients.update(client.id, { status: nextStatus }),
      nextStatus === 'BLOCKED' ? 'Client blocked' : 'Client unblocked'
    )
    if (result.ok) {
      setStatusTarget(null)
      await list.refresh()
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        description="Member profiles, RFID cards and subscription status in one list."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void list.reload()}>
              <RefreshCw className={list.loading ? 'size-4 animate-spin' : 'size-4'} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" />
              New client
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, phone, email, card UID or ID…"
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as ClientStatus | 'ALL')}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {(Object.keys(CLIENT_STATUS_LABELS) as ClientStatus[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {CLIENT_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={subscriptionFilter}
              onValueChange={(value) => setSubscriptionFilter(value as SubscriptionFilter)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All subscriptions</SelectItem>
                <SelectItem value="ACTIVE">Active subscription</SelectItem>
                <SelectItem value="EXPIRING">Expiring soon</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
                <SelectItem value="NONE">No subscription</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {list.loading && !list.data ? <LoadingPanel label="Loading clients…" /> : null}

          {!list.loading && items.length === 0 ? (
            <EmptyState
              icon={UserRound}
              title="No clients found"
              description="Adjust the filters or register a new member to get started."
            />
          ) : null}

          {items.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>RFID card</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          to={`/clients/${client.id}`}
                          className="font-medium hover:text-primary"
                        >
                          {clientFullName(client)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {client.phone ?? 'No phone'} · #{client.id}
                        </p>
                      </TableCell>
                      <TableCell>
                        <ClientStatusBadge status={client.status} />
                      </TableCell>
                      <TableCell>
                        {client.rfidUid ? (
                          <Badge variant="outline" className="font-mono">
                            {client.rfidUid}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">No card</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {client.currentSubscription ? (
                          <div className="space-y-1">
                            <p className="text-sm">
                              {client.currentSubscription.planName} · ends{' '}
                              {formatDate(client.currentSubscription.endDate)}
                            </p>
                            <SubscriptionStatusBadge status={client.currentSubscription.status} />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No subscription</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" title="Actions">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/clients/${client.id}`} className="cursor-default">
                                <Eye className="size-4" />
                                View profile
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => {
                                setEditing(client)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setStatusTarget(client)}>
                              {client.status === 'BLOCKED' ? (
                                <>
                                  <ShieldCheck className="size-4" />
                                  Unblock client
                                </>
                              ) : (
                                <>
                                  <ShieldOff className="size-4" />
                                  Block client
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => setDeleteTarget(client)}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={list.data?.total ?? 0}
                onPageChange={setPage}
              />
            </>
          ) : null}
        </CardContent>
      </Card>

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        onSaved={() => list.refresh()}
      />

      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null)
        }}
        title={statusTarget?.status === 'BLOCKED' ? 'Unblock this client?' : 'Block this client?'}
        description={
          statusTarget?.status === 'BLOCKED'
            ? `${statusTarget ? clientFullName(statusTarget) : ''} will be able to enter again if their subscription is valid.`
            : `${statusTarget ? clientFullName(statusTarget) : ''} will be denied at the turnstile even with a valid subscription.`
        }
        confirmLabel={statusTarget?.status === 'BLOCKED' ? 'Unblock' : 'Block'}
        destructive={statusTarget?.status !== 'BLOCKED'}
        onConfirm={async () => {
          if (statusTarget) await toggleBlock(statusTarget)
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Delete this client?"
        description={
          <>
            The profile of {deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ''} and all related
            subscriptions, cards and payments will be permanently removed. Access history is kept for auditing.
          </>
        }
        confirmLabel="Delete client"
        destructive
        onConfirm={async () => {
          if (!deleteTarget) return
          const result = await runAction(window.api.clients.delete(deleteTarget.id), 'Client deleted')
          if (result.ok) {
            setDeleteTarget(null)
            await list.refresh()
          }
        }}
      />

      {list.error ? <p className="text-sm text-destructive">{list.error}</p> : null}

      <p className="text-right text-xs text-muted-foreground">
        {formatNumber(list.data?.total ?? 0)} clients match the current filters
      </p>
    </div>
  )
}
