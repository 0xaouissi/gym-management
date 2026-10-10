import net from 'node:net'
import type { TurnstileController } from './contracts'
import { hexToBuffer } from './uidStream'

export interface TcpTurnstileOptions {
  host: string
  port: number
  openCommandHex: string
  lockCommandHex: string
  timeoutMs?: number
}

export class TcpTurnstileController implements TurnstileController {
  private socket: net.Socket | null = null
  private connected = false
  private connectionHandler: ((connected: boolean, detail: string) => void) | null = null

  constructor(private readonly options: TcpTurnstileOptions) {}

  async connect(): Promise<void> {
    if (this.connected) return
    const { host, port, timeoutMs = 5000 } = this.options
    const socket = new net.Socket()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error(`Timed out connecting to ${host}:${port}`))
      }, timeoutMs)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('error', (error) => {
        clearTimeout(timer)
        reject(new Error(`Cannot connect to ${host}:${port}: ${error.message}`))
      })
      socket.connect(port, host)
    })
    socket.on('error', (error: Error) => this.handleDrop(`TCP error: ${error.message}`))
    socket.on('close', () => this.handleDrop(`Connection to ${host}:${port} closed`))
    socket.setKeepAlive(true, 15000)
    this.socket = socket
    this.connected = true
    this.connectionHandler?.(true, `TCP ${host}:${port}`)
  }

  private handleDrop(detail: string): void {
    this.socket = null
    if (!this.connected) return
    this.connected = false
    this.connectionHandler?.(false, detail)
  }

  async disconnect(): Promise<void> {
    const socket = this.socket
    const wasConnected = this.connected
    this.socket = null
    this.connected = false
    socket?.destroy()
    if (wasConnected) this.connectionHandler?.(false, 'TCP turnstile stopped')
  }

  async open(): Promise<void> {
    this.write(this.options.openCommandHex)
  }

  async lock(): Promise<void> {
    if (!this.options.lockCommandHex.trim()) return
    this.write(this.options.lockCommandHex)
  }

  private write(hex: string): void {
    const socket = this.socket
    if (!socket || !this.connected) throw new Error('TCP turnstile is not connected')
    socket.write(hexToBuffer(hex))
  }

  async getStatus(): Promise<string> {
    return this.connected
      ? `TCP turnstile ready (${this.options.host}:${this.options.port})`
      : 'TCP turnstile offline'
  }

  onConnectionChange(callback: (connected: boolean, detail: string) => void): void {
    this.connectionHandler = callback
  }

  isConnected(): boolean {
    return this.connected
  }
}
