import { normalizeUid, todayISO } from '@shared/utils'
import type {
  AccessDecision,
  AccessLog,
  AccessResult,
  AccessScanOutcome,
  ClientStatus,
  Paged,
  RfidCardStatus,
  ScanSource,
  SubscriptionStatus
} from '@shared/types'
import type { Db } from '../db/database'
import type { TurnstileController } from '../hardware/contracts'

interface AccessRow {
  id: number
  client_id: number | null
  client_name: string | null
  rfid_uid: string
  timestamp: string
  result: AccessResult
  reason: AccessLog['reason']
  subscription_id: number | null
  device_id: string | null
}

function rowToAccessLog(row: AccessRow): AccessLog {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    rfidUid: row.rfid_uid,
    timestamp: row.timestamp,
    result: row.result,
    reason: row.reason,
    subscriptionId: row.subscription_id,
    deviceId: row.device_id
  }
}

interface CardLookupRow {
  id: number
  uid: string
  client_id: number
  status: RfidCardStatus
}

interface ClientLookupRow {
  id: number
  first_name: string
  last_name: string
  status: ClientStatus
}

interface SubscriptionLookupRow {
  id: number
  status: SubscriptionStatus
  end_date: string
}

export class AccessService {
  constructor(
    private readonly db: Db,
    private readonly getTurnstile: () => TurnstileController | null,
    private readonly getDeviceId: () => string | null
  ) {}

  /**
   * Central access validation — the single source of truth for entrance decisions.
   * Runs entirely in the backend (main process); the UI never decides access.
   */
  validateAccess(rfidUid: string): AccessDecision {
    const uid = normalizeUid(rfidUid)
    if (!uid) return { allowed: false, reason: 'UNKNOWN_CARD' }

    const card = this.db.get<CardLookupRow>(
      `SELECT id, uid, client_id, status FROM rfid_cards
       WHERE uid = ?
       ORDER BY CASE WHEN status = 'REVOKED' THEN 1 ELSE 0 END, id DESC
       LIMIT 1`,
      [uid]
    )
    if (!card) return { allowed: false, reason: 'UNKNOWN_CARD' }
    if (card.status === 'REVOKED') return { allowed: false, reason: 'CARD_REVOKED' }

    const client = this.db.get<ClientLookupRow>(
      'SELECT id, first_name, last_name, status FROM clients WHERE id = ?',
      [card.client_id]
    )
    if (!client) return { allowed: false, reason: 'UNKNOWN_CARD' }

    const clientId = client.id
    const clientName = `${client.first_name} ${client.last_name}`.trim()
    const base = { clientId, clientName, cardId: card.id }

    if (card.status === 'BLOCKED') return { allowed: false, reason: 'CARD_BLOCKED', ...base }
    if (card.status === 'LOST') return { allowed: false, reason: 'CARD_LOST', ...base }
    if (client.status === 'BLOCKED') return { allowed: false, reason: 'CLIENT_BLOCKED', ...base }
    if (client.status === 'INACTIVE') return { allowed: false, reason: 'CLIENT_INACTIVE', ...base }

    const subscription = this.db.get<SubscriptionLookupRow>(
      `SELECT id, status, end_date FROM subscriptions
       WHERE client_id = ?
       ORDER BY end_date DESC, id DESC
       LIMIT 1`,
      [clientId]
    )
    if (!subscription) return { allowed: false, reason: 'NO_SUBSCRIPTION', ...base }
    if (subscription.status === 'CANCELLED') {
      return { allowed: false, reason: 'SUBSCRIPTION_CANCELLED', ...base, subscriptionId: subscription.id }
    }
    if (subscription.status === 'SUSPENDED') {
      return { allowed: false, reason: 'SUBSCRIPTION_SUSPENDED', ...base, subscriptionId: subscription.id }
    }
    if (subscription.end_date < todayISO()) {
      return {
        allowed: false,
        reason: 'SUBSCRIPTION_EXPIRED',
        ...base,
        subscriptionId: subscription.id,
        subscriptionEndDate: subscription.end_date
      }
    }
    return {
      allowed: true,
      reason: 'ACTIVE_SUBSCRIPTION',
      ...base,
      subscriptionId: subscription.id,
      subscriptionEndDate: subscription.end_date
    }
  }

