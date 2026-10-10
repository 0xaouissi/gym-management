export interface RFIDReader {
  connect(): Promise<void>
  disconnect(): Promise<void>
  onCardDetected(callback: (uid: string) => void): void
  onConnectionChange?(callback: (connected: boolean, detail: string) => void): void
  isConnected?(): boolean
}

export interface TurnstileController {
  connect(): Promise<void>
  disconnect(): Promise<void>
  open(): Promise<void>
  lock(): Promise<void>
  getStatus(): Promise<string>
  onConnectionChange?(callback: (connected: boolean, detail: string) => void): void
  isConnected?(): boolean
}
