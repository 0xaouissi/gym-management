import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import {
  Activity,
  AlertTriangle,
  Cable,
  CheckCircle2,
  Database,
  Download,
  DoorOpen,
  Nfc,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import type { AccessLog, AccessResult } from '@shared/types'
import { ACCESS_REASON_LABELS } from '@shared/constants'
import { formatDateTime, formatNumber, todayISO } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useDebouncedValue } from '@renderer/hooks/useDebouncedValue'
import { useHardwareStatus } from '@renderer/hooks/useHardwareStatus'
import { useSession } from '@renderer/hooks/useSession'
import { runExport } from '@renderer/lib/action'
import { describeError } from '@renderer/lib/utils'
import { exportCsv, timestampedName, type ExportColumn } from '@renderer/lib/export'
import { PageHeader } from '@renderer/components/ui/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { AccessResultBadge } from '@renderer/components/ui/status-badges'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { StatCard } from '@renderer/components/ui/stat-card'
import { Pagination } from '@renderer/components/ui/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

type RangePreset = 'TODAY' | 'LAST_7' | 'LAST_30' | 'ALL' | 'CUSTOM'

const PAGE_SIZE = 25
const EXPORT_LIMIT = 200

function presetRange(preset: RangePreset): { from: string; to: string } {
  const today = todayISO()
  switch (preset) {
    case 'TODAY':
      return { from: today, to: today }
    case 'LAST_7':
      return { from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: today }
    case 'LAST_30':
      return { from: format(subDays(new Date(), 29), 'yyyy-MM-dd'), to: today }
    default:
      return { from: '', to: '' }
  }
}

function resultToneClass(log: AccessLog): string {
  if (log.result === 'ALLOWED') return 'font-medium text-success'
  if (log.reason === 'UNKNOWN_CARD') return 'text-warning'
  return 'text-destructive'
}

