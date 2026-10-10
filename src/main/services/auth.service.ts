import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { LoginResult, Role, SessionUser } from '@shared/types'
import type { Db } from '../db/database'
import type { AuditService } from './audit.service'

const KEY_LENGTH = 64
const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const useSalt = salt ?? randomBytes(16).toString('hex')
  const hash = scryptSync(password, useSalt, KEY_LENGTH).toString('hex')
  return { hash, salt: useSalt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = scryptSync(password, salt, KEY_LENGTH)
  let expected: Buffer
  try {
    expected = Buffer.from(hash, 'hex')
  } catch {
    return false
  }
  if (computed.length !== expected.length) return false
  return timingSafeEqual(computed, expected)
}

export function validateUsername(username: string): string | null {
  if (!USERNAME_PATTERN.test(username.trim())) {
    return 'Username must be 3-32 characters (letters, numbers, dot, dash, underscore)'
  }
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length < 4) return 'Password must be at least 4 characters'
  if (password.length > 128) return 'Password is too long'
  return null
}

interface UserRow {
  id: number
  username: string
  password_hash: string
  password_salt: string
  full_name: string
  role: Role
  is_active: number
}

export class AuthService {
  private currentSession: SessionUser | null = null
  private audit: AuditService | null = null

  constructor(private readonly db: Db) {}

  setAuditService(audit: AuditService): void {
    this.audit = audit
  }

  needsSetup(): boolean {
    const row = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')
    return (row?.n ?? 0) === 0
  }

  setupAdmin(input: { username: string; password: string; fullName: string }): LoginResult {
    if (!this.needsSetup()) {
      return { ok: false, error: 'Initial setup has already been completed' }
    }
    const usernameError = validateUsername(input.username)
    if (usernameError) return { ok: false, error: usernameError }
    const passwordError = validatePassword(input.password)
    if (passwordError) return { ok: false, error: passwordError }
    const fullName = input.fullName.trim()
    if (!fullName) return { ok: false, error: 'Full name is required' }

    const { hash, salt } = hashPassword(input.password)
    const now = new Date().toISOString()
    const result = this.db.run(
      `INSERT INTO users (username, password_hash, password_salt, full_name, role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ADMIN', 1, ?, ?)`,
      [input.username.trim(), hash, salt, fullName, now, now]
    )
    this.currentSession = { id: result.lastInsertRowid, username: input.username.trim(), fullName, role: 'ADMIN' }
    this.audit?.log('ADMIN_CREATED', 'user', result.lastInsertRowid, `Initial administrator "${input.username.trim()}" created`)
    return { ok: true, user: this.currentSession }
  }

  login(username: string, password: string): LoginResult {
    const row = this.db.get<UserRow>('SELECT * FROM users WHERE username = ?', [username.trim()])
    if (!row || !verifyPassword(password, row.password_hash, row.password_salt)) {
      this.audit?.log('LOGIN_FAILED', 'auth', null, `Failed login attempt for "${username.trim()}"`)
      return { ok: false, error: 'Invalid username or password' }
    }
    if (!row.is_active) {
      this.audit?.log('LOGIN_FAILED', 'auth', row.id, `Login attempt on disabled account "${row.username}"`)
      return { ok: false, error: 'This account is disabled' }
    }
    this.currentSession = { id: row.id, username: row.username, fullName: row.full_name, role: row.role }
    this.audit?.log('LOGIN', 'auth', row.id, `User "${row.username}" logged in`)
    return { ok: true, user: this.currentSession }
  }

  logout(): void {
    const current = this.currentSession
    if (current) {
      this.audit?.log('LOGOUT', 'auth', current.id, `User "${current.username}" logged out`)
    }
    this.currentSession = null
  }

  session(): SessionUser | null {
    return this.currentSession
  }
}
