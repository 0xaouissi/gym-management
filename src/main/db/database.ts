import { DatabaseSync } from 'node:sqlite'

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

type Param = unknown
type BoundValue = string | number | bigint | null | Uint8Array

function sanitize(params: Param[]): BoundValue[] {
  return params.map((p) => {
    if (p === undefined || p === null) return null
    if (typeof p === 'boolean') return p ? 1 : 0
    if (p instanceof Date) return p.toISOString()
    if (typeof p === 'number' || typeof p === 'string' || typeof p === 'bigint') return p
    if (p instanceof Uint8Array) return p
    return JSON.stringify(p)
  })
}

export class Db {
  readonly file: string
  private db: DatabaseSync

  constructor(file: string) {
    this.file = file
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA busy_timeout = 5000')
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  run(sql: string, params: Param[] = []): RunResult {
    const stmt = this.db.prepare(sql)
    const result = stmt.run(...sanitize(params)) as { changes: number | bigint; lastInsertRowid: number | bigint }
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) }
  }

  get<T>(sql: string, params: Param[] = []): T | undefined {
    const stmt = this.db.prepare(sql)
    return stmt.get(...sanitize(params)) as T | undefined
  }

  all<T>(sql: string, params: Param[] = []): T[] {
    const stmt = this.db.prepare(sql)
    return stmt.all(...sanitize(params)) as T[]
  }

  tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // rollback failure is not recoverable here; rethrow original error
      }
      throw error
    }
  }

  close(): void {
    this.db.close()
  }
}
