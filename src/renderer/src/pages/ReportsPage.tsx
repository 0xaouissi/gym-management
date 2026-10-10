import { useMemo, useState } from 'react'
import { format, parseISO, startOfMonth, startOfYear, subDays } from 'date-fns'
import { Activity, BarChart3, CalendarClock, CircleDollarSign, Download, FileText, Percent, RefreshCw, Repeat, TrendingUp, UserPlus } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { PaymentStatus, ReportRow, SubscriptionStatus } from '@shared/types'
import { formatCurrency, formatDate, formatNumber, todayISO } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useSettings } from '@renderer/hooks/useSettings'
import { runExport } from '@renderer/lib/action'
import { exportCsv, exportPdf, timestampedName, type ExportColumn } from '@renderer/lib/export'
import { PageHeader } from '@renderer/components/ui/page-header'
import { StatCard } from '@renderer/components/ui/stat-card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { PaymentStatusBadge, SubscriptionStatusBadge } from '@renderer/components/ui/status-badges'

type ReportTab = 'ATTENDANCE' | 'REVENUE' | 'SUBSCRIPTIONS'
type RangePreset = 'TODAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM'
type AttendanceGroup = 'DAY' | 'WEEK' | 'MONTH'
type RevenueGroup = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'
type SubscriptionSummary = {
  active: number
  expired: number
  suspended: number
  cancelled: number
  newCount: number
  renewals: number
}

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
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'THIS_YEAR', label: 'This year' },
  { value: 'CUSTOM', label: 'Custom range' }
]

const ATTENDANCE_GROUPS: { value: AttendanceGroup; label: string }[] = [
  { value: 'DAY', label: 'Daily' },
  { value: 'WEEK', label: 'Weekly' },
  { value: 'MONTH', label: 'Monthly' }
]

const REVENUE_GROUPS: { value: RevenueGroup; label: string }[] = [
  { value: 'DAY', label: 'Daily' },
  { value: 'WEEK', label: 'Weekly' },
  { value: 'MONTH', label: 'Monthly' },
  { value: 'YEAR', label: 'Yearly' }
]

function presetRange(preset: RangePreset): { from: string; to: string } {
  const today = todayISO()
  switch (preset) {
    case 'TODAY':
      return { from: today, to: today }
    case 'LAST_7':
      return { from: format(subDays(new Date(), 6), 'yyyy-MM-dd'), to: today }
    case 'LAST_30':
      return { from: format(subDays(new Date(), 29), 'yyyy-MM-dd'), to: today }
    case 'THIS_MONTH':
      return { from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: today }
    case 'THIS_YEAR':
      return { from: format(startOfYear(new Date()), 'yyyy-MM-dd'), to: today }
    default:
      return { from: today, to: today }
  }
}

function periodLabel(value: string, groupBy: string): string {
  try {
    if (groupBy === 'YEAR') return value
    if (groupBy === 'MONTH') return format(parseISO(`${value}-01`), 'MMMM yyyy')
    if (groupBy === 'WEEK') return `${value.slice(0, 4)} · week ${value.slice(6)}`
    return format(parseISO(value), 'EEEE d MMMM yyyy')
  } catch {
    return value
  }
}

function tickLabel(value: string, groupBy: string): string {
  try {
    if (groupBy === 'YEAR') return value
    if (groupBy === 'MONTH') return format(parseISO(`${value}-01`), 'MMM yy')
    if (groupBy === 'WEEK') return `W${value.slice(6)}`
    return format(parseISO(value), 'dd/MM')
  } catch {
    return value
  }
}

