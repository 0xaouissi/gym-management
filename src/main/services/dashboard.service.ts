import { addDuration, todayISO } from '@shared/utils'
import { format, subDays, subMonths } from 'date-fns'
import type { DashboardStats } from '@shared/types'
import type { Db } from '../db/database'
import type { SettingsService } from './settings.service'

export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly settings: SettingsService
  ) {}

  stats(): DashboardStats {
    const today = todayISO()
    const warnDays = this.settings.get().expirationWarningDays

    const n = (sql: string, args: unknown[] = []): number => this.db.get<{ n: number }>(sql, args)?.n ?? 0

    const totalClients = n('SELECT COUNT(*) AS n FROM clients')
    const activeClients = n(`SELECT COUNT(*) AS n FROM clients WHERE status = 'ACTIVE'`)
    const blockedClients = n(`SELECT COUNT(*) AS n FROM clients WHERE status = 'BLOCKED'`)
    const activeSubscriptions = n(
      `SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'ACTIVE' AND end_date >= ?`,
      [today]
    )
    const expiredSubscriptions = n(
      `SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'EXPIRED' OR (status = 'ACTIVE' AND end_date < ?)`,
      [today]
    )
    const expiringSoon = n(
      `SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'ACTIVE' AND end_date >= ? AND end_date <= ?`,
      [today, addDuration(today, warnDays, 'DAYS')]
    )
    const todayAccess = this.db.get<{ entries: number; denied: number }>(
      `SELECT
        SUM(CASE WHEN result = 'ALLOWED' THEN 1 ELSE 0 END) AS entries,
        SUM(CASE WHEN result = 'DENIED' THEN 1 ELSE 0 END) AS denied
       FROM access_logs WHERE date(timestamp, 'localtime') = date('now', 'localtime')`
    )
    const todayRevenue =
      this.db.get<{ total: number }>(`SELECT IFNULL(SUM(amount), 0) AS total FROM payments WHERE payment_date = ?`, [
        today
      ])?.total ?? 0
    const monthRevenue =
      this.db.get<{ total: number }>(
        `SELECT IFNULL(SUM(amount), 0) AS total FROM payments WHERE substr(payment_date, 1, 7) = ?`,
        [today.slice(0, 7)]
      )?.total ?? 0
    const totalRevenue =
      this.db.get<{ total: number }>('SELECT IFNULL(SUM(amount), 0) AS total FROM payments')?.total ?? 0

    const buckets = this.db.get<{
      expired: number
      today: number
      in1: number
      in3: number
      in7: number
    }>(
      `SELECT
        SUM(CASE WHEN end_date < ? AND status IN ('ACTIVE','EXPIRED') THEN 1 ELSE 0 END) AS expired,
        SUM(CASE WHEN end_date = ? AND status = 'ACTIVE' THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN end_date = ? AND status = 'ACTIVE' THEN 1 ELSE 0 END) AS in1,
        SUM(CASE WHEN end_date IN (?, ?) AND status = 'ACTIVE' THEN 1 ELSE 0 END) AS in3,
        SUM(CASE WHEN end_date >= ? AND end_date <= ? AND status = 'ACTIVE' THEN 1 ELSE 0 END) AS in7
       FROM subscriptions`,
      [
        today,
        today,
        addDuration(today, 1, 'DAYS'),
        addDuration(today, 2, 'DAYS'),
        addDuration(today, 3, 'DAYS'),
        addDuration(today, 4, 'DAYS'),
        addDuration(today, 7, 'DAYS')
      ]
    )

    const firstDay = format(subDays(new Date(), 13), 'yyyy-MM-dd')
    const dayRows = this.db.all<{ day: string; allowed: number; denied: number }>(
      `SELECT date(timestamp, 'localtime') AS day,
        SUM(CASE WHEN result = 'ALLOWED' THEN 1 ELSE 0 END) AS allowed,
        SUM(CASE WHEN result = 'DENIED' THEN 1 ELSE 0 END) AS denied
       FROM access_logs WHERE date(timestamp, 'localtime') >= ?
       GROUP BY day ORDER BY day`,
      [firstDay]
    )
    const dayMap = new Map(dayRows.map((row) => [row.day, row]))
    const entriesByDay: DashboardStats['entriesByDay'] = []
    for (let i = 13; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
      const row = dayMap.get(date)
      entriesByDay.push({ date, allowed: row?.allowed ?? 0, denied: row?.denied ?? 0 })
    }

    const firstMonth = format(subMonths(new Date(), 5), 'yyyy-MM')
    const monthRows = this.db.all<{ month: string; amount: number }>(
      `SELECT substr(payment_date, 1, 7) AS month, IFNULL(SUM(amount), 0) AS amount
       FROM payments WHERE substr(payment_date, 1, 7) >= ?
       GROUP BY month ORDER BY month`,
      [firstMonth]
    )
    const monthMap = new Map(monthRows.map((row) => [row.month, row.amount]))
    const revenueByMonth: DashboardStats['revenueByMonth'] = []
    for (let i = 5; i >= 0; i--) {
      const month = format(subMonths(new Date(), i), 'yyyy-MM')
      revenueByMonth.push({ month, amount: monthMap.get(month) ?? 0 })
    }

    return {
      totalClients,
      activeClients,
      blockedClients,
      activeSubscriptions,
      expiredSubscriptions,
      expiringSoon,
      todayEntries: todayAccess?.entries ?? 0,
      todayDenied: todayAccess?.denied ?? 0,
      todayRevenue,
      monthRevenue,
      totalRevenue,
      expiringBuckets: {
        expired: buckets?.expired ?? 0,
        today: buckets?.today ?? 0,
        in1: buckets?.in1 ?? 0,
        in3: buckets?.in3 ?? 0,
        in7: buckets?.in7 ?? 0
      },
      entriesByDay,
      revenueByMonth
    }
  }
}
