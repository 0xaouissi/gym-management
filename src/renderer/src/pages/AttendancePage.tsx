import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, subDays } from 'date-fns'
import {
  Activity,
  CalendarDays,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  TrendingUp,
  UserCheck
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import type { AccessLog, ReportRow } from '@shared/types'
import { formatDate, formatNumber, formatTime, todayISO } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useDebouncedValue } from '@renderer/hooks/useDebouncedValue'
import { runExport } from '@renderer/lib/action'
import { exportCsv, exportExcel, timestampedName, type ExportColumn } from '@renderer/lib/export'
import { PageHeader } from '@renderer/components/ui/page-header'
import { StatCard } from '@renderer/components/ui/stat-card'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { Pagination } from '@renderer/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'

type RangePreset = 'TODAY' | 'LAST_7' | 'LAST_30' | 'ALL' | 'CUSTOM'
type GroupBy = 'DAY' | 'MONTH'

const PAGE_SIZE = 50
const EXPORT_LIMIT = 200
const CHART_TICK = { fontSize: 11, fill: 'var(--color-muted-foreground)' } as const
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--color-popover-foreground)'
} as const

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'TODAY', label: 'Today' },
  { value: 'LAST_7', label: 'Last 7 days' },
  { value: 'LAST_30', label: 'Last 30 days' },
  { value: 'ALL', label: 'All time' },
  { value: 'CUSTOM', label: 'Custom range' }
]

function presetRange(preset: RangePreset): { from: string; to: string } | null {
  const today = todayISO()
  if (preset === 'TODAY') return { from: today, to: today }
  if (preset === 'LAST_7') return { from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: today }
  if (preset === 'LAST_30') return { from: format(subDays(new Date(), 29), 'yyyy-MM-dd'), to: today }
  return null
}

function localDayKey(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp.slice(0, 10) : format(date, 'yyyy-MM-dd')
}

function localTime(timestamp: string): string {
  return Number.isNaN(new Date(timestamp).getTime()) ? formatTime(timestamp) : format(new Date(timestamp), 'HH:mm:ss')
}

