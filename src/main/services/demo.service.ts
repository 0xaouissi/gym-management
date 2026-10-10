import { subDays } from 'date-fns'
import type {
  AccessReason,
  ActionResult,
  ClientStatus,
  DurationUnit,
  PaymentMethod,
  RfidCardStatus
} from '@shared/types'
import { addDuration, todayISO } from '@shared/utils'
import type { Db } from '../db/database'
import type { AuditService } from './audit.service'
import { recalcSubscriptionPaymentStatus } from './payments.service'

export interface DemoResult {
  clients: number
  subscriptions: number
  payments: number
  logs: number
}

interface PlanRow {
  id: number
  name: string
  duration_value: number
  duration_unit: DurationUnit
  price: number
}

interface PoolEntry {
  clientId: number
  clientName: string
  uid: string
  state: 'OK' | DenyState
  subscriptionId: number | null
}

type DenyState =
  | 'CARD_BLOCKED'
  | 'CARD_LOST'
  | 'CARD_REVOKED'
  | 'CLIENT_BLOCKED'
  | 'CLIENT_INACTIVE'
  | 'NO_SUBSCRIPTION'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'SUBSCRIPTION_CANCELLED'

const FIRST_NAMES = [
  'Ahmed', 'Mohamed', 'Yacine', 'Amine', 'Sofiane', 'Karim', 'Riad', 'Bilal', 'Nadir', 'Omar',
  'Amina', 'Lina', 'Sara', 'Nadia', 'Meriem', 'Yasmine', 'Imene', 'Rania', 'Khadija', 'Lamia',
  'Ilyes', 'Walid', 'Samir', 'Anis', 'Fares', 'Nour', 'Hiba', 'Salim'
]

const LAST_NAMES = [
  'Benali', 'Boudiaf', 'Mansouri', 'Haddad', 'Cherif', 'Belkacem', 'Zerrouki', 'Bensalem',
  'Bouzid', 'Kaddour', 'Meziane', 'Hamadi', 'Taleb', 'Rahmani', 'Djebbar', 'Saadi'
]

const PLAN_WEIGHTS = [0.3, 0.4, 0.3]

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)]
}

function randomUid(rng: () => number): string {
  const hex = '0123456789ABCDEF'
  let uid = ''
  for (let i = 0; i < 8; i++) uid += hex[Math.floor(rng() * 16)]
  return uid
}

