import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/database'
import { AuditService } from '@main/services/audit.service'
import { PlansService } from '@main/services/plans.service'
import { SettingsService } from '@main/services/settings.service'
import { SubscriptionsService } from '@main/services/subscriptions.service'
import { addDuration, todayISO } from '@shared/utils'
import { createClient, createSubscription, createTestDb, planIdByName } from './helpers'

function setup(): { db: Db; subs: SubscriptionsService; weekPlanId: number; clientId: number } {
  const db = createTestDb()
  const audit = new AuditService(db, () => null)
  const plans = new PlansService(db, audit)
  const subs = new SubscriptionsService(db, audit, plans, new SettingsService(db))
  const plan = plans.create({ name: '1 Week', durationValue: 1, durationUnit: 'WEEKS', price: 700 })
  if (!plan.ok || !plan.data) throw new Error(plan.error ?? 'Plan creation failed')
  return { db, subs, weekPlanId: plan.data.id, clientId: createClient(db) }
}

describe('SubscriptionsService renewals', () => {
  let db: Db
  let subs: SubscriptionsService
  let weekPlanId: number
  let clientId: number

  beforeEach(() => {
    ;({ db, subs, weekPlanId, clientId } = setup())
  })

  it('extends an active subscription from its current end date', () => {
    const endDate = addDuration(todayISO(), 10, 'DAYS')
    const subscriptionId = createSubscription(db, clientId, {
      planId: weekPlanId,
      endDate,
      status: 'ACTIVE'
    })

    const result = subs.renew({ subscriptionId })
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Renewal failed')

    expect(result.data.startDate).toBe(endDate)
    expect(result.data.endDate).toBe(addDuration(endDate, 7, 'DAYS'))
    expect(result.data.status).toBe('ACTIVE')

    const row = db.get<{ is_renewal: number }>('SELECT is_renewal FROM subscriptions WHERE id = ?', [
      result.data.id
    ])
    expect(row?.is_renewal).toBe(1)
  })

  it('restarts an expired subscription from today', () => {
    const subscriptionId = createSubscription(db, clientId, {
      planId: weekPlanId,
      endDate: addDuration(todayISO(), -5, 'DAYS'),
      status: 'EXPIRED'
    })

    const result = subs.renew({ subscriptionId })
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Renewal failed')

    expect(result.data.startDate).toBe(todayISO())
    expect(result.data.endDate).toBe(addDuration(todayISO(), 7, 'DAYS'))
  })

  it('renews from the client\u2019s latest subscription even when an older one is given', () => {
    const latestEnd = addDuration(todayISO(), 10, 'DAYS')
    createSubscription(db, clientId, {
      planId: weekPlanId,
      endDate: addDuration(todayISO(), -20, 'DAYS'),
      status: 'EXPIRED'
    })
    createSubscription(db, clientId, { planId: weekPlanId, endDate: latestEnd, status: 'ACTIVE' })
    const olderId = db.get<{ id: number }>(
      'SELECT id FROM subscriptions WHERE client_id = ? ORDER BY end_date ASC LIMIT 1',
      [clientId]
    )
    if (!olderId) throw new Error('Older subscription not found')

    const result = subs.renew({ subscriptionId: olderId.id })
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Renewal failed')

    expect(result.data.startDate).toBe(latestEnd)
    expect(result.data.endDate).toBe(addDuration(latestEnd, 7, 'DAYS'))
  })

  it('records an audit entry for the renewal', () => {
    const subscriptionId = createSubscription(db, clientId, { planId: weekPlanId })
    const result = subs.renew({ subscriptionId })
    if (!result.ok) throw new Error(result.error)

    const auditRow = db.get<{ action: string; username: string }>(
      `SELECT action, username FROM audit_logs WHERE action = 'SUBSCRIPTION_RENEWED' ORDER BY id DESC LIMIT 1`
    )
    expect(auditRow).toEqual({ action: 'SUBSCRIPTION_RENEWED', username: 'SYSTEM' })
  })

  it('rejects renewing an unknown subscription', () => {
    const result = subs.renew({ subscriptionId: 9999 })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Subscription not found')
  })
})

