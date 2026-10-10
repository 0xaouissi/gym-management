import type {
  AccessScanOutcome,
  GymSettings,
  HardwareStatus,
  RfidReaderMode,
  ScanSource,
  TurnstileTestResult
} from '@shared/types'
import { normalizeUid } from '@shared/utils'
import { HARDWARE_RECONNECT_INTERVAL_MS, MOCK_DEFAULT_UID } from '@shared/constants'
import type { RFIDReader, TurnstileController } from './contracts'
import { MockRFIDReader } from './MockRFIDReader'
import { MockTurnstileController } from './MockTurnstileController'
import { PassiveRFIDReader } from './passive'
import { SerialRFIDReader } from './SerialRFIDReader'
import { TcpRFIDReader } from './TcpRFIDReader'
import { HttpTurnstileController } from './HttpTurnstileController'
import { TcpTurnstileController } from './TcpTurnstileController'
import { SerialRelayTurnstileController } from './SerialRelayTurnstileController'

export interface HardwareManagerDeps {
  getSettings(): GymSettings
  onScan(uid: string, source: ScanSource): Promise<AccessScanOutcome>
  onCaptured(uid: string): void
  onStatus(status: HardwareStatus): void
  getDatabaseStatus(): { connected: boolean; detail: string }
}

interface AdapterState {
  connected: boolean
  detail: string
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Stable handle given to the access service. It always points at the adapter
 * that is currently active, so reconnects never leave a stale reference behind.
 */
class TurnstileProxy implements TurnstileController {
  private inner: TurnstileController | null = null

  setInner(controller: TurnstileController | null): void {
    this.inner = controller
  }

  async connect(): Promise<void> {
    await this.inner?.connect()
  }

  async disconnect(): Promise<void> {
    await this.inner?.disconnect()
  }

  async open(): Promise<void> {
    if (!this.inner) throw new Error('Turnstile controller is not initialized')
    await this.inner.open()
  }

  async lock(): Promise<void> {
    await this.inner?.lock()
  }

  async getStatus(): Promise<string> {
    return this.inner ? this.inner.getStatus() : 'Turnstile controller is not initialized'
  }

  isConnected(): boolean {
    return this.inner?.isConnected?.() ?? false
  }
}

export class HardwareManager {
  private reader: RFIDReader | null = null
  private readerMode: RfidReaderMode | null = null
  private readerState: AdapterState = { connected: false, detail: 'Not started' }
  private turnstile: TurnstileController | null = null
  private turnstileState: AdapterState = { connected: false, detail: 'Not started' }
  private readonly proxy = new TurnstileProxy()
  private captureActive = false
  private readerBusy = false
  private turnstileBusy = false
  private reconnectTimer: NodeJS.Timeout | null = null
  private lastStatus = ''

  constructor(private readonly deps: HardwareManagerDeps) {}

  start(): void {
    this.build()
    void this.connectAll()
    this.reconnectTimer = setInterval(() => {
      void this.ensureConnections()
    }, HARDWARE_RECONNECT_INTERVAL_MS)
    this.reconnectTimer.unref()
  }

  async stop(): Promise<void> {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const reader = this.reader
    const turnstile = this.turnstile
    this.reader = null
    this.turnstile = null
    this.proxy.setInner(null)
    await Promise.allSettled([
      (async () => {
        await reader?.disconnect()
      })(),
      (async () => {
        await turnstile?.disconnect()
      })()
    ])
  }

  async reconnect(): Promise<HardwareStatus> {
    await this.stop()
    this.build()
    await this.connectAll()
    return this.getStatus()
  }

  getTurnstile(): TurnstileController {
    return this.proxy
  }

  getStatus(): HardwareStatus {
    return {
      rfid: {
        mode: this.deps.getSettings().rfid.mode,
        connected: this.readerState.connected,
        detail: this.readerState.detail
      },
      turnstile: {
        mode: this.deps.getSettings().turnstile.mode,
        connected: this.turnstileState.connected,
        detail: this.turnstileState.detail
      },
      database: this.deps.getDatabaseStatus()
    }
  }

  async testOpen(): Promise<TurnstileTestResult> {
    const turnstile = this.turnstile
    if (!turnstile) return { ok: false, detail: 'Turnstile controller is not initialized' }
    try {
      if (!turnstile.isConnected?.()) await turnstile.connect()
      await turnstile.open()
      this.emitStatus()
      return { ok: true, detail: await turnstile.getStatus() }
    } catch (error) {
      this.emitStatus()
      return { ok: false, detail: errorMessage(error) }
    }
  }

  setScanCapture(active: boolean): void {
    this.captureActive = active
  }

