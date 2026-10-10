import { normalizeUid } from '@shared/utils'
import type { ActionResult, ClientStatus, RfidCard, RfidCardStatus, RfidCardWithClient } from '@shared/types'
import type { Db } from '../db/database'
import type { AuditService } from './audit.service'

interface CardRow {
  id: number
  uid: string
  card_number: string | null
  client_id: number
  status: RfidCardStatus
  issued_at: string
  revoked_at: string | null
  created_at: string
  updated_at: string
  client_first_name?: string
  client_last_name?: string
  client_status?: ClientStatus
}

function rowToCard(row: CardRow): RfidCard {
  return {
    id: row.id,
    uid: row.uid,
    cardNumber: row.card_number,
    clientId: row.client_id,
    status: row.status,
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function rowToCardWithClient(row: CardRow): RfidCardWithClient {
  return {
    ...rowToCard(row),
    clientName: `${row.client_first_name ?? ''} ${row.client_last_name ?? ''}`.trim(),
    clientStatus: row.client_status ?? 'ACTIVE'
  }
}

const CARD_SELECT = `
  SELECT c.*, cl.first_name AS client_first_name, cl.last_name AS client_last_name, cl.status AS client_status
  FROM rfid_cards c
  JOIN clients cl ON cl.id = c.client_id
`

export class RfidService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService
  ) {}

  private clientName(clientId: number): string {
    const row = this.db.get<{ first_name: string; last_name: string }>(
      'SELECT first_name, last_name FROM clients WHERE id = ?',
      [clientId]
    )
    return row ? `${row.first_name} ${row.last_name}`.trim() : `#${clientId}`
  }

  private uidOwner(uid: string, excludeCardId?: number): { cardId: number; clientId: number; name: string } | null {
    const row = this.db.get<CardRow>(
      `${CARD_SELECT} WHERE c.uid = ? AND c.status != 'REVOKED' ${excludeCardId ? 'AND c.id != ?' : ''}`,
      excludeCardId ? [uid, excludeCardId] : [uid]
    )
    if (!row) return null
    return {
      cardId: row.id,
      clientId: row.client_id,
      name: `${row.client_first_name ?? ''} ${row.client_last_name ?? ''}`.trim()
    }
  }

  private syncClientUid(clientId: number): void {
    const card = this.db.get<{ uid: string }>(
      `SELECT uid FROM rfid_cards WHERE client_id = ? AND status != 'REVOKED' ORDER BY id DESC LIMIT 1`,
      [clientId]
    )
    this.db.run('UPDATE clients SET rfid_uid = ?, updated_at = ? WHERE id = ?', [
      card?.uid ?? null,
      new Date().toISOString(),
      clientId
    ])
  }

  list(params: { status?: RfidCardStatus | 'ALL'; search?: string } = {}): RfidCardWithClient[] {
    const where: string[] = []
    const args: unknown[] = []
    if (params.status && params.status !== 'ALL') {
      where.push('c.status = ?')
      args.push(params.status)
    }
    const search = params.search?.trim()
    if (search) {
      const q = `%${search.toLowerCase()}%`
      where.push(`(lower(c.uid) LIKE ? OR lower(IFNULL(c.card_number,'')) LIKE ? OR lower(cl.first_name || ' ' || cl.last_name) LIKE ?)`)
      args.push(q, q, q)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = this.db.all<CardRow>(
      `${CARD_SELECT} ${whereSql} ORDER BY CASE c.status WHEN 'ACTIVE' THEN 0 WHEN 'BLOCKED' THEN 1 WHEN 'LOST' THEN 2 ELSE 3 END, c.id DESC`,
      args
    )
    return rows.map(rowToCardWithClient)
  }

  findByUid(rawUid: string): RfidCardWithClient | null {
    const uid = normalizeUid(rawUid)
    if (!uid) return null
    const row = this.db.get<CardRow>(`${CARD_SELECT} WHERE c.uid = ? AND c.status != 'REVOKED' LIMIT 1`, [uid])
    return row ? rowToCardWithClient(row) : null
  }

  getCard(id: number): RfidCardWithClient | null {
    const row = this.db.get<CardRow>(`${CARD_SELECT} WHERE c.id = ?`, [id])
    return row ? rowToCardWithClient(row) : null
  }

  getLiveCardForClient(clientId: number): RfidCardWithClient | null {
    const row = this.db.get<CardRow>(
      `${CARD_SELECT} WHERE c.client_id = ? AND c.status != 'REVOKED' ORDER BY c.id DESC LIMIT 1`,
      [clientId]
    )
    return row ? rowToCardWithClient(row) : null
  }

  getCardsForClient(clientId: number): RfidCard[] {
    return this.db
      .all<CardRow>('SELECT * FROM rfid_cards WHERE client_id = ? ORDER BY id DESC', [clientId])
      .map(rowToCard)
  }

  assign(input: { clientId: number; uid: string; cardNumber?: string | null }): ActionResult<RfidCardWithClient> {
    const client = this.db.get<{ id: number; first_name: string; last_name: string }>(
      'SELECT id, first_name, last_name FROM clients WHERE id = ?',
      [input.clientId]
    )
    if (!client) return { ok: false, error: 'Client not found' }
    const uid = normalizeUid(input.uid)
    if (!uid) return { ok: false, error: 'RFID UID is required' }

    const existingCard = this.getLiveCardForClient(input.clientId)
    if (existingCard) {
      return {
        ok: false,
        error: `${this.clientName(input.clientId)} already has RFID card ${existingCard.uid}. Use "Replace card" instead.`
      }
    }
    const owner = this.uidOwner(uid)
    if (owner) {
      return { ok: false, error: `RFID UID ${uid} is already assigned to ${owner.name}` }
    }

    const now = new Date().toISOString()
    const result = this.db.run(
      `INSERT INTO rfid_cards (uid, card_number, client_id, status, issued_at, created_at, updated_at)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)`,
      [uid, input.cardNumber?.trim() || null, input.clientId, now, now, now]
    )
    this.syncClientUid(input.clientId)
    const name = `${client.first_name} ${client.last_name}`.trim()
    this.audit.log('RFID_ASSIGNED', 'rfid', result.lastInsertRowid, `RFID card ${uid} assigned to ${name}`)
    return { ok: true, data: this.getCard(result.lastInsertRowid) as RfidCardWithClient }
  }

  replace(input: { clientId: number; newUid: string; cardNumber?: string | null }): ActionResult<RfidCardWithClient> {
    const uid = normalizeUid(input.newUid)
    if (!uid) return { ok: false, error: 'RFID UID is required' }

    const existingCard = this.getLiveCardForClient(input.clientId)
    if (!existingCard) {
      return { ok: false, error: 'This client has no card to replace. Use "Assign card" instead.' }
    }
    if (existingCard.uid === uid) {
      return { ok: false, error: 'The new card has the same UID as the current card' }
    }
    const owner = this.uidOwner(uid)
    if (owner) {
      return { ok: false, error: `RFID UID ${uid} is already assigned to ${owner.name}` }
    }

    try {
      this.db.tx(() => {
        const now = new Date().toISOString()
        this.db.run(`UPDATE rfid_cards SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE id = ?`, [
          now,
          now,
          existingCard.id
        ])
        this.db.run(
          `INSERT INTO rfid_cards (uid, card_number, client_id, status, issued_at, created_at, updated_at)
           VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?)`,
          [uid, input.cardNumber?.trim() || null, input.clientId, now, now, now]
        )
      })
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to replace card' }
    }

    this.syncClientUid(input.clientId)
    const name = this.clientName(input.clientId)
    this.audit.log(
      'RFID_REPLACED',
      'rfid',
      input.clientId,
      `RFID card ${existingCard.uid} replaced with ${uid} for ${name}`
    )
    return { ok: true, data: this.getLiveCardForClient(input.clientId) as RfidCardWithClient }
  }

  block(cardId: number): ActionResult {
    return this.setStatus(cardId, 'BLOCKED', ['ACTIVE', 'LOST'], 'RFID_BLOCKED')
  }

  unblock(cardId: number): ActionResult {
    return this.setStatus(cardId, 'ACTIVE', ['BLOCKED'], 'RFID_UNBLOCKED')
  }

  markLost(cardId: number): ActionResult {
    return this.setStatus(cardId, 'LOST', ['ACTIVE'], 'RFID_MARKED_LOST')
  }

  revoke(cardId: number): ActionResult {
    const card = this.getCard(cardId)
    if (!card) return { ok: false, error: 'RFID card not found' }
    if (card.status === 'REVOKED') return { ok: false, error: 'This card is already revoked' }
    const now = new Date().toISOString()
    this.db.run(`UPDATE rfid_cards SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE id = ?`, [
      now,
      now,
      cardId
    ])
    this.syncClientUid(card.clientId)
    this.audit.log('RFID_REVOKED', 'rfid', cardId, `RFID card ${card.uid} of ${card.clientName} revoked`)
    return { ok: true }
  }

  private setStatus(
    cardId: number,
    next: RfidCardStatus,
    allowedFrom: RfidCardStatus[],
    auditAction: string
  ): ActionResult {
    const card = this.getCard(cardId)
    if (!card) return { ok: false, error: 'RFID card not found' }
    if (!allowedFrom.includes(card.status)) {
      return { ok: false, error: `Cannot change a ${card.status} card to ${next}` }
    }
    this.db.run('UPDATE rfid_cards SET status = ?, updated_at = ? WHERE id = ?', [next, new Date().toISOString(), cardId])
    this.syncClientUid(card.clientId)
    const verb = next === 'BLOCKED' ? 'blocked' : next === 'ACTIVE' ? 'unblocked' : 'marked lost'
    this.audit.log(auditAction, 'rfid', cardId, `RFID card ${card.uid} of ${card.clientName} ${verb}`)
    return { ok: true }
  }
}
