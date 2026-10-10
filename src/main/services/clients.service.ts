import { addDuration, normalizeUid, todayISO } from '@shared/utils'
import type {
  AccessLog,
  ActionResult,
  Client,
  ClientDetail,
  ClientListItem,
  ClientStatus,
  Paged,
  PaymentWithDetails,
  SubscriptionWithDetails
} from '@shared/types'
import type { Db } from '../db/database'
import type { AuditService } from './audit.service'
import { mapSubscriptionRow, type SubscriptionDetailRow } from './mappers'
import type { RfidService } from './rfid.service'
import type { SettingsService } from './settings.service'

const CLIENT_STATUSES: ClientStatus[] = ['ACTIVE', 'INACTIVE', 'BLOCKED']

interface ClientRow {
  id: number
  first_name: string
  last_name: string
  phone: string | null
  email: string | null
  date_of_birth: string | null
  address: string | null
  photo: string | null
  notes: string | null
  rfid_uid: string | null
  status: ClientStatus
  created_at: string
  updated_at: string
}

interface ClientListRow extends ClientRow {
  sub_id: number | null
  sub_client_id: number | null
  sub_plan_id: number | null
  sub_start_date: string | null
  sub_end_date: string | null
  sub_status: SubscriptionDetailRow['status'] | null
  sub_price: number | null
  sub_payment_status: SubscriptionDetailRow['payment_status'] | null
  sub_is_renewal: number | null
  sub_notes: string | null
  sub_created_at: string | null
  sub_updated_at: string | null
  plan_name: string | null
  plan_duration_value: number | null
  plan_duration_unit: SubscriptionDetailRow['plan_duration_unit'] | null
  paid_amount: number
}