export function ReportsPage(): React.JSX.Element {
  const { settings } = useSettings()
  const initial = presetRange('LAST_30')
  const [tab, setTab] = useState<ReportTab>('ATTENDANCE')
  const [preset, setPreset] = useState<RangePreset>('LAST_30')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [attendanceGroup, setAttendanceGroup] = useState<AttendanceGroup>('DAY')
  const [revenueGroup, setRevenueGroup] = useState<RevenueGroup>('DAY')
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  const attendance = useAsyncData<ReportRow[]>(
    () =>
      tab === 'ATTENDANCE'
        ? window.api.reports.attendance({ from, to, groupBy: attendanceGroup })
        : Promise.resolve([]),
    [tab, from, to, attendanceGroup]
  )

  const revenue = useAsyncData<ReportRow[]>(
    () => (tab === 'REVENUE' ? window.api.reports.revenue({ from, to, groupBy: revenueGroup }) : Promise.resolve([])),
    [tab, from, to, revenueGroup]
  )

  const subscriptions = useAsyncData<{ summary: SubscriptionSummary; rows: ReportRow[] } | null>(
    () => (tab === 'SUBSCRIPTIONS' ? window.api.reports.subscriptions({ from, to }) : Promise.resolve(null)),
    [tab, from, to]
  )

  const applyPreset = (next: RangePreset): void => {
    setPreset(next)
    if (next !== 'CUSTOM') {
      const range = presetRange(next)
      setFrom(range.from)
      setTo(range.to)
    }
  }

  const attendanceRows = attendance.data ?? []
  const attendanceTotals = useMemo(() => {
    const allowed = attendanceRows.reduce((sum, row) => sum + Number(row.allowed ?? 0), 0)
    const denied = attendanceRows.reduce((sum, row) => sum + Number(row.denied ?? 0), 0)
    const attempts = allowed + denied
    return { allowed, denied, attempts, rate: attempts > 0 ? (denied / attempts) * 100 : 0 }
  }, [attendanceRows])

  const revenueRows = revenue.data ?? []
  const revenueTotals = useMemo(() => {
    const sum = (key: string): number => revenueRows.reduce((total, row) => total + Number(row[key] ?? 0), 0)
    const amount = sum('amount')
    const count = sum('count')
    return {
      amount,
      count,
      average: count > 0 ? amount / count : 0,
      cash: sum('cash'),
      bankTransfer: sum('bankTransfer')
    }
  }, [revenueRows])

  const attendanceColumns: ExportColumn<ReportRow>[] = [
    { header: 'Period', value: (row) => periodLabel(String(row.period), attendanceGroup) },
    { header: 'Allowed', value: (row) => Number(row.allowed ?? 0) },
    { header: 'Denied', value: (row) => Number(row.denied ?? 0) },
    { header: 'Total', value: (row) => Number(row.total ?? 0) }
  ]

  const revenueColumns: ExportColumn<ReportRow>[] = [
    { header: 'Period', value: (row) => periodLabel(String(row.period), revenueGroup) },
    { header: 'Amount', value: (row) => Number(row.amount ?? 0) },
    { header: 'Payments', value: (row) => Number(row.count ?? 0) },
    { header: 'Cash', value: (row) => Number(row.cash ?? 0) },
    { header: 'Card', value: (row) => Number(row.card ?? 0) },
    { header: 'Bank transfer', value: (row) => Number(row.bankTransfer ?? 0) },
    { header: 'Other', value: (row) => Number(row.other ?? 0) }
  ]

  const subscriptionColumns: ExportColumn<ReportRow>[] = [
    { header: 'Start date', value: (row) => String(row.startDate ?? '') },
    { header: 'Member', value: (row) => String(row.client ?? '') },
    { header: 'Plan', value: (row) => String(row.plan ?? '') },
    { header: 'End date', value: (row) => String(row.endDate ?? '') },
    { header: 'Type', value: (row) => String(row.type ?? '') },
    { header: 'Status', value: (row) => String(row.status ?? '') },
    { header: 'Payment', value: (row) => String(row.paymentStatus ?? '') },
    { header: 'Price', value: (row) => Number(row.price ?? 0) }
  ]

  const activeExport = (): {
    title: string
    columns: ExportColumn<ReportRow>[]
    rows: ReportRow[]
    base: string
  } => {
    if (tab === 'REVENUE') {
      return { title: 'Revenue report', columns: revenueColumns, rows: revenueRows, base: 'revenue-report' }
    }
    if (tab === 'SUBSCRIPTIONS') {
      return {
        title: 'Subscriptions report',
        columns: subscriptionColumns,
        rows: subscriptions.data?.rows ?? [],
        base: 'subscriptions-report'
      }
    }
    return { title: 'Attendance report', columns: attendanceColumns, rows: attendanceRows, base: 'attendance-report' }
  }

  const exportData = async (kind: 'csv' | 'pdf'): Promise<void> => {
    setExporting(kind)
    try {
      const { title, columns, rows, base } = activeExport()
      const subtitle = `${settings.gymName} · ${formatDate(from)} → ${formatDate(to)}`
      if (kind === 'csv') {
        await runExport(exportCsv(timestampedName(base, 'csv'), columns, rows), title)
      } else {
        await runExport(exportPdf(timestampedName(base, 'pdf'), title, subtitle, columns, rows), title)
      }
    } finally {
      setExporting(null)
    }
  }

  const reloadActive = (): void => {
    if (tab === 'REVENUE') void revenue.reload()
    else if (tab === 'SUBSCRIPTIONS') void subscriptions.reload()
    else void attendance.reload()
  }

  const summary = subscriptions.data?.summary

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Attendance, revenue and subscription activity for any period — exportable to CSV or PDF."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void exportData('csv')} disabled={exporting !== null}>
              <Download className="size-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => void exportData('pdf')} disabled={exporting !== null}>
              <FileText className="size-4" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={reloadActive}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="reports-period">Period</Label>
          <Select value={preset} onValueChange={(next) => applyPreset(next as RangePreset)}>
            <SelectTrigger id="reports-period" className="w-44">
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
          <Label htmlFor="reports-from">From</Label>
          <Input
            id="reports-from"
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
          <Label htmlFor="reports-to">To</Label>
          <Input
            id="reports-to"
            type="date"
            value={to}
            onChange={(event) => {
              setPreset('CUSTOM')
              setTo(event.target.value)
            }}
            className="w-40"
          />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          Reporting window: {formatDate(from)} → {formatDate(to)}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(next) => setTab(next as ReportTab)}>
        <TabsList>
          <TabsTrigger value="ATTENDANCE">
            <Activity className="size-4" />
            Attendance
          </TabsTrigger>
          <TabsTrigger value="REVENUE">
            <CircleDollarSign className="size-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="SUBSCRIPTIONS">
            <CalendarClock className="size-4" />
            Subscriptions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ATTENDANCE" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total attempts" value={formatNumber(attendanceTotals.attempts)} icon={Activity} />
            <StatCard
              label="Allowed entries"
              value={formatNumber(attendanceTotals.allowed)}
              hint="Turnstile opened"
              icon={TrendingUp}
              tone="success"
            />
            <StatCard
              label="Denied attempts"
              value={formatNumber(attendanceTotals.denied)}
              hint="Refused at the turnstile"
              icon={BarChart3}
              tone={attendanceTotals.denied > 0 ? 'destructive' : 'default'}
            />
            <StatCard
              label="Denial rate"
              value={`${attendanceTotals.rate.toFixed(1)}%`}
              hint="Share of refused scans"
              icon={Percent}
              tone={attendanceTotals.rate > 15 ? 'warning' : 'default'}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Access activity</h3>
            <Select
              value={attendanceGroup}
              onValueChange={(next) => setAttendanceGroup(next as AttendanceGroup)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_GROUPS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Allowed vs denied</CardTitle>
              <CardDescription>Scans recorded per {attendanceGroup.toLowerCase()}.</CardDescription>
            </CardHeader>
            <CardContent>
              {attendance.loading && !attendance.data ? (
                <LoadingPanel label="Loading report…" />
              ) : attendanceRows.length === 0 ? (
                <EmptyState icon={Activity} title="No access data in this period" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={attendanceRows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="reportAllowedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="reportDeniedFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="period"
                      tick={CHART_TICK}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: string) => tickLabel(value, attendanceGroup)}
                    />
                    <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(value) => periodLabel(String(value), attendanceGroup)}
                    />
                    <Area
                      type="monotone"
                      dataKey="allowed"
                      name="Allowed"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      fill="url(#reportAllowedFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="denied"
                      name="Denied"
                      stroke="var(--color-chart-4)"
                      strokeWidth={2}
                      fill="url(#reportDeniedFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="rounded-xl border bg-card">
            {attendance.loading && !attendance.data ? (
              <LoadingPanel label="Loading report…" />
            ) : attendanceRows.length === 0 ? (
              <EmptyState icon={Activity} title="Nothing to list" className="py-10" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Allowed</TableHead>
                    <TableHead className="text-right">Denied</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Denial rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendanceRows.map((row) => {
                    const total = Number(row.total ?? 0)
                    const denied = Number(row.denied ?? 0)
                    return (
                      <TableRow key={String(row.period)}>
                        <TableCell className="text-sm font-medium">
                          {periodLabel(String(row.period), attendanceGroup)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{formatNumber(Number(row.allowed ?? 0))}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{formatNumber(denied)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{formatNumber(total)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                          {total > 0 ? `${((denied / total) * 100).toFixed(1)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="REVENUE" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Collected"
              value={formatCurrency(revenueTotals.amount, settings.currency)}
              icon={CircleDollarSign}
              tone="success"
            />
            <StatCard label="Transactions" value={formatNumber(revenueTotals.count)} icon={BarChart3} />
            <StatCard
              label="Average payment"
              value={formatCurrency(revenueTotals.average, settings.currency)}
              icon={TrendingUp}
              tone="info"
            />
            <StatCard
              label="Cash collected"
              value={formatCurrency(revenueTotals.cash, settings.currency)}
              hint={`Transfers ${formatCurrency(revenueTotals.bankTransfer, settings.currency)}`}
              icon={CircleDollarSign}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Revenue</h3>
            <Select value={revenueGroup} onValueChange={(next) => setRevenueGroup(next as RevenueGroup)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVENUE_GROUPS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Collected per {revenueGroup.toLowerCase()}</CardTitle>
              <CardDescription>Payments grouped in {settings.currency}.</CardDescription>
            </CardHeader>
            <CardContent>
              {revenue.loading && !revenue.data ? (
                <LoadingPanel label="Loading report…" />
              ) : revenueRows.length === 0 ? (
                <EmptyState icon={CircleDollarSign} title="No payments in this period" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={revenueRows} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
                    <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="period"
                      tick={CHART_TICK}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: string) => tickLabel(value, revenueGroup)}
                    />
                    <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} width={56} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => formatCurrency(Number(value), settings.currency)}
                      labelFormatter={(value) => periodLabel(String(value), revenueGroup)}
                    />
                    <Bar dataKey="amount" name="Revenue" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="rounded-xl border bg-card">
            {revenue.loading && !revenue.data ? (
              <LoadingPanel label="Loading report…" />
            ) : revenueRows.length === 0 ? (
              <EmptyState icon={CircleDollarSign} title="Nothing to list" className="py-10" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="text-right">Cash</TableHead>
                    <TableHead className="text-right">Card</TableHead>
                    <TableHead className="text-right">Transfer</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenueRows.map((row) => (
                    <TableRow key={String(row.period)}>
                      <TableCell className="text-sm font-medium">
                        {periodLabel(String(row.period), revenueGroup)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">
                        {formatCurrency(Number(row.amount ?? 0), settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{formatNumber(Number(row.count ?? 0))}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatCurrency(Number(row.cash ?? 0), settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatCurrency(Number(row.card ?? 0), settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatCurrency(Number(row.bankTransfer ?? 0), settings.currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                        {formatCurrency(Number(row.other ?? 0), settings.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="SUBSCRIPTIONS" className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active subscriptions"
              value={formatNumber(summary?.active ?? 0)}
              hint="Currently valid"
              icon={CalendarClock}
              tone="success"
            />
            <StatCard
              label="Expired subscriptions"
              value={formatNumber(summary?.expired ?? 0)}
              hint={`${formatNumber(summary?.suspended ?? 0)} suspended · ${formatNumber(summary?.cancelled ?? 0)} cancelled`}
              icon={CalendarClock}
              tone={(summary?.expired ?? 0) > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="New in period"
              value={formatNumber(summary?.newCount ?? 0)}
              hint={`${formatDate(from)} → ${formatDate(to)}`}
              icon={UserPlus}
            />
            <StatCard
              label="Renewals in period"
              value={formatNumber(summary?.renewals ?? 0)}
              hint="Extended existing memberships"
              icon={Repeat}
              tone="info"
            />
          </div>

          <div className="rounded-xl border bg-card">
            {subscriptions.loading && !subscriptions.data ? (
              <LoadingPanel label="Loading report…" />
            ) : (subscriptions.data?.rows ?? []).length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No subscriptions started in this period"
                description="Widen the reporting window to see subscriptions."
                className="py-10"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(subscriptions.data?.rows ?? []).map((row, index) => (
                    <TableRow key={`${String(row.startDate)}-${String(row.client)}-${index}`}>
                      <TableCell className="text-sm font-medium">{String(row.client ?? '—')}</TableCell>
                      <TableCell className="text-sm">{String(row.plan ?? '—')}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(String(row.startDate ?? ''))} → {formatDate(String(row.endDate ?? ''))}
                      </TableCell>
                      <TableCell>
                        <span className="rounded-md border px-2 py-1 text-xs">
                          {String(row.type) === 'RENEWAL' ? 'Renewal' : 'New'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <SubscriptionStatusBadge status={String(row.status) as SubscriptionStatus} />
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={String(row.paymentStatus) as PaymentStatus} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">
                        {formatCurrency(Number(row.price ?? 0), settings.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
