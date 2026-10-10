import { addDays, addMonths, addWeeks, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { DurationUnit, SubscriptionPlan, SubscriptionStatus } from './types'

export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function addDuration(dateISO: string, value: number, unit: DurationUnit): string {
  const date = parseISO(dateISO)
  const next =
    unit === 'DAYS' ? addDays(date, value) : unit === 'WEEKS' ? addWeeks(date, value) : addMonths(date, value)
  return format(next, 'yyyy-MM-dd')
}

export function planEndDate(
  startISO: string,
  plan: Pick<SubscriptionPlan, 'durationValue' | 'durationUnit'>,
  months = 1
): string {
  if (Number.isInteger(months) && months > 1) return addDuration(startISO, months, 'MONTHS')
  return addDuration(startISO, plan.durationValue, plan.durationUnit)
}

export interface RenewalDates {
  startDate: string
  endDate: string
}

export function computeRenewalDates(
  currentEndDate: string | null,
  plan: Pick<SubscriptionPlan, 'durationValue' | 'durationUnit'>,
  today: string = todayISO(),
  months = 1
): RenewalDates {
  const start = currentEndDate && currentEndDate >= today ? currentEndDate : today
  return { startDate: start, endDate: planEndDate(start, plan, months) }
}

export function normalizeMonths(months: number | undefined | null): number {
  if (!Number.isInteger(months) || (months as number) < 1) return 1
  return Math.min(months as number, 36)
}

export function planTotalPrice(
  plan: Pick<SubscriptionPlan, 'price'>,
  months: number
): number {
  return Math.round(plan.price * normalizeMonths(months) * 100) / 100
}

export function isSubscriptionCurrentlyActive(endDate: string, today: string = todayISO()): boolean {
  return endDate >= today
}

export function effectiveSubscriptionStatus(
  status: SubscriptionStatus,
  endDate: string,
  today: string = todayISO()
): SubscriptionStatus {
  if (status === 'CANCELLED' || status === 'SUSPENDED') return status
  return endDate < today ? 'EXPIRED' : 'ACTIVE'
}

export function daysUntil(dateISO: string): number {
  return differenceInCalendarDays(parseISO(dateISO), parseISO(todayISO()))
}

export function normalizeUid(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s:-]/g, '')
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'dd/MM/yyyy')
  } catch {
    return dateStr
  }
}

export function formatDateLong(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    return format(parseISO(dateStr), 'd MMMM yyyy')
  } catch {
    return dateStr
  }
}

export function formatDateTime(timestamp?: string | null): string {
  if (!timestamp) return '—'
  try {
    return format(new Date(timestamp), 'dd/MM/yyyy HH:mm')
  } catch {
    return timestamp
  }
}

export function formatTime(timestamp?: string | null): string {
  if (!timestamp) return '—'
  try {
    return format(new Date(timestamp), 'HH:mm:ss')
  } catch {
    return timestamp
  }
}

export function formatCurrency(amount: number, currency = 'DZD'): string {
  try {
    return new Intl.NumberFormat('fr-DZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatNumber(value: number): string {
  try {
    return new Intl.NumberFormat('fr-FR').format(value)
  } catch {
    return String(value)
  }
}

export function clientFullName(client: { firstName: string; lastName: string }): string {
  return `${client.firstName} ${client.lastName}`.trim()
}

export function toDateInputValue(dateISO?: string | null): string {
  return dateISO ? dateISO.slice(0, 10) : ''
}
