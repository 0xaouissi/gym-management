import { DEFAULT_SETTINGS } from '@shared/constants'
import type { GymSettings } from '@shared/types'
import type { Db } from '../db/database'

function mergeSettings(stored: Partial<GymSettings>): GymSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    rfid: { ...DEFAULT_SETTINGS.rfid, ...(stored.rfid ?? {}) },
    turnstile: { ...DEFAULT_SETTINGS.turnstile, ...(stored.turnstile ?? {}) }
  }
}

export class SettingsService {
  constructor(private readonly db: Db) {}

  get(): GymSettings {
    const row = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['app'])
    let stored: Partial<GymSettings> = {}
    if (row) {
      try {
        stored = JSON.parse(row.value) as Partial<GymSettings>
      } catch {
        stored = {}
      }
    }
    return mergeSettings(stored)
  }

  update(patch: Partial<GymSettings>): GymSettings {
    const current = this.get()
    const merged = mergeSettings({
      ...current,
      ...patch,
      rfid: { ...current.rfid, ...(patch.rfid ?? {}) },
      turnstile: { ...current.turnstile, ...(patch.turnstile ?? {}) }
    })
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES ('app', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(merged), new Date().toISOString()]
    )
    return merged
  }
}
