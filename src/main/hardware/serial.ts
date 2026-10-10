export interface SerialPortHandle {
  isOpen: boolean
  on(event: 'data', callback: (data: Buffer) => void): void
  on(event: 'error', callback: (error: Error) => void): void
  on(event: 'close', callback: () => void): void
  open(callback: (error: Error | null) => void): void
  write(data: Buffer, callback?: (error: Error | null) => void): void
  close(callback?: (error: Error | null) => void): void
}

export interface SerialPortOptions {
  path: string
  baudRate: number
  autoOpen: boolean
}

export interface SerialPortModule {
  SerialPort: new (options: SerialPortOptions) => SerialPortHandle
}

let cached: SerialPortModule | null = null

export async function loadSerialPort(): Promise<SerialPortModule> {
  if (cached) return cached
  // Non-literal specifier: keeps the optional native dependency out of the bundle,
  // so the app still builds and runs when "serialport" is not installed.
  const specifier = 'serialport'
  try {
    const mod = (await import(specifier)) as SerialPortModule
    if (typeof mod.SerialPort !== 'function') throw new Error('SerialPort export missing')
    cached = mod
    return mod
  } catch {
    throw new Error(
      'The optional "serialport" module is not available. Install it with "npm install serialport" and rebuild the app.'
    )
  }
}
