import { addDuration, computeRenewalDates, daysUntil, normalizeMonths, planEndDate, planTotalPrice, todayISO } from '@shared/utils'
import type {
  ActionResult,
  ExpiringSubscription,
  Paged,
  PaymentMethod,
  SubscriptionStatus,
  SubscriptionWithDetails
} from '@shared/types'
import type { Db } from '../db/database'
import type { AuditService } from './audit.service'
import { mapSubscriptionRow, SUB_DETAIL_COLUMNS, SUB_DETAIL_JOINS, type SubscriptionDetailRow } from './mappers'
import { recalcSubscriptionPaymentStatus } from './payments.service'
import type { PlansService } from './plans.service'
import type { SettingsService } from './settings.service'

export class SubscriptionsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly plans: PlansService,
    private readonly settings: SettingsService
  ) {}

  getById(id: number): SubscriptionWithDetails | null {
    const row = this.db.get<SubscriptionDetailRow>(`SELECT ${SUB_DETAIL_COLUMNS} ${SUB_DETAIL_JOINS} WHERE s.id = ?`, [id])
    return row ? mapSubscriptionRow(row) : null
  }

  getRawRow(id: number): SubscriptionDetailRow | null {
    return (
      this.db.get<SubscriptionDetailRow>(
        `SELECT ${SUB_DETAIL_COLUMNS} ${SUB_DETAIL_JOINS} WHERE s.id = ?`,
        [id]
      ) ?? null
    )
  }

  forClient(clientId: number): SubscriptionWithDetails[] {
    const rows = this.db.all<SubscriptionDetailRow>(
      `SELECT ${SUB_DETAIL_COLUMNS} ${SUB_DETAIL_JOINS} WHERE s.client_id = ? ORDER BY s.end_date DESC, s.id DESC`,
      [clientId]
    )
    return rows.map((row) => mapSubscriptionRow(row))
  }

  private latestLiveEndDate(clientId: number): string | null {
    const row = this.db.get<{ end_date: string }>(
      `SELECT end_date FROM subscriptions WHERE client_id = ? AND status != 'CANCELLED' ORDER BY end_date DESC, id DESC LIMIT 1`,
      [clientId]
    )
    return row?.end_date ?? null
  }

  list(
    params: {
      search?: string
      status?: SubscriptionStatus | 'ALL'
      expiringOnly?: boolean
      page?: number
      pageSize?: number
    } = {}
  ): Paged<SubscriptionWithDetails> {
    const where: string[] = []
    const args: unknown[] = []
    const today = todayISO()
    const search = params.search?.trim()
    if (search) {
      const q = `%${search.toLowerCase()}%`
      where.push(
        `(lower(cl.first_name || ' ' || cl.last_name) LIKE ? OR lower(p.name) LIKE ? OR CAST(s.id AS TEXT) = ?)`
      )
      args.push(q, q, search)
    }
    switch (params.status) {
      case 'ACTIVE':
        where.push(`s.status = 'ACTIVE' AND s.end_date >= ?`)
        args.push(today)
        break
      case 'EXPIRED':
        where.push(`(s.status = 'EXPIRED' OR (s.status = 'ACTIVE' AND s.end_date < ?))`)
        args.push(today)
        break
      case 'SUSPENDED':
        where.push(`s.status = 'SUSPENDED'`)
        break
      case 'CANCELLED':
        where.push(`s.status = 'CANCELLED'`)
        break
      default:
        break
    }
    if (params.expiringOnly) {
      const warnDays = this.settings.get().expirationWarningDays
      where.push(`s.status = 'ACTIVE' AND s.end_date >= ? AND s.end_date <= ?`)
      args.push(today, addDuration(today, warnDays, 'DAYS'))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total =
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n ${SUB_DETAIL_JOINS} ${whereSql}`, args)?.n ?? 0
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25))
    const rows = this.db.all<SubscriptionDetailRow>(
      `SELECT ${SUB_DETAIL_COLUMNS} ${SUB_DETAIL_JOINS} ${whereSql} ORDER BY s.end_date DESC, s.id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    )
    return { items: rows.map((row) => mapSubscriptionRow(row)), total }
  }

  create(input: {
    clientId: number
    planId: number
    startDate?: string
    months?: number
    price?: number
    notes?: string | null
    payment?: { amount: number; paymentMethod: PaymentMethod; reference?: string | null } | null
  }): ActionResult<SubscriptionWithDetails> {
    const client = this.db.get<{ id: number }>('SELECT id FROM clients WHERE id = ?', [input.clientId])
    if (!client) return { ok: false, error: 'Client not found' }
    const plan = this.plans.getById(input.planId)
    if (!plan) return { ok: false, error: 'Subscription plan not found' }
    const startDate = input.startDate || todayISO()
    const months = normalizeMonths(input.months)
    const endDate = planEndDate(startDate, plan, months)
    const price = input.price === undefined ? planTotalPrice(plan, months) : input.price
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'Price must be zero or more' }
    const status: SubscriptionStatus = endDate < todayISO() ? 'EXPIRED' : 'ACTIVE'

    try {
      const subscriptionId = this.db.tx(() => {
        const now = new Date().toISOString()
        const result = this.db.run(
          `INSERT INTO subscriptions (client_id, plan_id, start_date, end_date, status, price, payment_status, is_renewal, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'UNPAID', 0, ?, ?, ?)`,
          [input.clientId, input.planId, startDate, endDate, status, price, input.notes?.trim() || null, now, now]
        )
        if (input.payment && input.payment.amount > 0) {
          this.db.run(
            `INSERT INTO payments (client_id, subscription_id, amount, payment_date, payment_method, reference, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
            [
              input.clientId,
              result.lastInsertRowid,
              input.payment.amount,
              todayISO(),
              input.payment.paymentMethod,
              input.payment.reference?.trim() || null,
              now
            ]
          )
          recalcSubscriptionPaymentStatus(this.db, result.lastInsertRowid)
        }
        return result.lastInsertRowid
      })
      const name =
        this.db.get<{ name: string }>('SELECT first_name || \' \' || last_name AS name FROM clients WHERE id = ?', [
          input.clientId
        ])?.name ?? ''
      this.audit.log(
        'SUBSCRIPTION_CREATED',
        'subscription',
        subscriptionId,
        `Plan "${plan.name}" (${startDate} → ${endDate}) started for ${name}`
      )
      return { ok: true, data: this.getById(subscriptionId) as SubscriptionWithDetails }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to create subscription' }
    }
  }

  renew(input: {
    subscriptionId: number
    planId?: number
    months?: number
    price?: number
    payment?: { amount: number; paymentMethod: PaymentMethod; reference?: string | null } | null
  }): ActionResult<SubscriptionWithDetails> {
    const current = this.getRawRow(input.subscriptionId)
    if (!current) return { ok: false, error: 'Subscription not found' }
    const plan = this.plans.getById(input.planId ?? current.plan_id)
    if (!plan) return { ok: false, error: 'Subscription plan not found' }
    const today = todayISO()
    const baseEnd = this.latestLiveEndDate(current.client_id) ?? current.end_date
    const months = normalizeMonths(input.months)
    const { startDate, endDate } = computeRenewalDates(baseEnd, plan, today, months)
    const price = input.price === undefined ? planTotalPrice(plan, months) : input.price
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'Price must be zero or more' }

    try {
      const subscriptionId = this.db.tx(() => {
        const now = new Date().toISOString()
        const result = this.db.run(
          `INSERT INTO subscriptions (client_id, plan_id, start_date, end_date, status, price, payment_status, is_renewal, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'ACTIVE', ?, 'UNPAID', 1, ?, ?, ?)`,
          [
            current.client_id,
            plan.id,
            startDate,
            endDate,
            price,
            `Renewal of subscription #${current.id}`,
            now,
            now
          ]
        )
        if (input.payment && input.payment.amount > 0) {
          this.db.run(
            `INSERT INTO payments (client_id, subscription_id, amount, payment_date, payment_method, reference, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
            [
              current.client_id,
              result.lastInsertRowid,
              input.payment.amount,
              today,
              input.payment.paymentMethod,
              input.payment.reference?.trim() || null,
              now
            ]
          )
          recalcSubscriptionPaymentStatus(this.db, result.lastInsertRowid)
        }
        return result.lastInsertRowid
      })
      this.audit.log(
        'SUBSCRIPTION_RENEWED',
        'subscription',
        subscriptionId,
        `${current.client_name} renewed (${plan.name}): ${startDate} → ${endDate}`
      )
      return { ok: true, data: this.getById(subscriptionId) as SubscriptionWithDetails }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to renew subscription' }
    }
  }

  private setStatus(id: number, next: SubscriptionStatus, allowedFrom: SubscriptionStatus[], auditAction: string, detail: string): ActionResult {
    const current = this.getRawRow(id)
    if (!current) return { ok: false, error: 'Subscription not found' }
    if (current.status === next) return { ok: false, error: `Subscription is already ${next.toLowerCase()}` }
    if (!allowedFrom.includes(current.status)) {
      return { ok: false, error: `Cannot change a ${current.status.toLowerCase()} subscription to ${next.toLowerCase()}` }
    }
    this.db.run('UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?', [
      next,
      new Date().toISOString(),
      id
    ])
    this.audit.log(auditAction, 'subscription', id, `${current.client_name}: ${detail}`)
    return { ok: true }
  }

  cancel(id: number, reason?: string): ActionResult {
    const current = this.getRawRow(id)
    if (!current) return { ok: false, error: 'Subscription not found' }
    if (current.status === 'CANCELLED') return { ok: false, error: 'Subscription is already cancelled' }
    const notes = reason?.trim()
      ? `${current.notes ? `${current.notes}\n` : ''}Cancelled: ${reason.trim()}`
      : current.notes
    this.db.run('UPDATE subscriptions SET status = ?, notes = ?, updated_at = ? WHERE id = ?', [
      'CANCELLED',
      notes,
      new Date().toISOString(),
      id
    ])
    this.audit.log('SUBSCRIPTION_CANCELLED', 'subscription', id, `${current.client_name} cancelled${reason ? ` — ${reason.trim()}` : ''}`)
    return { ok: true }
  }

  suspend(id: number, reason?: string): ActionResult {
    const detail = `suspended${reason?.trim() ? ` — ${reason.trim()}` : ''}`
    return this.setStatus(id, 'SUSPENDED', ['ACTIVE', 'EXPIRED'], 'SUBSCRIPTION_SUSPENDED', detail)
  }

  resume(id: number): ActionResult {
    const current = this.getRawRow(id)
    if (!current) return { ok: false, error: 'Subscription not found' }
    if (current.status !== 'SUSPENDED') return { ok: false, error: 'Only suspended subscriptions can be resumed' }
    const next: SubscriptionStatus = current.end_date < todayISO() ? 'EXPIRED' : 'ACTIVE'
    this.db.run('UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ?', [
      next,
      new Date().toISOString(),
      id
    ])
    this.audit.log('SUBSCRIPTION_RESUMED', 'subscription', id, `${current.client_name} resumed (${next})`)
    return { ok: true }
  }

  extend(id: number, days: number): ActionResult {
    if (!Number.isInteger(days) || days <= 0) return { ok: false, error: 'Days must be a positive whole number' }
    const current = this.getRawRow(id)
    if (!current) return { ok: false, error: 'Subscription not found' }
    if (current.status === 'CANCELLED') return { ok: false, error: 'Cannot extend a cancelled subscription' }
    const today = todayISO()
    const base = current.end_date >= today ? current.end_date : today
    const newEnd = addDuration(base, days, 'DAYS')
    const nextStatus: SubscriptionStatus = current.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'
    this.db.run('UPDATE subscriptions SET end_date = ?, status = ?, updated_at = ? WHERE id = ?', [
      newEnd,
      nextStatus,
      new Date().toISOString(),
      id
    ])
    this.audit.log(
      'SUBSCRIPTION_EXTENDED',
      'subscription',
      id,
      `${current.client_name}: extended by ${days} day(s) to ${newEnd}`
    )
    return { ok: true }
  }

  changePlan(id: number, planId: number, recalculateEndDate: boolean): ActionResult {
    const current = this.getRawRow(id)
    if (!current) return { ok: false, error: 'Subscription not found' }
    const plan = this.plans.getById(planId)
    if (!plan) return { ok: false, error: 'Subscription plan not found' }
    const endDate = recalculateEndDate ? planEndDate(current.start_date, plan) : current.end_date
    const status: SubscriptionStatus =
      current.status === 'CANCELLED' || current.status === 'SUSPENDED'
        ? current.status
        : endDate < todayISO()
          ? 'EXPIRED'
          : 'ACTIVE'
    this.db.run('UPDATE subscriptions SET plan_id = ?, end_date = ?, status = ?, updated_at = ? WHERE id = ?', [
      planId,
      endDate,
      status,
      new Date().toISOString(),
      id
    ])
    this.audit.log(
      'SUBSCRIPTION_PLAN_CHANGED',
      'subscription',
      id,
      `${current.client_name}: plan changed to "${plan.name}"${recalculateEndDate ? ` (new end ${endDate})` : ''}`
    )
    return { ok: true }
  }

  expiring(withinDays: number): ExpiringSubscription[] {
    const today = todayISO()
    const limit = addDuration(today, Math.max(0, withinDays), 'DAYS')
    const rows = this.db.all<SubscriptionDetailRow>(
      `SELECT ${SUB_DETAIL_COLUMNS} ${SUB_DETAIL_JOINS}
       WHERE s.status = 'ACTIVE' AND s.end_date >= ? AND s.end_date <= ?
       ORDER BY s.end_date, cl.last_name`,
      [today, limit]
    )
    return rows.map((row) => ({
      subscriptionId: row.id,
      clientId: row.client_id,
      clientName: row.client_name ?? '',
      planName: row.plan_name,
      endDate: row.end_date,
      daysLeft: daysUntil(row.end_date)
    }))
  }

  expireDueSubscriptions(): number {
    const result = this.db.run(`UPDATE subscriptions SET status = 'EXPIRED', updated_at = ? WHERE status = 'ACTIVE' AND end_date < ?`, [
      new Date().toISOString(),
      todayISO()
    ])
    return result.changes
  }
}
