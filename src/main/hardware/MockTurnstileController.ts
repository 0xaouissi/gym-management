import type { TurnstileController } from './contracts'

export class MockTurnstileController implements TurnstileController {
  private connected = false
  private locked = true
  private connectionHandler: ((connected: boolean, detail: string) => void) | null = null

  openCount = 0
  lastOpenedAt: string | null = null

  async connect(): Promise<void> {
    this.connected = true
    this.locked = true
    this.connectionHandler?.(true, 'Mock turnstile ready')
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.connectionHandler?.(false, 'Mock turnstile stopped')
  }

  async open(): Promise<void> {
    if (!this.connected) throw new Error('Mock turnstile is not connected')
    this.openCount += 1
    this.lastOpenedAt = new Date().toISOString()
    this.locked = false
  }

  async lock(): Promise<void> {
    this.locked = true
  }

  async getStatus(): Promise<string> {
    if (!this.connected) return 'Mock turnstile offline'
    return `Mock turnstile ready (${this.locked ? 'locked' : 'unlocked'}, ${this.openCount} open(s))`
  }

  onConnectionChange(callback: (connected: boolean, detail: string) => void): void {
    this.connectionHandler = callback
  }

  isConnected(): boolean {
    return this.connected
  }
}
