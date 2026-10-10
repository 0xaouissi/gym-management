import { useEffect, useState } from 'react'
import { History, RefreshCw, ScrollText, Search } from 'lucide-react'
import { formatDateTime, formatNumber } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useDebouncedValue } from '@renderer/hooks/useDebouncedValue'
import { PageHeader } from '@renderer/components/ui/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge, type BadgeProps } from '@renderer/components/ui/badge'
import { Card, CardContent } from '@renderer/components/ui/card'
import { StatCard } from '@renderer/components/ui/stat-card'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { Pagination } from '@renderer/components/ui/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'

const PAGE_SIZE = 50

function actionVariant(action: string): BadgeProps['variant'] {
  if (
    action.includes('FAILED') ||
    action.includes('DELETED') ||
    action.includes('REVOKED') ||
    action.includes('BLOCKED') ||
    action.includes('MARKED_LOST') ||
    action.includes('CANCELLED') ||
    action.includes('SUSPENDED')
  ) {
    return 'destructive'
  }
  if (
    action.includes('CREATED') ||
    action.includes('RECORDED') ||
    action.includes('RENEWED') ||
    action.includes('RESUMED') ||
    action.includes('ASSIGNED') ||
    action.includes('REPLACED') ||
    action.includes('UNBLOCKED') ||
    action === 'LOGIN'
  ) {
    return 'success'
  }
  if (action.includes('UPDATED') || action.includes('PASSWORD') || action.includes('EXTENDED') || action.includes('CHANGED')) {
    return 'warning'
  }
  return 'muted'
}

function formatAction(action: string): string {
  return action
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function AuditPage(): React.JSX.Element {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

  const logs = useAsyncData(
    () =>
      window.api.audit.list({
        search: debouncedSearch.trim() || undefined,
        page,
        pageSize: PAGE_SIZE
      }),
    [debouncedSearch, page]
  )

  const items = logs.data?.items ?? []
  const total = logs.data?.total ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit trail"
        description="Every security-relevant action recorded by the backend — sign-ins, member, card, subscription, payment, plan and user changes."
        actions={
          <Button variant="outline" onClick={() => void logs.refresh()}>
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Recorded events"
          value={formatNumber(total)}
          hint={debouncedSearch.trim() ? 'Matching the current search' : 'Complete audit history'}
          icon={ScrollText}
        />
        <StatCard label="On this page" value={formatNumber(items.length)} hint="Newest first" icon={History} />
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4">
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by user, action, entity or details…"
                className="pl-9"
              />
            </div>
          </div>

          {logs.loading ? (
            <LoadingPanel label="Loading audit trail…" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title={debouncedSearch.trim() ? 'No events match your search' : 'No audit events yet'}
              description={
                debouncedSearch.trim()
                  ? 'Try a different username, action or entity.'
                  : 'Actions like sign-ins, member edits, card changes and payments will appear here.'
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Time</TableHead>
                    <TableHead className="w-36">User</TableHead>
                    <TableHead className="w-44">Action</TableHead>
                    <TableHead className="w-32">Entity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(entry.timestamp)}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{entry.username}</span>
                        {entry.userId === null ? (
                          <span className="ml-2">
                            <Badge variant="outline">System</Badge>
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(entry.action)}>{formatAction(entry.action)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <span className="capitalize">{entry.entity}</span>
                        {entry.entityId ? <span className="ml-1 font-mono">#{entry.entityId}</span> : null}
                      </TableCell>
                      <TableCell>
                        <p className="max-w-xl truncate text-sm" title={entry.details ?? ''}>
                          {entry.details ?? '—'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