function rowToClient(row: ClientRow): Client {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    dateOfBirth: row.date_of_birth,
    address: row.address,
    photo: row.photo,
    notes: row.notes,
    rfidUid: row.rfid_uid,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const LATEST_LIVE_SUB = `(SELECT s2.id FROM subscriptions s2 WHERE s2.client_id = c.id AND s2.status != 'CANCELLED' ORDER BY s2.end_date DESC, s2.id DESC LIMIT 1)`

const LIST_COLUMNS = `
  c.*,
  s.id AS sub_id, s.client_id AS sub_client_id, s.plan_id AS sub_plan_id,
  s.start_date AS sub_start_date, s.end_date AS sub_end_date, s.status AS sub_status,
  s.price AS sub_price, s.payment_status AS sub_payment_status, s.is_renewal AS sub_is_renewal,
  s.notes AS sub_notes, s.created_at AS sub_created_at, s.updated_at AS sub_updated_at,
  p.name AS plan_name, p.duration_value AS plan_duration_value, p.duration_unit AS plan_duration_unit,
  IFNULL((SELECT SUM(pm.amount) FROM payments pm WHERE pm.subscription_id = s.id), 0) AS paid_amount
`

const LIST_FROM = `
  FROM clients c
  LEFT JOIN subscriptions s ON s.id = ${LATEST_LIVE_SUB}
  LEFT JOIN subscription_plans p ON p.id = s.plan_id
`

export class ClientsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly rfid: RfidService,
    private readonly settings: SettingsService
  ) {}

  private toListItem(row: ClientListRow): ClientListItem {
    const client = rowToClient(row)
    const currentSubscription =
      row.sub_id !== null
        ? mapSubscriptionRow(
            {
              id: row.sub_id,
              client_id: row.sub_client_id as number,
              plan_id: row.sub_plan_id as number,
              start_date: row.sub_start_date as string,
              end_date: row.sub_end_date as string,
              status: row.sub_status as SubscriptionDetailRow['status'],
              price: row.sub_price as number,
              payment_status: row.sub_payment_status as SubscriptionDetailRow['payment_status'],
              is_renewal: row.sub_is_renewal as number,
              notes: row.sub_notes,
              created_at: row.sub_created_at as string,
              updated_at: row.sub_updated_at as string,
              plan_name: row.plan_name as string,
              plan_duration_value: row.plan_duration_value as number,
              plan_duration_unit: row.plan_duration_unit as SubscriptionDetailRow['plan_duration_unit'],
              paid_amount: row.paid_amount
            },
            `${row.first_name} ${row.last_name}`.trim()
          )
        : null
    return { ...client, currentSubscription }
  }

  private buildFilters(params: {
    search?: string
    status?: ClientStatus | 'ALL'
    subscriptionFilter?: 'ALL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NONE' | 'SUSPENDED'
  }): { whereSql: string; args: unknown[] } {
    const where: string[] = []
    const args: unknown[] = []
    const search = params.search?.trim()
    if (search) {
      const q = `%${search.toLowerCase()}%`
      where.push(
        `(lower(c.first_name || ' ' || c.last_name) LIKE ? OR lower(c.last_name || ' ' || c.first_name) LIKE ?
          OR lower(IFNULL(c.phone,'')) LIKE ? OR lower(IFNULL(c.email,'')) LIKE ?
          OR lower(IFNULL(c.rfid_uid,'')) LIKE ? OR CAST(c.id AS TEXT) = ?)`
      )
      args.push(q, q, q, q, q, search)
    }
    if (params.status && params.status !== 'ALL') {
      where.push('c.status = ?')
      args.push(params.status)
    }
    const today = todayISO()
    switch (params.subscriptionFilter) {
      case 'ACTIVE':
        where.push(`s.id IS NOT NULL AND s.status = 'ACTIVE' AND s.end_date >= ?`)
        args.push(today)
        break
      case 'EXPIRING': {
        const warnDays = this.settings.get().expirationWarningDays
        const limitIso = addDuration(today, warnDays, 'DAYS')
        where.push(`s.id IS NOT NULL AND s.status = 'ACTIVE' AND s.end_date >= ? AND s.end_date <= ?`)
        args.push(today, limitIso)
        break
      }
      case 'EXPIRED':
        where.push(`s.id IS NOT NULL AND s.status != 'SUSPENDED' AND s.end_date < ?`)
        args.push(today)
        break
      case 'SUSPENDED':
        where.push(`s.id IS NOT NULL AND s.status = 'SUSPENDED'`)
        break
      case 'NONE':
        where.push('s.id IS NULL')
        break
      default:
        break
    }
    return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', args }
  }

  list(params: {
    search?: string
    status?: ClientStatus | 'ALL'
    subscriptionFilter?: 'ALL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NONE' | 'SUSPENDED'
    page?: number
    pageSize?: number
  } = {}): Paged<ClientListItem> {
    const { whereSql, args } = this.buildFilters(params)
    const total =
      this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM clients c LEFT JOIN subscriptions s ON s.id = ${LATEST_LIVE_SUB} ${whereSql}`, args)?.n ?? 0
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 25))
    const rows = this.db.all<ClientListRow>(
      `SELECT ${LIST_COLUMNS} ${LIST_FROM} ${whereSql} ORDER BY c.last_name, c.first_name LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    )
    return { items: rows.map((row) => this.toListItem(row)), total }
  }

  globalSearch(query: string, limit = 8): ClientListItem[] {
    const trimmed = query.trim()
    if (!trimmed) return []
    const { whereSql, args } = this.buildFilters({ search: trimmed })
    const rows = this.db.all<ClientListRow>(
      `SELECT ${LIST_COLUMNS} ${LIST_FROM} ${whereSql} ORDER BY c.last_name, c.first_name LIMIT ?`,
      [...args, limit]
    )
    return rows.map((row) => this.toListItem(row))
  }

  getRaw(id: number): Client | null {
    const row = this.db.get<ClientRow>('SELECT * FROM clients WHERE id = ?', [id])
    return row ? rowToClient(row) : null
  }

  private getSubscriptionsWithDetails(clientId: number): SubscriptionWithDetails[] {
    const rows = this.db.all<SubscriptionDetailRow>(
      `SELECT s.*, p.name AS plan_name, p.duration_value AS plan_duration_value, p.duration_unit AS plan_duration_unit,
        cl.first_name || ' ' || cl.last_name AS client_name,
        IFNULL((SELECT SUM(pm.amount) FROM payments pm WHERE pm.subscription_id = s.id), 0) AS paid_amount
       FROM subscriptions s
       JOIN subscription_plans p ON p.id = s.plan_id
       JOIN clients cl ON cl.id = s.client_id
       WHERE s.client_id = ?
       ORDER BY s.end_date DESC, s.id DESC`,
      [clientId]
    )
    return rows.map((row) => mapSubscriptionRow(row))
  }

  get(id: number): ClientDetail | null {
    const client = this.getRaw(id)
    if (!client) return null
    const name = `${client.firstName} ${client.lastName}`.trim()
    const rfidCards = this.rfid.getCardsForClient(id)
    const rfidCard = rfidCards.find((card) => card.status !== 'REVOKED') ?? null
    const subscriptions = this.getSubscriptionsWithDetails(id)
    const currentSubscription = subscriptions.find((sub) => sub.status !== 'CANCELLED') ?? null

    const payments = this.db
      .all<{
        id: number
        client_id: number
        subscription_id: number | null
        amount: number
        payment_date: string
        payment_method: PaymentWithDetails['paymentMethod']
        reference: string | null
        notes: string | null
        created_at: string
        plan_name: string | null
      }>(
        `SELECT pm.*, p.name AS plan_name
         FROM payments pm
         LEFT JOIN subscriptions s ON s.id = pm.subscription_id
         LEFT JOIN subscription_plans p ON p.id = s.plan_id
         WHERE pm.client_id = ?
         ORDER BY pm.payment_date DESC, pm.id DESC`,
        [id]
      )
      .map((row) => ({
        id: row.id,
        clientId: row.client_id,
        subscriptionId: row.subscription_id,
        amount: row.amount,
        paymentDate: row.payment_date,
        paymentMethod: row.payment_method,
        reference: row.reference,
        notes: row.notes,
        createdAt: row.created_at,
        clientName: name,
        planName: row.plan_name
      }))

    const recentAccess = this.db.all<AccessLog>(
      `SELECT id, client_id AS clientId, client_name AS clientName, rfid_uid AS rfidUid, timestamp,
        result, reason, subscription_id AS subscriptionId, device_id AS deviceId
       FROM access_logs WHERE client_id = ? ORDER BY timestamp DESC, id DESC LIMIT 20`,
      [id]
    )

    const totalPaid =
      this.db.get<{ total: number }>('SELECT IFNULL(SUM(amount), 0) AS total FROM payments WHERE client_id = ?', [id])
        ?.total ?? 0

    return {
      ...client,
      rfidCard,
      rfidCards,
      currentSubscription,
      subscriptions,
      payments,
      recentAccess,
      totals: { totalPaid, outstanding: currentSubscription?.outstanding ?? 0 }
    }
  }

  create(input: {
    firstName: string
    lastName: string
    phone?: string | null
    email?: string | null
    dateOfBirth?: string | null
    address?: string | null
    photo?: string | null
    notes?: string | null
    status?: ClientStatus
    rfidUid?: string | null
  }): ActionResult<Client> {
    const firstName = input.firstName?.trim()
    const lastName = input.lastName?.trim()
    if (!firstName) return { ok: false, error: 'First name is required' }
    if (!lastName) return { ok: false, error: 'Last name is required' }
    const status = input.status ?? 'ACTIVE'
    if (!CLIENT_STATUSES.includes(status)) return { ok: false, error: 'Invalid client status' }

    const rfidUid = input.rfidUid ? normalizeUid(input.rfidUid) : null
    if (rfidUid) {
      const existing = this.rfid.findByUid(rfidUid)
      if (existing) return { ok: false, error: `RFID UID ${rfidUid} is already assigned to ${existing.clientName}` }
    }

    try {
      const clientId = this.db.tx(() => {
        const now = new Date().toISOString()
        const result = this.db.run(
          `INSERT INTO clients (first_name, last_name, phone, email, date_of_birth, address, photo, notes, rfid_uid, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            firstName,
            lastName,
            input.phone?.trim() || null,
            input.email?.trim() || null,
            input.dateOfBirth || null,
            input.address?.trim() || null,
            input.photo || null,
            input.notes?.trim() || null,
            null,
            status,
            now,
            now
          ]
        )
        if (rfidUid) {
          const assigned = this.rfid.assign({ clientId: result.lastInsertRowid, uid: rfidUid })
          if (!assigned.ok) throw new Error(assigned.error ?? 'Failed to assign RFID card')
        }
        return result.lastInsertRowid
      })
      const created = this.getRaw(clientId) as Client
      this.audit.log('CLIENT_CREATED', 'client', clientId, `Client ${firstName} ${lastName} created`)
      return { ok: true, data: created }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to create client' }
    }
  }

  update(
    id: number,
    patch: {
      firstName?: string
      lastName?: string
      phone?: string | null
      email?: string | null
      dateOfBirth?: string | null
      address?: string | null
      photo?: string | null
      notes?: string | null
      status?: ClientStatus
      rfidUid?: string | null
    }
  ): ActionResult<Client> {
    const current = this.getRaw(id)
    if (!current) return { ok: false, error: 'Client not found' }
    const firstName = patch.firstName === undefined ? current.firstName : patch.firstName.trim()
    const lastName = patch.lastName === undefined ? current.lastName : patch.lastName.trim()
    if (!firstName) return { ok: false, error: 'First name is required' }
    if (!lastName) return { ok: false, error: 'Last name is required' }
    const status = patch.status ?? current.status
    if (!CLIENT_STATUSES.includes(status)) return { ok: false, error: 'Invalid client status' }

    this.db.run(
      `UPDATE clients SET first_name = ?, last_name = ?, phone = ?, email = ?, date_of_birth = ?, address = ?, photo = ?, notes = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        firstName,
        lastName,
        patch.phone === undefined ? current.phone : patch.phone?.trim() || null,
        patch.email === undefined ? current.email : patch.email?.trim() || null,
        patch.dateOfBirth === undefined ? current.dateOfBirth : patch.dateOfBirth || null,
        patch.address === undefined ? current.address : patch.address?.trim() || null,
        patch.photo === undefined ? current.photo : patch.photo || null,
        patch.notes === undefined ? current.notes : patch.notes?.trim() || null,
        status,
        new Date().toISOString(),
        id
      ]
    )

    let rfidWarning: string | undefined
    if (patch.rfidUid) {
      const uid = normalizeUid(patch.rfidUid)
      if (uid) {
        const liveCard = this.rfid.getLiveCardForClient(id)
        if (!liveCard) {
          const assigned = this.rfid.assign({ clientId: id, uid })
          if (!assigned.ok) rfidWarning = assigned.error
        } else if (liveCard.uid !== uid) {
          const replaced = this.rfid.replace({ clientId: id, newUid: uid })
          if (!replaced.ok) rfidWarning = replaced.error
        }
      }
    }

    const changed: string[] = []
    if (firstName !== current.firstName || lastName !== current.lastName) changed.push('name')
    if (status !== current.status) changed.push(`status ${current.status} -> ${status}`)
    this.audit.log(
      'CLIENT_UPDATED',
      'client',
      id,
      `Client ${firstName} ${lastName} updated${changed.length ? ` (${changed.join(', ')})` : ''}`
    )
    return { ok: true, data: this.getRaw(id) as Client, error: rfidWarning }
  }

  delete(id: number): ActionResult {
    const current = this.getRaw(id)
    if (!current) return { ok: false, error: 'Client not found' }
    const name = `${current.firstName} ${current.lastName}`.trim()
    this.db.run('DELETE FROM clients WHERE id = ?', [id])
    this.audit.log('CLIENT_DELETED', 'client', id, `Client ${name} deleted`)
    return { ok: true }
  }
}
