import type { ActionResult, Paged, Payment, PaymentMethod, PaymentStatus, PaymentWithDetails } from '@shared/types'
import type { Db } from '../db/database'
import type { AuditService } from './audit.service'

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER']

export function recalcSubscriptionPaymentStatus(db: Db, subscriptionId: number): void {
  const sub = db.get<{ price: number }>('SELECT price FROM subscriptions WHERE id = ?', [subscriptionId])
  if (!sub) return
  const paid =
    db.get<{ total: number }>('SELECT IFNULL(SUM(amount), 0) AS total FROM payments WHERE subscription_id = ?', [
      subscriptionId
    ])?.total ?? 0
  const status: PaymentStatus = paid <= 0 ? 'UNPAID' : paid >= sub.price ? 'PAID' : 'PARTIAL'
  db.run('UPDATE subscriptions SET payment_status = ?, updated_at = ? WHERE id = ?', [
    status,
    new Date().toISOString(),
    subscriptionId
  ])
}

interface PaymentRow {
  id: number
  client_id: number
  subscription_id: number | null
  amount: number
  payment_date: string
  payment_method: PaymentMethod
  reference: string | null
  notes: string | null
  created_at: string
  client_name: string | null
  plan_name: string | null
}

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    clientId: row.client_id,
    subscriptionId: row.subscription_id,
    amount: row.amount,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    reference: row.reference,
    notes: row.notes,
    createdAt: row.created_at
  }
}

function rowToDetails(row: PaymentRow): PaymentWithDetails {
  return {
    ...rowToPayment(row),
    clientName: row.client_name ?? '',
    planName: row.plan_name
  }
}

const PAYMENT_SELECT = `
  SELECT pm.*, cl.first_name || ' ' || cl.last_name AS client_name, p.name AS plan_name
  FROM payments pm
  JOIN clients cl ON cl.id = pm.client_id
  LEFT JOIN subscriptions s ON s.id = pm.subscription_id
  LEFT JOIN subscription_plans p ON p.id = s.plan_id
`

export class PaymentsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService
  ) {}

  list(
    params: {
      from?: string
      to?: string
      method?: PaymentMethod | 'ALL'
      search?: string
      page?: number
      pageSize?: number
    } = {}
  ): Paged<PaymentWithDetails> {
    const where: string[] = []
    const args: unknown[] = []
    if (params.from) {
      where.push('pm.payment_date >= ?')
      args.push(params.from)
    }
    if (params.to) {
      where.push('pm.payment_date <= ?')
      args.push(params.to)
    }
    if (params.method && params.method !== 'ALL') {
      where.push('pm.payment_method = ?')
      args.push(params.method)
    }
    const search = params.search?.trim()
    if (search) {
      const q = `%${search.toLowerCase()}%`
      where.push(
        `(lower(cl.first_name || ' ' || cl.last_name) LIKE ? OR lower(IFNULL(pm.reference,'')) LIKE ? OR lower(IFNULL(pm.notes,'')) LIKE ? OR CAST(pm.id AS TEXT) = ?)`
      )
      args.push(q, q, q, search)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM payments pm JOIN clients cl ON cl.id = pm.client_id ${whereSql}`, args)?.n ?? 0
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25))
    const rows = this.db.all<PaymentRow>(
      `${PAYMENT_SELECT} ${whereSql} ORDER BY pm.payment_date DESC, pm.id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    )
    return { items: rows.map(rowToDetails), total }
  }

  create(input: {
    clientId: number
    subscriptionId?: number | null
    amount: number
    paymentDate?: string
    paymentMethod: PaymentMethod
    reference?: string | null
    notes?: string | null
  }): ActionResult<Payment> {
    const client = this.db.get<{ id: number; first_name: string; last_name: string }>(
      'SELECT id, first_name, last_name FROM clients WHERE id = ?',
      [input.clientId]
    )
    if (!client) return { ok: false, error: 'Client not found' }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { ok: false, error: 'Amount must be greater than zero' }
    }
    if (!METHODS.includes(input.paymentMethod)) return { ok: false, error: 'Invalid payment method' }

    let subscriptionId: number | null = input.subscriptionId ?? null
    if (subscriptionId !== null) {
      const sub = this.db.get<{ client_id: number }>('SELECT client_id FROM subscriptions WHERE id = ?', [
        subscriptionId
      ])
      if (!sub) return { ok: false, error: 'Subscription not found' }
      if (sub.client_id !== input.clientId) return { ok: false, error: 'Subscription does not belong to this client' }
    } else {
      const latest = this.db.get<{ id: number }>(
        `SELECT id FROM subscriptions WHERE client_id = ? AND status != 'CANCELLED' ORDER BY end_date DESC, id DESC LIMIT 1`,
        [input.clientId]
      )
      subscriptionId = latest?.id ?? null
    }

    const paymentId = this.db.tx(() => {
      const result = this.db.run(
        `INSERT INTO payments (client_id, subscription_id, amount, payment_date, payment_method, reference, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.clientId,
          subscriptionId,
          input.amount,
          input.paymentDate || new Date().toISOString().slice(0, 10),
          input.paymentMethod,
          input.reference?.trim() || null,
          input.notes?.trim() || null,
          new Date().toISOString()
        ]
      )
      if (subscriptionId !== null) recalcSubscriptionPaymentStatus(this.db, subscriptionId)
      return result.lastInsertRowid
    })

    const name = `${client.first_name} ${client.last_name}`.trim()
    this.audit.log('PAYMENT_RECORDED', 'payment', paymentId, `Payment of ${input.amount} recorded for ${name}`)
    const row = this.db.get<PaymentRow>(`${PAYMENT_SELECT} WHERE pm.id = ?`, [paymentId]) as PaymentRow
    return { ok: true, data: rowToPayment(row) }
  }

  delete(id: number): ActionResult {
    const row = this.db.get<PaymentRow>(`${PAYMENT_SELECT} WHERE pm.id = ?`, [id])
    if (!row) return { ok: false, error: 'Payment not found' }
    this.db.tx(() => {
      this.db.run('DELETE FROM payments WHERE id = ?', [id])
      if (row.subscription_id !== null) recalcSubscriptionPaymentStatus(this.db, row.subscription_id)
    })
    this.audit.log(
      'PAYMENT_DELETED',
      'payment',
      id,
      `Payment of ${row.amount} for ${row.client_name ?? ''} deleted`
    )
    return { ok: true }
  }

  totalsForClient(clientId: number): { totalPaid: number; outstanding: number } {
    const totalPaid =
      this.db.get<{ total: number }>('SELECT IFNULL(SUM(amount), 0) AS total FROM payments WHERE client_id = ?', [
        clientId
      ])?.total ?? 0
    const current = this.db.get<{ id: number; price: number }>(
      `SELECT id, price FROM subscriptions WHERE client_id = ? AND status != 'CANCELLED' ORDER BY end_date DESC, id DESC LIMIT 1`,
      [clientId]
    )
    if (!current) return { totalPaid, outstanding: 0 }
    const paid =
      this.db.get<{ total: number }>('SELECT IFNULL(SUM(amount), 0) AS total FROM payments WHERE subscription_id = ?', [
        current.id
      ])?.total ?? 0
    return { totalPaid, outstanding: Math.max(0, current.price - paid) }
  }
}
