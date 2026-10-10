import type { AuditLog, Paged, SessionUser } from '@shared/types'
import type { Db } from '../db/database'

interface AuditRow {
  id: number
  user_id: number | null
  username: string
  action: string
  entity: string
  entity_id: string | null
  details: string | null
  timestamp: string
}

function rowToAuditLog(row: AuditRow): AuditLog {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    details: row.details,
    timestamp: row.timestamp
  }
}

export class AuditService {
  constructor(
    private readonly db: Db,
    private readonly getActor: () => SessionUser | null
  ) {}

  log(action: string, entity: string, entityId?: number | string | null, details?: string | null): void {
    const actor = this.getActor()
    this.db.run(
      `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        actor?.id ?? null,
        actor?.username ?? 'SYSTEM',
        action,
        entity,
        entityId === undefined || entityId === null ? null : String(entityId),
        details ?? null,
        new Date().toISOString()
      ]
    )
  }

  list(params: { search?: string; page?: number; pageSize?: number } = {}): Paged<AuditLog> {
    const where: string[] = []
    const args: unknown[] = []
    const search = params.search?.trim()
    if (search) {
      const q = `%${search.toLowerCase()}%`
      where.push(
        `(lower(username) LIKE ? OR lower(action) LIKE ? OR lower(entity) LIKE ? OR lower(IFNULL(details,'')) LIKE ?)`
      )
      args.push(q, q, q, q)
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_logs ${whereSql}`, args)?.n ?? 0
    const page = Math.max(1, params.page ?? 1)
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50))
    const rows = this.db.all<AuditRow>(
      `SELECT * FROM audit_logs ${whereSql} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`,
      [...args, pageSize, (page - 1) * pageSize]
    )
    return { items: rows.map(rowToAuditLog), total }
  }
}
