import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { formatNumber } from '@shared/utils'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange(page: number): void
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps): React.JSX.Element | null {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-3">
      <p className="text-xs text-muted-foreground">
        Showing {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} title="Previous page">
          <ChevronLeft />
        </Button>
        <span className="px-2 text-xs text-muted-foreground">
          Page {page} of {pageCount}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} title="Next page">
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
