import net from 'node:net'
import type { RFIDReader } from './contracts'
import { createUidAccumulator, type UidAccumulator, type UidParser } from './uidStream'

export interface TcpRFIDReaderOptions {
  host: string
  port: number
  parser: UidParser
  timeoutMs?: number
}

export class TcpRFIDReader implements RFIDReader {
  private socket: net.Socket | null = null
  private connected = false
  private connecting: Promise<void> | null = null
  private uid: UidAccumulator
  private cardHandler: ((uid: string) => void) | null = null
  private connectionHandler: ((connected: boolean, detail: string) => void) | null = null

  constructor(private readonly options: TcpRFIDReaderOptions) {
    this.uid = createUidAccumulator((value) => this.cardHandler?.(value), options.parser)
  }

  async connect(): Promise<void> {
    if (this.connected) return
    if (this.connecting) return this.connecting
    this.connecting = this.openSocket()
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  private async openSocket(): Promise<void> {
    const { host, port, timeoutMs = 5000 } = this.options
    const socket = new net.Socket()
    this.uid.reset()
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
    socket.on('data', (data: Buffer) => this.uid.push(data.toString('utf8')))
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
    if (wasConnected) this.connectionHandler?.(false, 'TCP reader stopped')
  }

  onCardDetected(callback: (uid: string) => void): void {
    this.cardHandler = callback
  }

  onConnectionChange(callback: (connected: boolean, detail: string) => void): void {
    this.connectionHandler = callback
  }

  isConnected(): boolean {
    return this.connected
  }
}
