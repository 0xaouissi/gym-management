import { todayISO } from '@shared/utils'
import type { ReportRow } from '@shared/types'
import type { Db } from '../db/database'

type AttendanceGroup = 'DAY' | 'WEEK' | 'MONTH'
type RevenueGroup = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR'

function attendancePeriod(groupBy: AttendanceGroup): string {
  switch (groupBy) {
    case 'WEEK':
      return `strftime('%Y-W%W', timestamp, 'localtime')`
    case 'MONTH':
      return `strftime('%Y-%m', timestamp, 'localtime')`
    default:
      return `date(timestamp, 'localtime')`
  }
}

function revenuePeriod(groupBy: RevenueGroup): string {
  switch (groupBy) {
    case 'WEEK':
      return `strftime('%Y-W%W', payment_date)`
    case 'MONTH':
      return `substr(payment_date, 1, 7)`
    case 'YEAR':
      return `substr(payment_date, 1, 4)`
    default:
      return `payment_date`
  }
}

export class ReportsService {
  constructor(private readonly db: Db) {}

  attendance(params: { from: string; to: string; groupBy: AttendanceGroup }): ReportRow[] {
    const period = attendancePeriod(params.groupBy)
    const rows = this.db.all<{ period: string; allowed: number; denied: number; total: number }>(
      `SELECT ${period} AS period,
        SUM(CASE WHEN result = 'ALLOWED' THEN 1 ELSE 0 END) AS allowed,
        SUM(CASE WHEN result = 'DENIED' THEN 1 ELSE 0 END) AS denied,
        COUNT(*) AS total
       FROM access_logs
       WHERE date(timestamp, 'localtime') BETWEEN ? AND ?
       GROUP BY period ORDER BY period`,
      [params.from, params.to]
    )
    return rows.map((row) => ({
      period: row.period,
      allowed: row.allowed ?? 0,
      denied: row.denied ?? 0,
      total: row.total ?? 0
    }))
  }

  revenue(params: { from: string; to: string; groupBy: RevenueGroup }): ReportRow[] {
    const period = revenuePeriod(params.groupBy)
    const rows = this.db.all<{
      period: string
      amount: number
      count: number
      cash: number
      card: number
      bankTransfer: number
      other: number
    }>(
      `SELECT ${period} AS period,
        IFNULL(SUM(amount), 0) AS amount,
        COUNT(*) AS count,
        IFNULL(SUM(CASE WHEN payment_method = 'CASH' THEN amount ELSE 0 END), 0) AS cash,
        IFNULL(SUM(CASE WHEN payment_method = 'CARD' THEN amount ELSE 0 END), 0) AS card,
        IFNULL(SUM(CASE WHEN payment_method = 'BANK_TRANSFER' THEN amount ELSE 0 END), 0) AS bankTransfer,
        IFNULL(SUM(CASE WHEN payment_method = 'OTHER' THEN amount ELSE 0 END), 0) AS other
       FROM payments
       WHERE payment_date BETWEEN ? AND ?
       GROUP BY period ORDER BY period`,
      [params.from, params.to]
    )
    return rows.map((row) => ({
      period: row.period,
      amount: row.amount,
      count: row.count,
      cash: row.cash,
      card: row.card,
      bankTransfer: row.bankTransfer,
      other: row.other
    }))
  }

  subscriptions(params: { from: string; to: string }): {
    summary: { active: number; expired: number; suspended: number; cancelled: number; newCount: number; renewals: number }
    rows: ReportRow[]
  } {
    const today = todayISO()
    const n = (sql: string, args: unknown[] = []): number => this.db.get<{ n: number }>(sql, args)?.n ?? 0

    const summary = {
      active: n(`SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'ACTIVE' AND end_date >= ?`, [today]),
      expired: n(
        `SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'EXPIRED' OR (status = 'ACTIVE' AND end_date < ?)`,
        [today]
      ),
      suspended: n(`SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'SUSPENDED'`),
      cancelled: n(`SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'CANCELLED'`),
      newCount: n(`SELECT COUNT(*) AS n FROM subscriptions WHERE is_renewal = 0 AND start_date BETWEEN ? AND ?`, [
        params.from,
        params.to
      ]),
      renewals: n(`SELECT COUNT(*) AS n FROM subscriptions WHERE is_renewal = 1 AND start_date BETWEEN ? AND ?`, [
        params.from,
        params.to
      ])
    }

    const rows = this.db.all<{
      start_date: string
      end_date: string
      status: string
      price: number
      payment_status: string
      is_renewal: number
      client_name: string
      plan_name: string
    }>(
      `SELECT s.start_date, s.end_date, s.status, s.price, s.payment_status, s.is_renewal,
        cl.first_name || ' ' || cl.last_name AS client_name, p.name AS plan_name
       FROM subscriptions s
       JOIN clients cl ON cl.id = s.client_id
       JOIN subscription_plans p ON p.id = s.plan_id
       WHERE s.start_date BETWEEN ? AND ?
       ORDER BY s.start_date DESC, s.id DESC`,
      [params.from, params.to]
    )

    return {
      summary,
      rows: rows.map((row) => ({
        period: row.start_date,
        client: row.client_name,
        plan: row.plan_name,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
        paymentStatus: row.payment_status,
        type: row.is_renewal === 1 ? 'RENEWAL' : 'NEW',
        price: row.price
      }))
    }
  }
}