  /**
   * Full entrance flow: validate → open turnstile only when allowed → always log the attempt.
   */
  async processScan(rawUid: string, source: ScanSource = 'MANUAL'): Promise<AccessScanOutcome> {
    const uid = normalizeUid(rawUid)
    const decision = this.validateAccess(uid)
    const timestamp = new Date().toISOString()
    const deviceId = this.getDeviceId()

    let turnstileOpened = false
    let turnstileError: string | undefined
    if (decision.allowed) {
      const turnstile = this.getTurnstile()
      if (!turnstile) {
        turnstileError = 'Turnstile controller is not available'
      } else {
        try {
          await turnstile.open()
          turnstileOpened = true
        } catch (error) {
          turnstileError = error instanceof Error ? error.message : 'Turnstile open command failed'
        }
      }
    }

    const logId = this.db.run(
      `INSERT INTO access_logs (client_id, client_name, rfid_uid, timestamp, result, reason, subscription_id, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        decision.clientId ?? null,
        decision.clientName ?? null,
        uid,
        timestamp,
        decision.allowed ? 'ALLOWED' : 'DENIED',
        decision.reason,
        decision.subscriptionId ?? null,
        deviceId
      ]
    ).lastInsertRowid

    return {
      decision,
      uid,
      timestamp,
      logId,
      source,
      deviceId,
      turnstileOpened,
      turnstileError
    }
  }

  logs(
    params: {
      from?: string
      to?: string
      result?: AccessResult | 'ALL'
      search?: string
      clientId?: number
      page?: number
      pageSize?: number
    } = {}
  ): Paged<AccessLog> {
    const where: string[] = []
    const args: unknown[] = []
    if (params.from) {
      where.push(`date(timestamp, 'localtime') >= ?`)
      args.push(params.from)
    }
    if (params.to) {
      where.push(`date(timestamp, 'localtime') <= ?`)
      args.push(params.to)
    }
    if (params.result && params.result !== 'ALL') {
      where.push('result = ?')
      args.push(params.result)
    }
    if (params.clientId !== undefined) {
      where.push('client_id = ?')
      args.push(params.clientId)
    }
    const search = params.search?.trim()
    if (search) {
      const q = `%${search.toLowerCase()}%`
      where.push(`(lower(IFNULL(client_name,'')) LIKE ? OR lower(rfid_uid) LIKE ?)`)
      args.push(q, q)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM access_logs ${whereSql}`, args)?.n ?? 0
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25))
    const rows = this.db.all<AccessRow>(
      `SELECT * FROM access_logs ${whereSql} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    )
    return { items: rows.map(rowToAccessLog), total }
  }

  today(): { entries: number; denied: number } {
    const row = this.db.get<{ entries: number; denied: number }>(
      `SELECT
        SUM(CASE WHEN result = 'ALLOWED' THEN 1 ELSE 0 END) AS entries,
        SUM(CASE WHEN result = 'DENIED' THEN 1 ELSE 0 END) AS denied
       FROM access_logs WHERE date(timestamp, 'localtime') = date('now', 'localtime')`
    )
    return { entries: row?.entries ?? 0, denied: row?.denied ?? 0 }
  }

  recent(limit = 20): AccessLog[] {
    const rows = this.db.all<AccessRow>(
      `SELECT * FROM access_logs ORDER BY timestamp DESC, id DESC LIMIT ?`,
      [Math.max(1, Math.min(200, limit))]
    )
    return rows.map(rowToAccessLog)
  }
}
