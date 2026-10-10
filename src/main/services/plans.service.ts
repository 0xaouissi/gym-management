import type { ActionResult, DurationUnit, SubscriptionPlan } from '@shared/types'
import type { Db } from '../db/database'
import type { AuditService } from './audit.service'

const UNITS: DurationUnit[] = ['DAYS', 'WEEKS', 'MONTHS']

interface PlanRow {
  id: number
  name: string
  description: string | null
  duration_value: number
  duration_unit: DurationUnit
  price: number
  is_active: number
  created_at: string
  updated_at: string
}

function rowToPlan(row: PlanRow): SubscriptionPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    price: row.price,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class PlansService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService
  ) {}

  list(includeInactive = false): SubscriptionPlan[] {
    const rows = this.db.all<PlanRow>(
      `SELECT * FROM subscription_plans ${includeInactive ? '' : 'WHERE is_active = 1'}
       ORDER BY CASE duration_unit WHEN 'DAYS' THEN 1 WHEN 'WEEKS' THEN 2 ELSE 3 END, duration_value, price`
    )
    return rows.map(rowToPlan)
  }

  getById(id: number): SubscriptionPlan | null {
    const row = this.db.get<PlanRow>('SELECT * FROM subscription_plans WHERE id = ?', [id])
    return row ? rowToPlan(row) : null
  }

  create(input: {
    name: string
    description?: string | null
    durationValue: number
    durationUnit: DurationUnit
    price: number
    isActive?: boolean
  }): ActionResult<SubscriptionPlan> {
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'Plan name is required' }
    if (!Number.isInteger(input.durationValue) || input.durationValue <= 0) {
      return { ok: false, error: 'Duration must be a positive whole number' }
    }
    if (!UNITS.includes(input.durationUnit)) return { ok: false, error: 'Invalid duration unit' }
    if (!Number.isFinite(input.price) || input.price < 0) return { ok: false, error: 'Price must be zero or more' }

    const now = new Date().toISOString()
    const result = this.db.run(
      `INSERT INTO subscription_plans (name, description, duration_value, duration_unit, price, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        input.description?.trim() || null,
        input.durationValue,
        input.durationUnit,
        input.price,
        input.isActive === false ? 0 : 1,
        now,
        now
      ]
    )
    this.audit.log('PLAN_CREATED', 'plan', result.lastInsertRowid, `Plan "${name}" created`)
    return { ok: true, data: this.getById(result.lastInsertRowid) as SubscriptionPlan }
  }

  update(
    id: number,
    patch: { name?: string; description?: string | null; durationValue?: number; durationUnit?: DurationUnit; price?: number; isActive?: boolean }
  ): ActionResult<SubscriptionPlan> {
    const current = this.getById(id)
    if (!current) return { ok: false, error: 'Plan not found' }
    const name = patch.name === undefined ? current.name : patch.name.trim()
    if (!name) return { ok: false, error: 'Plan name is required' }
    const durationValue = patch.durationValue ?? current.durationValue
    if (!Number.isInteger(durationValue) || durationValue <= 0) {
      return { ok: false, error: 'Duration must be a positive whole number' }
    }
    const durationUnit = patch.durationUnit ?? current.durationUnit
    if (!UNITS.includes(durationUnit)) return { ok: false, error: 'Invalid duration unit' }
    const price = patch.price ?? current.price
    if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'Price must be zero or more' }

    this.db.run(
      `UPDATE subscription_plans SET name = ?, description = ?, duration_value = ?, duration_unit = ?, price = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        name,
        patch.description === undefined ? current.description : patch.description?.trim() || null,
        durationValue,
        durationUnit,
        price,
        (patch.isActive ?? current.isActive) ? 1 : 0,
        new Date().toISOString(),
        id
      ]
    )
    this.audit.log('PLAN_UPDATED', 'plan', id, `Plan "${name}" updated`)
    return { ok: true, data: this.getById(id) as SubscriptionPlan }
  }

  delete(id: number): ActionResult {
    const current = this.getById(id)
    if (!current) return { ok: false, error: 'Plan not found' }
    const used = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM subscriptions WHERE plan_id = ?', [id])?.n ?? 0
    if (used > 0) {
      return { ok: false, error: `This plan is used by ${used} subscription(s). Deactivate it instead of deleting.` }
    }
    this.db.run('DELETE FROM subscription_plans WHERE id = ?', [id])
    this.audit.log('PLAN_DELETED', 'plan', id, `Plan "${current.name}" deleted`)
    return { ok: true }
  }
}
