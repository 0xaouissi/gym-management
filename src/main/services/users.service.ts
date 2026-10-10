import type { ActionResult, Role, User } from '@shared/types'
import type { Db } from '../db/database'
import { hashPassword, validatePassword, validateUsername } from './auth.service'
import type { AuditService } from './audit.service'

interface UserRow {
  id: number
  username: string
  full_name: string
  role: Role
  is_active: number
  created_at: string
  updated_at: string
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService
  ) {}

  private countActiveAdmins(excludeId?: number): number {
    const row = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND is_active = 1 ${excludeId ? 'AND id != ?' : ''}`,
      excludeId ? [excludeId] : []
    )
    return row?.n ?? 0
  }

  private getUser(id: number): UserRow | undefined {
    return this.db.get<UserRow>('SELECT * FROM users WHERE id = ?', [id])
  }

  list(): User[] {
    const rows = this.db.all<UserRow>('SELECT * FROM users ORDER BY role, username')
    return rows.map(rowToUser)
  }

  create(input: { username: string; password: string; fullName: string; role: Role }): ActionResult<User> {
    const username = input.username.trim()
    const usernameError = validateUsername(username)
    if (usernameError) return { ok: false, error: usernameError }
    const passwordError = validatePassword(input.password)
    if (passwordError) return { ok: false, error: passwordError }
    const fullName = input.fullName.trim()
    if (!fullName) return { ok: false, error: 'Full name is required' }
    const existing = this.db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', [username])
    if (existing) return { ok: false, error: 'This username is already taken' }

    const { hash, salt } = hashPassword(input.password)
    const now = new Date().toISOString()
    const result = this.db.run(
      `INSERT INTO users (username, password_hash, password_salt, full_name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [username, hash, salt, fullName, input.role, now, now]
    )
    this.audit.log('USER_CREATED', 'user', result.lastInsertRowid, `User "${username}" (${input.role}) created`)
    const row = this.getUser(result.lastInsertRowid)
    return { ok: true, data: rowToUser(row as UserRow) }
  }

  update(id: number, patch: { fullName?: string; role?: Role; isActive?: boolean }): ActionResult<User> {
    const current = this.getUser(id)
    if (!current) return { ok: false, error: 'User not found' }

    const nextRole = patch.role ?? current.role
    const nextActive = patch.isActive === undefined ? current.is_active === 1 : patch.isActive
    const losingAdmin = current.role === 'ADMIN' && (nextRole !== 'ADMIN' || !nextActive)
    if (losingAdmin && this.countActiveAdmins(id) === 0) {
      return { ok: false, error: 'Cannot disable or demote the last active administrator' }
    }
    const fullName = patch.fullName === undefined ? current.full_name : patch.fullName.trim()
    if (!fullName) return { ok: false, error: 'Full name is required' }

    this.db.run('UPDATE users SET full_name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?', [
      fullName,
      nextRole,
      nextActive ? 1 : 0,
      new Date().toISOString(),
      id
    ])
    const changed: string[] = []
    if (nextRole !== current.role) changed.push(`role ${current.role} -> ${nextRole}`)
    if (nextActive !== (current.is_active === 1)) changed.push(nextActive ? 'enabled' : 'disabled')
    if (fullName !== current.full_name) changed.push('name updated')
    if (changed.length) {
      this.audit.log('USER_UPDATED', 'user', id, `User "${current.username}": ${changed.join(', ')}`)
    }
    const row = this.getUser(id)
    return { ok: true, data: rowToUser(row as UserRow) }
  }

  resetPassword(id: number, newPassword: string): ActionResult {
    const current = this.getUser(id)
    if (!current) return { ok: false, error: 'User not found' }
    const passwordError = validatePassword(newPassword)
    if (passwordError) return { ok: false, error: passwordError }
    const { hash, salt } = hashPassword(newPassword)
    this.db.run('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?', [
      hash,
      salt,
      new Date().toISOString(),
      id
    ])
    this.audit.log('USER_PASSWORD_RESET', 'user', id, `Password reset for "${current.username}"`)
    return { ok: true }
  }

  delete(id: number, actorId: number | null): ActionResult {
    const current = this.getUser(id)
    if (!current) return { ok: false, error: 'User not found' }
    if (actorId !== null && actorId === id) return { ok: false, error: 'You cannot delete your own account' }
    if (current.role === 'ADMIN' && current.is_active === 1 && this.countActiveAdmins(id) === 0) {
      return { ok: false, error: 'Cannot delete the last active administrator' }
    }
    this.db.run('DELETE FROM users WHERE id = ?', [id])
    this.audit.log('USER_DELETED', 'user', id, `User "${current.username}" deleted`)
    return { ok: true }
  }
}
