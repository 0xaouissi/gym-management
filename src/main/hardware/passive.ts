import type { RFIDReader } from './contracts'

export class PassiveRFIDReader implements RFIDReader {
  private connectionHandler: ((connected: boolean, detail: string) => void) | null = null

  constructor(private readonly detail: string) {}

  async connect(): Promise<void> {
    this.connectionHandler?.(true, this.detail)
  }

  async disconnect(): Promise<void> {
    this.connectionHandler?.(false, 'Reader stopped')
  }

  onCardDetected(): void {
    // Scans arrive from the renderer (keyboard wedge) via IPC instead of this adapter.
  }

  onConnectionChange(callback: (connected: boolean, detail: string) => void): void {
    this.connectionHandler = callback
  }

  isConnected(): boolean {
    return true
  }
}
