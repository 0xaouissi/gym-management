import { cn } from '@renderer/lib/utils'

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>): React.JSX.Element {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

export function TableHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />
}

export function TableBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>): React.JSX.Element {
  return (
    <tr className={cn('border-b transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted', className)} {...props} />
  )
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return (
    <th
      className={cn('h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground', className)}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return <td className={cn('whitespace-nowrap px-3 py-2.5 align-middle', className)} {...props} />
}

export function TableFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <tfoot className={cn('border-t bg-muted/40 font-medium', className)} {...props} />
}
