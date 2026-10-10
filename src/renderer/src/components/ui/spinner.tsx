import { Loader2 } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export function Spinner({ className }: { className?: string }): React.JSX.Element {
  return <Loader2 className={cn('size-4 animate-spin text-muted-foreground', className)} />
}

export function LoadingPanel({ label = 'Loading…' }: { label?: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      {label}
    </div>
  )
}
