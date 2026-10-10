import { Link } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  Wallet
} from 'lucide-react'
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
import type { AccessLog, DashboardStats, ExpiringSubscription } from '@shared/types'
import { ACCESS_REASON_LABELS } from '@shared/constants'
import { daysUntil, formatCurrency, formatDate, formatNumber, formatTime } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useSettings } from '@renderer/hooks/useSettings'
import { useSession } from '@renderer/hooks/useSession'
import { runAction } from '@renderer/lib/action'
import { PageHeader } from '@renderer/components/ui/page-header'
import { StatCard } from '@renderer/components/ui/stat-card'
import { Button, buttonVariants } from '@renderer/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { AccessResultBadge } from '@renderer/components/ui/status-badges'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { useState } from 'react'

const CHART_TICK = { fontSize: 11, fill: 'var(--color-muted-foreground)' } as const
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-popover)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--color-popover-foreground)'
} as const

function EntriesChart({ data }: { data: DashboardStats['entriesByDay'] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="allowedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="deniedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-4)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-chart-4)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={CHART_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) => format(parseISO(value), 'dd/MM')}
        />
        <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(value) => format(parseISO(String(value)), 'EEEE d MMM yyyy')}
        />
        <Area
          type="monotone"
          dataKey="allowed"
          name="Allowed"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          fill="url(#allowedFill)"
        />
        <Area
          type="monotone"
          dataKey="denied"
          name="Denied"
          stroke="var(--color-chart-4)"
          strokeWidth={2}
          fill="url(#deniedFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function RevenueChart({ data }: { data: DashboardStats['revenueByMonth'] }): React.JSX.Element {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="month"
          tick={CHART_TICK}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: string) => format(parseISO(`${value}-01`), 'MMM yy')}
        />
        <YAxis tick={CHART_TICK} tickLine={false} axisLine={false} width={56} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value) => formatCurrency(Number(value))}
          labelFormatter={(value) => format(parseISO(`${String(value)}-01`), 'MMMM yyyy')}
        />
        <Bar dataKey="amount" name="Revenue" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ExpiringList({ items }: { items: ExpiringSubscription[] }): React.JSX.Element {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing expiring soon"
        description="No active subscription ends within the warning window."
      />
    )
  }
  return (
    <ul className="divide-y">
      {items.slice(0, 6).map((item) => {
        const days = daysUntil(item.endDate)
        return (
          <li key={item.subscriptionId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link
                to={`/clients/${item.clientId}`}
                className="block truncate text-sm font-medium hover:text-primary"
              >
                {item.clientName}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {item.planName} · ends {formatDate(item.endDate)}
              </p>
            </div>
            <Badge variant={days <= 0 ? 'destructive' : days <= 3 ? 'warning' : 'outline'}>
              {days <= 0 ? 'Expires today' : days === 1 ? '1 day left' : `${days} days left`}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}

function RecentAccessList({ items }: { items: AccessLog[] }): React.JSX.Element {
  if (items.length === 0) {
    return <EmptyState icon={Activity} title="No scans yet" description="Access attempts will appear here." />
  }
  return (
    <ul className="divide-y">
      {items.slice(0, 6).map((log) => (
        <li key={log.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{log.clientName ?? 'Unknown card'}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{log.rfidUid}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {ACCESS_REASON_LABELS[log.reason]}
            </span>
            <AccessResultBadge result={log.result} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function DashboardPage(): React.JSX.Element {
  const { user } = useSession()
  const { settings } = useSettings()
  const [demoOpen, setDemoOpen] = useState(false)
  const stats = useAsyncData<DashboardStats>(() => window.api.dashboard.stats(), [], { live: true })
  const expiring = useAsyncData<ExpiringSubscription[]>(
    () => window.api.subs.expiring(settings.expirationWarningDays),
    [settings.expirationWarningDays],
    { live: true }
  )
  const recent = useAsyncData<AccessLog[]>(() => window.api.access.recent(10), [], { live: true })

  const data = stats.data

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Live snapshot of members, subscriptions, access and revenue."
        actions={
          <>
            {user?.role === 'ADMIN' ? (
              <Button variant="outline" size="sm" onClick={() => setDemoOpen(true)}>
                <Sparkles className="size-4" />
                Generate demo data
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void stats.reload()}>
              <RefreshCw className={stats.loading ? 'size-4 animate-spin' : 'size-4'} />
              Refresh
            </Button>
          </>
        }
      />

      {stats.loading && !data ? <LoadingPanel label="Loading dashboard…" /> : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total clients"
              value={formatNumber(data.totalClients)}
              hint={`${formatNumber(data.activeClients)} active · ${formatNumber(data.blockedClients)} blocked`}
              icon={Users}
              tone="info"
            />
            <StatCard
              label="Active subscriptions"
              value={formatNumber(data.activeSubscriptions)}
              hint={`${formatNumber(data.expiredSubscriptions)} expired · ${formatNumber(data.expiringSoon)} expiring soon`}
              icon={CalendarClock}
              tone="success"
            />
            <StatCard
              label="Entries today"
              value={formatNumber(data.todayEntries)}
              hint={`${formatNumber(data.todayDenied)} denied attempts`}
              icon={Activity}
              tone={data.todayDenied > 0 ? 'warning' : 'default'}
            />
            <StatCard
              label="Revenue this month"
              value={formatCurrency(data.monthRevenue, settings.currency)}
              hint={`Today ${formatCurrency(data.todayRevenue, settings.currency)} · total ${formatCurrency(data.totalRevenue, settings.currency)}`}
              icon={CircleDollarSign}
              tone="success"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { label: 'Expired', value: data.expiringBuckets.expired, tone: 'destructive' as const },
              { label: 'Ends today', value: data.expiringBuckets.today, tone: 'warning' as const },
              { label: 'Within 1 day', value: data.expiringBuckets.in1, tone: 'warning' as const },
              { label: 'Within 3 days', value: data.expiringBuckets.in3, tone: 'default' as const },
              { label: 'Within 7 days', value: data.expiringBuckets.in7, tone: 'default' as const }
            ].map((bucket) => (
              <Card key={bucket.label}>
                <CardContent className="flex items-center justify-between p-4">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {bucket.label}
                  </span>
                  <span className="text-xl font-semibold tabular-nums">{formatNumber(bucket.value)}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Access activity</CardTitle>
                <CardDescription>Allowed vs denied scans per day.</CardDescription>
              </CardHeader>
              <CardContent>
                {data.entriesByDay.length === 0 ? (
                  <EmptyState icon={Activity} title="No access data yet" />
                ) : (
                  <EntriesChart data={data.entriesByDay} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Revenue</CardTitle>
                  <CardDescription>Payments collected per month.</CardDescription>
                </div>
                <TrendingUp className="size-4 text-primary" />
              </CardHeader>
              <CardContent>
                {data.revenueByMonth.length === 0 ? (
                  <EmptyState icon={Wallet} title="No payments recorded yet" />
                ) : (
                  <RevenueChart data={data.revenueByMonth} />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Expiring subscriptions</CardTitle>
                  <CardDescription>
                    Within the {settings.expirationWarningDays}-day warning window.
                  </CardDescription>
                </div>
                <Link to="/subscriptions?filter=expiring" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  View all
                  <ArrowUpRight className="size-4" />
                </Link>
              </CardHeader>
              <CardContent>
                <ExpiringList items={expiring.data ?? []} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div className="space-y-1">
                  <CardTitle>Recent access</CardTitle>
                  <CardDescription>Latest turnstile decisions.</CardDescription>
                </div>
                <Link to="/attendance" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  View all
                  <ArrowUpRight className="size-4" />
                </Link>
              </CardHeader>
              <CardContent>
                <RecentAccessList items={recent.data ?? []} />
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      {stats.error ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-destructive">
            <ShieldAlert className="size-4" />
            {stats.error}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={demoOpen}
        onOpenChange={setDemoOpen}
        title="Generate demo data?"
        description="Creates sample clients, RFID cards, subscriptions, payments and access logs. Existing data is kept."
        confirmLabel="Generate"
        onConfirm={async () => {
          const result = await runAction(window.api.dev.generateDemoData(), 'Demo data generated')
          if (result.ok) {
            setDemoOpen(false)
            await Promise.all([stats.refresh(), expiring.refresh(), recent.refresh()])
          }
        }}
      />

      <p className="text-right text-xs text-muted-foreground">
        Last update {formatTime(new Date().toISOString())}
      </p>
    </div>
  )
}
