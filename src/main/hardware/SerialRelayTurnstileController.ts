import type { TurnstileController } from './contracts'
import { loadSerialPort, type SerialPortHandle } from './serial'
import { hexToBuffer } from './uidStream'

export interface SerialRelayOptions {
  path: string
  baudRate: number
  openCommandHex: string
  lockCommandHex: string
  relayPulseMs: number
}

/**
 * ZK TS1000 style dry-contact relay: pulse the relay to release the turnstile,
 * then restore it after `relayPulseMs` (or send an explicit lock frame when configured).
 */
export class SerialRelayTurnstileController implements TurnstileController {
  private port: SerialPortHandle | null = null
  private connected = false
  private pulseTimer: NodeJS.Timeout | null = null
  private connectionHandler: ((connected: boolean, detail: string) => void) | null = null

  constructor(private readonly options: SerialRelayOptions) {}

  async connect(): Promise<void> {
    if (this.connected) return
    const { SerialPort } = await loadSerialPort()
    const port = new SerialPort({ path: this.options.path, baudRate: this.options.baudRate, autoOpen: false })
    port.on('error', (error) => this.handleDrop(`Serial error: ${error.message}`))
    port.on('close', () => this.handleDrop(`Serial port ${this.options.path} closed`))
    await new Promise<void>((resolve, reject) => {
      port.open((error) => {
        if (error) reject(new Error(`Cannot open ${this.options.path}: ${error.message}`))
        else resolve()
      })
    })
    this.port = port
    this.connected = true
    this.connectionHandler?.(true, `Relay ${this.options.path} @ ${this.options.baudRate} baud`)
  }

  private handleDrop(detail: string): void {
    this.port = null
    if (!this.connected) return
    this.connected = false
    this.connectionHandler?.(false, detail)
  }

  async disconnect(): Promise<void> {
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer)
      this.pulseTimer = null
    }
    const port = this.port
    const wasConnected = this.connected
    this.port = null
    this.connected = false
    if (port) {
      await new Promise<void>((resolve) => {
        try {
          port.close(() => resolve())
        } catch {
          resolve()
        }
      })
    }
    if (wasConnected) this.connectionHandler?.(false, 'Serial relay stopped')
  }

  async open(): Promise<void> {
    const port = this.port
    if (!port || !this.connected) throw new Error('Turnstile relay is not connected')
    await this.write(hexToBuffer(this.options.openCommandHex))
    const pulseMs = Math.max(0, this.options.relayPulseMs)
    const lockHex = this.options.lockCommandHex.trim()
    if (pulseMs > 0 && lockHex) {
      if (this.pulseTimer) clearTimeout(this.pulseTimer)
      this.pulseTimer = setTimeout(() => {
        this.pulseTimer = null
        void this.lock().catch(() => undefined)
      }, pulseMs)
    }
  }

  async lock(): Promise<void> {
    const port = this.port
    if (!port || !this.connected) return
    const lockHex = this.options.lockCommandHex.trim()
    if (!lockHex) return
    await this.write(hexToBuffer(lockHex))
  }

  private write(frame: Buffer): Promise<void> {
    const port = this.port
    if (!port) return Promise.reject(new Error('Turnstile relay is not connected'))
    return new Promise<void>((resolve, reject) => {
      port.write(frame, (error) => (error ? reject(new Error(error.message)) : resolve()))
    })
  }

  async getStatus(): Promise<string> {
    return this.connected
      ? `Serial relay ready (${this.options.path} @ ${this.options.baudRate} baud)`
      : 'Serial relay offline'
  }

  onConnectionChange(callback: (connected: boolean, detail: string) => void): void {
    this.connectionHandler = callback
  }

  isConnected(): boolean {
    return this.connected
  }
}
