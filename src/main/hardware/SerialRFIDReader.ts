import type { RFIDReader } from './contracts'
import { loadSerialPort, type SerialPortHandle } from './serial'
import { createUidAccumulator, type UidAccumulator, type UidParser } from './uidStream'

export interface SerialRFIDReaderOptions {
  path: string
  baudRate: number
  parser: UidParser
}

export class SerialRFIDReader implements RFIDReader {
  private port: SerialPortHandle | null = null
  private connected = false
  private connecting: Promise<void> | null = null
  private uid: UidAccumulator
  private cardHandler: ((uid: string) => void) | null = null
  private connectionHandler: ((connected: boolean, detail: string) => void) | null = null

  constructor(private readonly options: SerialRFIDReaderOptions) {
    this.uid = createUidAccumulator((value) => this.cardHandler?.(value), options.parser)
  }

  async connect(): Promise<void> {
    if (this.connected) return
    if (this.connecting) return this.connecting
    this.connecting = this.openPort()
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  private async openPort(): Promise<void> {
    const { SerialPort } = await loadSerialPort()
    const port = new SerialPort({ path: this.options.path, baudRate: this.options.baudRate, autoOpen: false })
    this.uid.reset()
    port.on('data', (data) => this.uid.push(data.toString('utf8')))
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
    this.connectionHandler?.(true, `Serial ${this.options.path} @ ${this.options.baudRate} baud`)
  }

  private handleDrop(detail: string): void {
    this.port = null
    if (!this.connected) return
    this.connected = false
    this.connectionHandler?.(false, detail)
  }

  async disconnect(): Promise<void> {
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
    if (wasConnected) this.connectionHandler?.(false, 'Serial reader stopped')
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
