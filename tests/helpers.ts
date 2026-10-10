import { Db } from '@main/db/database'
import { migrate } from '@main/db/schema'
import type { ClientStatus, RfidCardStatus, SubscriptionStatus } from '@shared/types'
import { addDuration, todayISO } from '@shared/utils'

export function createTestDb(): Db {
  const db = new Db(':memory:')
  migrate(db)
  return db
}

let uidCounter = 0

export function uniqueUid(): string {
  uidCounter += 1
  return `AABBCCDD${uidCounter.toString(16).toUpperCase().padStart(2, '0')}`
}

export function createClient(
  db: Db,
  overrides: Partial<{ firstName: string; lastName: string; status: ClientStatus }> = {}
): number {
  const now = new Date().toISOString()
  const result = db.run(
    `INSERT INTO clients (first_name, last_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [overrides.firstName ?? 'Test', overrides.lastName ?? 'Client', overrides.status ?? 'ACTIVE', now, now]
  )
  return result.lastInsertRowid
}

export function createCard(
  db: Db,
  clientId: number,
  overrides: Partial<{ uid: string; status: RfidCardStatus }> = {}
): { id: number; uid: string } {
  const now = new Date().toISOString()
  const uid = overrides.uid ?? uniqueUid()
  const result = db.run(
    `INSERT INTO rfid_cards (uid, card_number, client_id, status, issued_at, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    [uid, clientId, overrides.status ?? 'ACTIVE', now, now, now]
  )
  return { id: result.lastInsertRowid, uid }
}

export function createSubscription(
  db: Db,
  clientId: number,
  overrides: Partial<{ planId: number; startDate: string; endDate: string; status: SubscriptionStatus }> = {}
): number {
  const now = new Date().toISOString()
  const startDate = overrides.startDate ?? addDuration(todayISO(), -30, 'DAYS')
  const endDate = overrides.endDate ?? addDuration(todayISO(), 30, 'DAYS')
  const result = db.run(
    `INSERT INTO subscriptions (client_id, plan_id, start_date, end_date, status, price, payment_status, is_renewal, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 'UNPAID', 0, ?, ?)`,
    [clientId, overrides.planId ?? planIdByName(db, '17 Sessions / Month'), startDate, endDate, overrides.status ?? 'ACTIVE', now, now]
  )
  return result.lastInsertRowid
}

export function planIdByName(db: Db, name: string): number {
  const row = db.get<{ id: number }>('SELECT id FROM subscription_plans WHERE name = ?', [name])
  if (!row) throw new Error(`Seed plan not found: ${name}`)
  return row.id
}
