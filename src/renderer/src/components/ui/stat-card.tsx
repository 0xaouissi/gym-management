import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

type StatTone = 'default' | 'success' | 'warning' | 'destructive' | 'info'

const TONE_STYLES: Record<StatTone, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  info: 'bg-chart-5/15 text-chart-5'
}

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon?: LucideIcon
  tone?: StatTone
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'default' }: StatCardProps): React.JSX.Element {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums leading-tight">{value}</p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONE_STYLES[tone])}>
            <Icon className="size-4.5" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
