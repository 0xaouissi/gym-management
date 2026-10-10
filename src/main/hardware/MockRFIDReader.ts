import type { RFIDReader } from './contracts'

export class MockRFIDReader implements RFIDReader {
  private connected = false
  private cardHandler: ((uid: string) => void) | null = null
  private connectionHandler: ((connected: boolean, detail: string) => void) | null = null

  async connect(): Promise<void> {
    this.connected = true
    this.connectionHandler?.(true, 'Mock reader ready')
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.connectionHandler?.(false, 'Mock reader stopped')
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

  fireCard(uid: string): boolean {
    if (!this.connected || !this.cardHandler) return false
    this.cardHandler(uid)
    return true
  }
}