export class DemoService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService
  ) {}

  generate(): ActionResult<DemoResult> {
    const existing = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM clients')?.n ?? 0
    if (existing > 0) {
      return { ok: false, error: 'Demo data can only be generated on an empty database (clients already exist)' }
    }
    const plans = this.db.all<PlanRow>(
      'SELECT id, name, duration_value, duration_unit, price FROM subscription_plans WHERE is_active = 1 ORDER BY duration_value'
    )
    if (!plans.length) return { ok: false, error: 'No active subscription plans found' }

    const rng = mulberry32(20261001)
    const result = this.db.tx(() => this.seed(rng, plans))
    this.audit.log(
      'DEMO_DATA_GENERATED',
      'system',
      null,
      `Demo data generated: ${result.clients} clients, ${result.subscriptions} subscriptions, ${result.payments} payments, ${result.logs} access logs`
    )
    return { ok: true, data: result }
  }

  private seed(rng: () => number, plans: PlanRow[]): DemoResult {
    const now = new Date().toISOString()
    const today = todayISO()
    const pool: PoolEntry[] = []
    let subscriptions = 0
    let payments = 0

    for (let i = 0; i < FIRST_NAMES.length; i++) {
      const firstName = FIRST_NAMES[i]
      const lastName = LAST_NAMES[i % LAST_NAMES.length]
      const fullName = `${firstName} ${lastName}`
      const status: ClientStatus = i % 15 === 14 ? 'BLOCKED' : i % 9 === 8 ? 'INACTIVE' : 'ACTIVE'
      const phone = `05${Math.floor(rng() * 90000000 + 10000000)}`
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i + 1}@example.com`
      const clientId = this.db.run(
        `INSERT INTO clients (first_name, last_name, phone, email, date_of_birth, address, photo, notes, rfid_uid, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
        [firstName, lastName, phone, email, status, now, now]
      ).lastInsertRowid

      const hasCard = i !== 2 && i !== 21
      let uid: string | null = null
      let cardStatus: RfidCardStatus | null = null
      if (hasCard) {
        uid = randomUid(rng)
        cardStatus = i === 7 ? 'BLOCKED' : i === 18 ? 'LOST' : i === 26 ? 'REVOKED' : 'ACTIVE'
        const issuedAt = new Date(Date.now() - Math.floor(rng() * 200 + 10) * 86400000).toISOString()
        this.db.run(
          `INSERT INTO rfid_cards (uid, card_number, client_id, status, issued_at, revoked_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            uid,
            `CARD-${String(i + 1).padStart(4, '0')}`,
            clientId,
            cardStatus,
            issuedAt,
            cardStatus === 'REVOKED' ? now : null,
            now,
            now
          ]
        )
        if (cardStatus !== 'REVOKED') {
          this.db.run('UPDATE clients SET rfid_uid = ? WHERE id = ?', [uid, clientId])
        }
      }

      let latestSubId: number | null = null
      let latestSubEnd: string | null = null
      let latestSubStatus: string | null = null

      if (i % 11 !== 5) {
        const plan = this.pickPlan(rng, plans)
        const roll = rng()
        let endDate: string
        let state = 'ACTIVE'
        if (roll < 0.55) {
          endDate = addDuration(today, Math.floor(rng() * 45) + 1, 'DAYS')
        } else if (roll < 0.85) {
          endDate = addDuration(today, -(Math.floor(rng() * 75) + 1), 'DAYS')
          state = 'EXPIRED'
        } else if (roll < 0.93) {
          endDate = addDuration(today, Math.floor(rng() * 30) + 5, 'DAYS')
          state = 'SUSPENDED'
        } else {
          endDate = addDuration(today, Math.floor(rng() * 30) + 5, 'DAYS')
          state = 'CANCELLED'
        }
        const startDate = addDuration(endDate, -plan.duration_value, plan.duration_unit)

        if (rng() < 0.45) {
          const prevEnd = addDuration(startDate, -1, 'DAYS')
          const prevStart = addDuration(prevEnd, -plan.duration_value, plan.duration_unit)
          this.db.run(
            `INSERT INTO subscriptions (client_id, plan_id, start_date, end_date, status, price, payment_status, is_renewal, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'EXPIRED', ?, 'PAID', 0, ?, ?, ?)`,
            [clientId, plan.id, prevStart, prevEnd, plan.price, 'Previous subscription', now, now]
          )
          subscriptions += 1
        }

        latestSubId = this.db.run(
          `INSERT INTO subscriptions (client_id, plan_id, start_date, end_date, status, price, payment_status, is_renewal, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'UNPAID', ?, NULL, ?, ?)`,
          [clientId, plan.id, startDate, endDate, state, plan.price, rng() < 0.45 ? 1 : 0, now, now]
        ).lastInsertRowid
        subscriptions += 1
        latestSubEnd = endDate
        latestSubStatus = state

        if (state !== 'CANCELLED') {
          const payRoll = rng()
          if (payRoll < 0.62) {
            payments += this.insertPayment(clientId, latestSubId, plan.price, startDate, rng)
          } else if (payRoll < 0.8) {
            payments += this.insertPayment(clientId, latestSubId, Math.round((plan.price * 0.4) / 50) * 50, startDate, rng)
          }
          recalcSubscriptionPaymentStatus(this.db, latestSubId)
        }
      }

      if (uid) {
        const state: PoolEntry['state'] = this.resolveState(status, cardStatus, latestSubStatus, latestSubEnd, today)
        pool.push({
          clientId,
          clientName: fullName,
          uid,
          state,
          subscriptionId: state === 'OK' ? latestSubId : null
        })
      }
    }

    const logs = this.seedAccessLogs(rng, pool)
    return { clients: FIRST_NAMES.length, subscriptions, payments, logs }
  }

  private pickPlan(rng: () => number, plans: PlanRow[]): PlanRow {
    if (plans.length !== PLAN_WEIGHTS.length) return pick(rng, plans)
    let r = rng()
    for (let i = 0; i < plans.length; i++) {
      r -= PLAN_WEIGHTS[i]
      if (r <= 0) return plans[i]
    }
    return plans[plans.length - 1]
  }

  private insertPayment(
    clientId: number,
    subscriptionId: number,
    amount: number,
    date: string,
    rng: () => number
  ): number {
    const roll = rng()
    const method: PaymentMethod = roll < 0.62 ? 'CASH' : roll < 0.82 ? 'CARD' : roll < 0.95 ? 'BANK_TRANSFER' : 'OTHER'
    this.db.run(
      `INSERT INTO payments (client_id, subscription_id, amount, payment_date, payment_method, reference, notes, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?)`,
      [clientId, subscriptionId, amount, date, method, new Date().toISOString()]
    )
    return 1
  }

  private resolveState(
    clientStatus: ClientStatus,
    cardStatus: RfidCardStatus | null,
    subStatus: string | null,
    subEnd: string | null,
    today: string
  ): PoolEntry['state'] {
    if (cardStatus === null) return 'NO_SUBSCRIPTION'
    if (cardStatus === 'REVOKED') return 'CARD_REVOKED'
    if (cardStatus === 'BLOCKED') return 'CARD_BLOCKED'
    if (cardStatus === 'LOST') return 'CARD_LOST'
    if (clientStatus === 'BLOCKED') return 'CLIENT_BLOCKED'
    if (clientStatus === 'INACTIVE') return 'CLIENT_INACTIVE'
    if (!subStatus || !subEnd) return 'NO_SUBSCRIPTION'
    if (subStatus === 'SUSPENDED') return 'SUBSCRIPTION_SUSPENDED'
    if (subStatus === 'CANCELLED') return 'SUBSCRIPTION_CANCELLED'
    if (subEnd < today) return 'SUBSCRIPTION_EXPIRED'
    return 'OK'
  }

  private seedAccessLogs(rng: () => number, pool: PoolEntry[]): number {
    const total = 160
    let inserted = 0
    for (let i = 0; i < total; i++) {
      const entry = pick(rng, pool)
      const dayOffset = Math.floor(rng() * 30)
      const stamp = subDays(new Date(), dayOffset)
      stamp.setHours(6 + Math.floor(rng() * 16), Math.floor(rng() * 60), Math.floor(rng() * 60), 0)

      let result: 'ALLOWED' | 'DENIED'
      let reason: AccessReason
      let uid = entry.uid
      let clientId: number | null = entry.clientId
      let clientName: string | null = entry.clientName
      let subscriptionId: number | null = null

      if (entry.state === 'OK' && rng() < 0.9) {
        result = 'ALLOWED'
        reason = 'ACTIVE_SUBSCRIPTION'
        subscriptionId = entry.subscriptionId
      } else if (rng() < 0.08) {
        result = 'DENIED'
        reason = 'UNKNOWN_CARD'
        uid = randomUid(rng)
        clientId = null
        clientName = null
      } else {
        result = 'DENIED'
        reason = entry.state === 'OK' ? 'SUBSCRIPTION_EXPIRED' : entry.state
      }

      this.db.run(
        `INSERT INTO access_logs (client_id, client_name, rfid_uid, timestamp, result, reason, subscription_id, device_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [clientId, clientName, uid, stamp.toISOString(), result, reason, subscriptionId, 'DEMO']
      )
      inserted += 1
    }
    return inserted
  }
}