describe('SubscriptionsService expiry maintenance', () => {
  let db: Db
  let subs: SubscriptionsService
  let weekPlanId: number
  let clientId: number

  beforeEach(() => {
    ;({ db, subs, weekPlanId, clientId } = setup())
  })

  it('creates a subscription as EXPIRED when its period is already over', () => {
    const result = subs.create({
      clientId,
      planId: weekPlanId,
      startDate: addDuration(todayISO(), -30, 'DAYS')
    })
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Create failed')
    expect(result.data.status).toBe('EXPIRED')
  })

  it('extends an expired subscription counting from today', () => {
    const subscriptionId = createSubscription(db, clientId, {
      planId: weekPlanId,
      endDate: addDuration(todayISO(), -4, 'DAYS'),
      status: 'EXPIRED'
    })

    const result = subs.extend(subscriptionId, 10)
    if (!result.ok) throw new Error(result.error)

    const row = db.get<{ end_date: string; status: string }>(
      'SELECT end_date, status FROM subscriptions WHERE id = ?',
      [subscriptionId]
    )
    expect(row?.end_date).toBe(addDuration(todayISO(), 10, 'DAYS'))
    expect(row?.status).toBe('ACTIVE')
  })

  it('sweeps past-due ACTIVE subscriptions into EXPIRED', () => {
    createSubscription(db, clientId, {
      planId: weekPlanId,
      endDate: addDuration(todayISO(), -1, 'DAYS'),
      status: 'ACTIVE'
    })
    createSubscription(db, clientId, { planId: weekPlanId, endDate: addDuration(todayISO(), 3, 'DAYS') })
    expect(subs.expireDueSubscriptions()).toBe(1)
  })
})

describe('SubscriptionsService multi-month periods', () => {
  let db: Db
  let subs: SubscriptionsService
  let plan22Id: number
  let clientId: number

  beforeEach(() => {
    db = createTestDb()
    const audit = new AuditService(db, () => null)
    subs = new SubscriptionsService(db, audit, new PlansService(db, audit), new SettingsService(db))
    plan22Id = planIdByName(db, '22 Sessions / Month')
    clientId = createClient(db)
  })

  it('creates a multi-month subscription ending months later at the multiplied price', () => {
    const result = subs.create({ clientId, planId: plan22Id, startDate: '2026-03-01', months: 3 })
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Create failed')
    expect(result.data.endDate).toBe('2026-06-01')
    expect(result.data.price).toBe(6600)
  })

  it('defaults to a single month when months is omitted or invalid', () => {
    const omitted = subs.create({ clientId, planId: plan22Id, startDate: '2026-03-01' })
    if (!omitted.ok || !omitted.data) throw new Error(omitted.error ?? 'Create failed')
    expect(omitted.data.endDate).toBe('2026-04-01')
    expect(omitted.data.price).toBe(2200)

    const zero = subs.create({ clientId, planId: plan22Id, startDate: '2026-03-01', months: 0 })
    if (!zero.ok || !zero.data) throw new Error(zero.error ?? 'Create failed')
    expect(zero.data.endDate).toBe('2026-04-01')
  })

  it('keeps an explicitly provided price instead of multiplying', () => {
    const result = subs.create({ clientId, planId: plan22Id, startDate: '2026-03-01', months: 3, price: 5000 })
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Create failed')
    expect(result.data.price).toBe(5000)
    expect(result.data.endDate).toBe('2026-06-01')
  })

  it('renews for several months stacking from the latest live end date', () => {
    const baseEnd = addDuration(todayISO(), 15, 'DAYS')
    const baseId = createSubscription(db, clientId, { planId: plan22Id, endDate: baseEnd, status: 'ACTIVE' })

    const result = subs.renew({ subscriptionId: baseId, planId: plan22Id, months: 2 })
    if (!result.ok || !result.data) throw new Error(result.error ?? 'Renewal failed')

    expect(result.data.startDate).toBe(baseEnd)
    expect(result.data.endDate).toBe(addDuration(baseEnd, 2, 'MONTHS'))
    expect(result.data.price).toBe(4400)
  })
})