export function AccessControlPage(): React.JSX.Element {
  const { user } = useSession()
  const isAdmin = user?.role === 'ADMIN'
  const hardware = useHardwareStatus()

  const initialRange = presetRange('LAST_7')
  const [preset, setPreset] = useState<RangePreset>('LAST_7')
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [resultFilter, setResultFilter] = useState<AccessResult | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<'reconnect' | 'test' | 'export' | null>(null)

  useEffect(() => {
    setPage(1)
  }, [from, to, resultFilter, debouncedSearch])

  const logs = useAsyncData(
    () =>
      window.api.access.logs({
        from: from || undefined,
        to: to || undefined,
        result: resultFilter,
        search: debouncedSearch,
        page,
        pageSize: PAGE_SIZE
      }),
    [from, to, resultFilter, debouncedSearch, page],
    { live: true }
  )

  const today = useAsyncData(() => window.api.access.today(), [], { live: true })

  useEffect(() => {
    const unsubscribe = window.api.onAccessResult(() => {
      void logs.refresh()
      void today.refresh()
    })
    return unsubscribe
  }, [logs.refresh, today.refresh])

  const applyPreset = (next: RangePreset): void => {
    setPreset(next)
    if (next === 'CUSTOM') return
    const range = presetRange(next)
    setFrom(range.from)
    setTo(range.to)
  }

  const items = logs.data?.items ?? []
  const deniedInRange = items.filter((log) => log.result === 'DENIED').length

  const exportLogs = async (): Promise<void> => {
    setBusy('export')
    try {
      const batch = await window.api.access.logs({
        from: from || undefined,
        to: to || undefined,
        result: resultFilter,
        search: debouncedSearch,
        page: 1,
        pageSize: EXPORT_LIMIT
      })
      const columns: ExportColumn<AccessLog>[] = [
        { header: 'Time', value: (log) => formatDateTime(log.timestamp) },
        { header: 'Client', value: (log) => log.clientName ?? 'Unknown' },
        { header: 'Card UID', value: (log) => log.rfidUid },
        { header: 'Result', value: (log) => log.result },
        { header: 'Reason', value: (log) => ACCESS_REASON_LABELS[log.reason] },
        { header: 'Subscription #', value: (log) => log.subscriptionId ?? '' },
        { header: 'Device', value: (log) => log.deviceId ?? '' }
      ]
      await runExport(
        exportCsv(timestampedName('access-logs', 'csv'), columns, batch.items),
        'Access log'
      )
    } finally {
      setBusy(null)
    }
  }

  const reconnect = async (): Promise<void> => {
    setBusy('reconnect')
    try {
      const status = await window.api.hardware.reconnect()
      toast.success('Hardware reconnected', {
        description: `RFID: ${status.rfid.detail} · Turnstile: ${status.turnstile.detail}`
      })
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(null)
    }
  }

  const testTurnstile = async (): Promise<void> => {
    setBusy('test')
    try {
      const result = await window.api.hardware.testOpen()
      if (result.ok) toast.success('Turnstile opened', { description: result.detail })
      else toast.error('Turnstile test failed', { description: result.detail })
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Access Control"
        description="Every scan attempt is logged with its decision. Hardware state and test commands live here."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportLogs()}
              disabled={busy === 'export' || items.length === 0}
            >
              <Download className="size-4" />
              {busy === 'export' ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void logs.reload()}>
              <RefreshCw className={logs.loading ? 'size-4 animate-spin' : 'size-4'} />
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Entries today"
          value={formatNumber(today.data?.entries ?? 0)}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Denied today"
          value={formatNumber(today.data?.denied ?? 0)}
          icon={XCircle}
          tone="destructive"
        />
        <StatCard
          label="Attempts in range"
          value={formatNumber(logs.data?.total ?? 0)}
          icon={Activity}
        />
        <StatCard
          label="Denied on this page"
          value={formatNumber(deniedInRange)}
          icon={AlertTriangle}
          tone={deniedInRange > 0 ? 'warning' : 'default'}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cable className="size-4" />
            Hardware control
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reconnect()}
              disabled={!isAdmin || busy !== null}
              title={isAdmin ? undefined : 'Administrators only'}
            >
              <Cable className="size-4" />
              {busy === 'reconnect' ? 'Reconnecting…' : 'Reconnect'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void testTurnstile()}
              disabled={!isAdmin || busy !== null}
              title={isAdmin ? undefined : 'Administrators only'}
            >
              <DoorOpen className="size-4" />
              {busy === 'test' ? 'Opening…' : 'Test open'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card/50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Nfc className="size-4 text-primary" />
                RFID reader
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Mode: {hardware?.rfid.mode ?? '—'}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={hardware?.rfid.detail}>
                {hardware?.rfid.detail ?? 'Status unknown'}
              </p>
              <div className="mt-2">
                <Badge variant={hardware?.rfid.connected ? 'success' : 'destructive'}>
                  {hardware?.rfid.connected ? 'Connected' : 'Offline'}
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border bg-card/50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <DoorOpen className="size-4 text-primary" />
                ZK TS1000 turnstile
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Mode: {hardware?.turnstile.mode ?? '—'}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={hardware?.turnstile.detail}>
                {hardware?.turnstile.detail ?? 'Status unknown'}
              </p>
              <div className="mt-2">
                <Badge variant={hardware?.turnstile.connected ? 'success' : 'destructive'}>
                  {hardware?.turnstile.connected ? 'Connected' : 'Offline'}
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border bg-card/50 p-3">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Database className="size-4 text-primary" />
                Local database
              </p>
              <p className="mt-1 text-xs text-muted-foreground">SQLite · offline</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground" title={hardware?.database.detail}>
                {hardware?.database.detail ?? 'Status unknown'}
              </p>
              <div className="mt-2">
                <Badge variant={hardware?.database.connected ? 'success' : 'destructive'}>
                  {hardware?.database.connected ? 'Connected' : 'Offline'}
                </Badge>
              </div>
            </div>
          </div>

          {!isAdmin ? (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
              Reconnect and test commands change critical hardware state, so only administrators can run them.
              Reader and turnstile configuration is in Settings.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by member name or card UID…"
                className="pl-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="access-result" className="text-xs text-muted-foreground">
                Result
              </Label>
              <Select
                value={resultFilter}
                onValueChange={(value) => setResultFilter(value as AccessResult | 'ALL')}
              >
                <SelectTrigger id="access-result" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All results</SelectItem>
                  <SelectItem value="ALLOWED">Allowed</SelectItem>
                  <SelectItem value="DENIED">Denied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="access-preset" className="text-xs text-muted-foreground">
                Period
              </Label>
              <Select value={preset} onValueChange={(value) => applyPreset(value as RangePreset)}>
                <SelectTrigger id="access-preset" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAY">Today</SelectItem>
                  <SelectItem value="LAST_7">Last 7 days</SelectItem>
                  <SelectItem value="LAST_30">Last 30 days</SelectItem>
                  <SelectItem value="ALL">All time</SelectItem>
                  {preset === 'CUSTOM' ? <SelectItem value="CUSTOM">Custom range</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="access-from" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="access-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value)
                  setPreset('CUSTOM')
                }}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="access-to" className="text-xs text-muted-foreground">
                To
              </Label>
              <Input
                id="access-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value)
                  setPreset('CUSTOM')
                }}
                className="w-40"
              />
            </div>
          </div>

          {logs.loading && !logs.data ? <LoadingPanel label="Loading access log…" /> : null}

          {!logs.loading && items.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No access attempts found"
              description="Adjust the filters — scans are logged automatically, even when access is denied."
            />
          ) : null}

          {items.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Card UID</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Device</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">{formatDateTime(log.timestamp)}</TableCell>
                      <TableCell className={resultToneClass(log)}>
                        {log.clientId !== null ? (
                          <Link to={`/clients/${log.clientId}`} className="hover:text-primary">
                            {log.clientName ?? `Client #${log.clientId}`}
                          </Link>
                        ) : (
                          'Unknown card'
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{log.rfidUid}</TableCell>
                      <TableCell>
                        <AccessResultBadge result={log.result} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ACCESS_REASON_LABELS[log.reason]}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {log.subscriptionId !== null ? `#${log.subscriptionId}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.deviceId ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={logs.data?.total ?? 0}
                onPageChange={setPage}
              />
            </>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-right text-xs text-muted-foreground">
        CSV export contains up to {EXPORT_LIMIT} most recent matching attempts · this page refreshes automatically
        after every scan
      </p>

      {logs.error ? <p className="text-sm text-destructive">{logs.error}</p> : null}
    </div>
  )
}
