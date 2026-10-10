import type { TurnstileController } from './contracts'

export interface HttpTurnstileOptions {
  url: string
  method: 'GET' | 'POST'
  timeoutMs?: number
}

export class HttpTurnstileController implements TurnstileController {
  private connected = false
  private connectionHandler: ((connected: boolean, detail: string) => void) | null = null

  constructor(private readonly options: HttpTurnstileOptions) {}

  private async request(timeoutMs: number): Promise<Response> {
    return fetch(this.options.url, {
      method: this.options.method,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store'
    })
  }

  async connect(): Promise<void> {
    const timeoutMs = this.options.timeoutMs ?? 4000
    try {
      const response = await this.request(timeoutMs)
      this.connected = true
      this.connectionHandler?.(true, `HTTP relay reachable (${response.status}) ${this.options.url}`)
    } catch (error) {
      this.connected = false
      throw new Error(`Cannot reach ${this.options.url}: ${errorMessage(error)}`)
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.connectionHandler?.(false, 'HTTP turnstile stopped')
  }

  async open(): Promise<void> {
    try {
      const response = await this.request(6000)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
      throw new Error(`Turnstile HTTP open failed: ${errorMessage(error)}`)
    }
  }

  async lock(): Promise<void> {
    // HTTP relay boards close the contact on their own after the configured pulse.
  }

  async getStatus(): Promise<string> {
    return this.connected ? `HTTP turnstile ready (${this.options.url})` : 'HTTP turnstile offline'
  }

  onConnectionChange(callback: (connected: boolean, detail: string) => void): void {
    this.connectionHandler = callback
  }

  isConnected(): boolean {
    return this.connected
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return 'request timed out'
    return error.message
  }
  return String(error)
}
