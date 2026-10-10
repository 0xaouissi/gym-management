import type { LucideIcon } from 'lucide-react'
import { Inbox } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  children?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon = Inbox, title, description, children, className }: EmptyStateProps): React.JSX.Element {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-14 text-center', className)}>
      <div className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}