export function AttendancePage(): React.JSX.Element {
  const initial = presetRange('LAST_7') ?? { from: '', to: '' }
  const [preset, setPreset] = useState<RangePreset>('LAST_7')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState<'csv' | 'excel' | null>(null)

  const groupBy: GroupBy = useMemo(() => {
    if (!from || !to) return 'MONTH'
    const days = Math.round((parseISO(to).getTime() - parseISO(from).getTime()) / 86_400_000)
    return days > 62 ? 'MONTH' : 'DAY'
  }, [from, to])

  const logs = useAsyncData(
    () =>
      window.api.access.logs({
        from: from || undefined,
        to: to || undefined,
        result: 'ALLOWED',
        search: debouncedSearch.trim() || undefined,
        page,
        pageSize: PAGE_SIZE
      }),
    [from, to, debouncedSearch, page]
  )

  const perPeriod = useAsyncData(
    () => window.api.reports.attendance({ from: from || '1970-01-01', to: to || todayISO(), groupBy }),
    [from, to, groupBy]
  )

  const today = useAsyncData(() => window.api.access.today(), [])

  useEffect(() => {
    const unsubscribe = window.api.onAccessResult(() => {
      void logs.refresh()
      void perPeriod.refresh()
      void today.refresh()
    })
    return unsubscribe
  }, [logs.refresh, perPeriod.refresh, today.refresh])

  useEffect(() => {
    setPage(1)
  }, [from, to, debouncedSearch])

  const applyPreset = (next: RangePreset): void => {
    setPreset(next)
    const range = presetRange(next)
    if (range) {
      setFrom(range.from)
      setTo(range.to)
    }
  }

  const rangeRows = perPeriod.data ?? []
  const totalVisits = rangeRows.reduce((sum, row) => sum + Number(row.allowed ?? 0), 0)
  const busiest = rangeRows.reduce<ReportRow | null>(
    (best, row) => (best === null || Number(row.allowed ?? 0) > Number(best.allowed ?? 0) ? row : best),
    null
  )
  const average = rangeRows.length > 0 ? Math.round(totalVisits / rangeRows.length) : 0
  const unitLabel = groupBy === 'DAY' ? 'day' : 'month'

  const periodLabel = (value: string): string => {
    try {
      return groupBy === 'MONTH'
        ? format(parseISO(`${value}-01`), 'MMMM yyyy')
        : format(parseISO(value), 'EEEE d MMMM yyyy')
    } catch {
      return value
    }
  }

  const tickLabel = (value: string): string => {
    try {
      return groupBy === 'MONTH' ? format(parseISO(`${value}-01`), 'MMM yy') : format(parseISO(value), 'dd/MM')
    } catch {
      return value
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, AccessLog[]>()
    for (const log of logs.data?.items ?? []) {
      const key = localDayKey(log.timestamp)
      const bucket = map.get(key)
      if (bucket) bucket.push(log)
      else map.set(key, [log])
    }
    return Array.from(map, ([date, items]) => ({ date, items }))
  }, [logs.data])

  const exportColumns: ExportColumn<AccessLog>[] = [
    { header: 'Date', value: (row) => formatDate(row.timestamp) },
    { header: 'Time', value: (row) => localTime(row.timestamp) },
    { header: 'Member', value: (row) => row.clientName ?? 'Unknown card' },
    { header: 'Card UID', value: (row) => row.rfidUid },
    { header: 'Subscription #', value: (row) => row.subscriptionId ?? '' },
    { header: 'Device', value: (row) => row.deviceId ?? '' }
  ]

  const exportData = async (kind: 'csv' | 'excel'): Promise<void> => {
    setExporting(kind)
    try {
      const batch = await window.api.access.logs({
        from: from || undefined,
        to: to || undefined,
        result: 'ALLOWED',
        search: debouncedSearch.trim() || undefined,
        page: 1,
        pageSize: EXPORT_LIMIT
      })
      if (kind === 'csv') {
        await runExport(exportCsv(timestampedName('attendance', 'csv'), exportColumns, batch.items), 'Attendance list')
      } else {
        await runExport(
          exportExcel(timestampedName('attendance', 'xlsx'), 'Attendance', exportColumns, batch.items),
          'Attendance list'
        )
      }
    } catch {
      toast.error('Unable to export the attendance list')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        description="Every entry granted by the turnstile, grouped by day and ready to export."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void exportData('csv')} disabled={exporting !== null}>
              <Download className="size-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => void exportData('excel')} disabled={exporting !== null}>
              <FileSpreadsheet className="size-4" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void logs.reload()
                void perPeriod.reload()
                void today.reload()
              }}
            >
              <RefreshCw className={logs.loading ? 'size-4 animate-spin' : 'size-4'} />
              Refresh
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search member or card UID…"
            className="pl-8"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attendance-range">Period</Label>
          <Select value={preset} onValueChange={(next) => applyPreset(next as RangePreset)}>
            <SelectTrigger id="attendance-range" className="w-40">
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
          <Label htmlFor="attendance-from">From</Label>
          <Input
            id="attendance-from"
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
          <Label htmlFor="attendance-to">To</Label>
          <Input
            id="attendance-to"
            type="date"
            value={to}
            onChange={(event) => {
              setPreset('CUSTOM')
              setTo(event.target.value)
            }}
            className="w-40"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Visits in range"
          value={formatNumber(totalVisits)}
          hint={from && to ? `${formatDate(from)} → ${formatDate(to)}` : 'All recorded check-ins'}
          icon={UserCheck}
          tone="success"
        />
        <StatCard
          label="Visits today"
          value={formatNumber(today.data?.entries ?? 0)}
          hint={`${formatNumber(today.data?.denied ?? 0)} denied attempts today`}
          icon={Activity}
          tone={(today.data?.denied ?? 0) > 0 ? 'warning' : 'default'}
        />
        <StatCard
          label={`Busiest ${unitLabel}`}
          value={busiest ? formatNumber(Number(busiest.allowed ?? 0)) : '—'}
          hint={busiest ? periodLabel(String(busiest.period)) : 'No check-ins in range'}
          icon={TrendingUp}
          tone="info"
        />
        <StatCard
          label={`Average per ${unitLabel}`}
          value={formatNumber(average)}
          hint={rangeRows.length > 0 ? `Across ${formatNumber(rangeRows.length)} ${unitLabel}(s)` : 'No check-ins in range'}
          icon={CalendarDays}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle>Check-ins per {unitLabel}</CardTitle>
            <CardDescription>Allowed entries recorded by the turnstile.</CardDescription>
          </div>
          <Activity className="size-4 text-primary" />
        </CardHeader>
        <CardContent>
          {perPeriod.loading && !perPeriod.data ? (
            <LoadingPanel label="Loading chart…" />
          ) : rangeRows.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No check-ins in this range"
              description="Pick a wider period or wait for members to scan in."
            />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={rangeRows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={CHART_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: string) => tickLabel(value)}
                />
                <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [formatNumber(Number(value)), 'Check-ins']}
                  labelFormatter={(value) => periodLabel(String(value))}
                />
                <Bar dataKey="allowed" name="Check-ins" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Check-in log</h2>
            <p className="text-xs text-muted-foreground">
              Newest first — the list refreshes automatically after every scan.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {logs.data ? `${formatNumber(logs.data.total)} entr${logs.data.total === 1 ? 'y' : 'ies'} in range` : null}
          </span>
        </div>

        <div className="rounded-xl border bg-card">
          {logs.loading && !logs.data ? (
            <LoadingPanel label="Loading attendance…" />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No check-ins found"
              description={
                search
                  ? 'No member matches this search in the selected period.'
                  : 'Entries appear here as soon as members scan their RFID cards.'
              }
              className="py-12"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Time</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Card UID</TableHead>
                  <TableHead>Subscription #</TableHead>
                  <TableHead>Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <Fragment key={group.date}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={5} className="py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {periodLabel(group.date)}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {group.items.length} on this page
                        </span>
                      </TableCell>
                    </TableRow>
                    {group.items.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="tabular-nums text-sm">{localTime(log.timestamp)}</TableCell>
                        <TableCell>
                          {log.clientId ? (
                            <Link to={`/clients/${log.clientId}`} className="font-medium hover:underline">
                              {log.clientName ?? 'Member'}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Unknown card</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{log.rfidUid}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {log.subscriptionId ? `#${log.subscriptionId}` : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{log.deviceId ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Pagination page={page} pageSize={PAGE_SIZE} total={logs.data?.total ?? 0} onPageChange={setPage} />
        <p className="text-right text-xs text-muted-foreground">
          Exports contain up to {EXPORT_LIMIT} of the most recent matching entries.
        </p>
      </div>
    </div>
  )
}