  async handleScan(uid: string, source: ScanSource): Promise<AccessScanOutcome | null> {
    const value = normalizeUid(uid)
    if (!value) return null
    if (this.captureActive) {
      this.deps.onCaptured(value)
      return null
    }
    return this.deps.onScan(value, source)
  }

  async simulateScan(uid?: string): Promise<AccessScanOutcome> {
    const target = normalizeUid(uid ?? MOCK_DEFAULT_UID)
    if (!target) throw new Error('A card UID is required')
    return this.deps.onScan(target, 'SIMULATED')
  }

  private build(): void {
    const settings = this.deps.getSettings()
    this.readerMode = settings.rfid.mode
    this.reader = createReader(settings)
    this.turnstile = createTurnstile(settings)
    this.proxy.setInner(this.turnstile)
    this.readerState = { connected: false, detail: `${settings.rfid.mode} reader not connected` }
    this.turnstileState = { connected: false, detail: `${settings.turnstile.mode} turnstile not connected` }

    this.reader.onCardDetected((uid) => {
      void this.routeReaderScan(uid)
    })
    this.reader.onConnectionChange?.((connected, detail) => {
      this.readerState = { connected, detail }
      this.emitStatus()
    })
    this.turnstile.onConnectionChange?.((connected, detail) => {
      this.turnstileState = { connected, detail }
      this.emitStatus()
    })
  }

  private async routeReaderScan(uid: string): Promise<void> {
    const source = sourceForReaderMode(this.readerMode)
    try {
      await this.handleScan(uid, source)
    } catch (error) {
      console.error('[hardware] scan handling failed:', error)
    }
  }

  private async connectAll(): Promise<void> {
    await Promise.allSettled([this.connectReader(), this.connectTurnstile()])
    this.emitStatus()
  }

  private async connectReader(): Promise<void> {
    const reader = this.reader
    if (!reader || this.readerState.connected) return
    this.readerBusy = true
    try {
      await reader.connect()
    } catch (error) {
      this.readerState = { connected: false, detail: errorMessage(error) }
    } finally {
      this.readerBusy = false
    }
  }

  private async connectTurnstile(): Promise<void> {
    const turnstile = this.turnstile
    if (!turnstile || this.turnstileState.connected) return
    this.turnstileBusy = true
    try {
      await turnstile.connect()
    } catch (error) {
      this.turnstileState = { connected: false, detail: errorMessage(error) }
    } finally {
      this.turnstileBusy = false
    }
  }

  private async ensureConnections(): Promise<void> {
    if (!this.readerBusy) await this.connectReader()
    if (!this.turnstileBusy) await this.connectTurnstile()
    this.emitStatus()
  }

  private emitStatus(): void {
    const status = this.getStatus()
    const serialized = JSON.stringify(status)
    if (serialized === this.lastStatus) return
    this.lastStatus = serialized
    this.deps.onStatus(status)
  }
}

function sourceForReaderMode(mode: RfidReaderMode | null): ScanSource {
  switch (mode) {
    case 'SERIAL':
      return 'SERIAL'
    case 'TCP':
      return 'TCP'
    case 'KEYBOARD':
      return 'KEYBOARD'
    default:
      return 'MOCK'
  }
}

function createReader(settings: GymSettings): RFIDReader {
  const { rfid } = settings
  switch (rfid.mode) {
    case 'SERIAL':
      return new SerialRFIDReader({ path: rfid.serialPort, baudRate: rfid.baudRate, parser: rfid.parser })
    case 'TCP':
      return new TcpRFIDReader({ host: rfid.tcpHost, port: rfid.tcpPort, parser: rfid.parser })
    case 'KEYBOARD':
      return new PassiveRFIDReader(`Keyboard wedge (HID) active on ${rfid.deviceName || 'reader'}`)
    default:
      return new MockRFIDReader()
  }
}

function createTurnstile(settings: GymSettings): TurnstileController {
  const { turnstile } = settings
  switch (turnstile.mode) {
    case 'HTTP':
      return new HttpTurnstileController({ url: turnstile.httpUrl, method: turnstile.httpMethod })
    case 'TCP':
      return new TcpTurnstileController({
        host: turnstile.tcpHost,
        port: turnstile.tcpPort,
        openCommandHex: turnstile.openCommandHex,
        lockCommandHex: turnstile.lockCommandHex
      })
    case 'SERIAL_RELAY':
      return new SerialRelayTurnstileController({
        path: turnstile.serialPort,
        baudRate: turnstile.baudRate,
        openCommandHex: turnstile.openCommandHex,
        lockCommandHex: turnstile.lockCommandHex,
        relayPulseMs: turnstile.relayPulseMs
      })
    default:
      return new MockTurnstileController()
  }
}
