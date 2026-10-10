import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/utils'

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-muted-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-warning/20 text-warning',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
        info: 'border-transparent bg-chart-5/15 text-chart-5',
        muted: 'border-transparent bg-muted text-muted-foreground'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
