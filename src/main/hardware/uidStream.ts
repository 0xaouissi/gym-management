import { normalizeUid } from '@shared/utils'

export type UidParser = 'LINE' | 'RAW'

export interface UidAccumulator {
  push(chunk: string): void
  reset(): void
}

export function createUidAccumulator(onUid: (uid: string) => void, parser: UidParser): UidAccumulator {
  let buffer = ''
  return {
    push(chunk: string): void {
      if (!chunk) return
      if (parser === 'RAW') {
        const uid = normalizeUid(chunk)
        if (uid) onUid(uid)
        return
      }
      buffer += chunk
      const parts = buffer.split(/[\r\n]+/)
      buffer = parts.pop() ?? ''
      for (const part of parts) {
        const uid = normalizeUid(part)
        if (uid) onUid(uid)
      }
    },
    reset(): void {
      buffer = ''
    }
  }
}

export function hexToBuffer(hex: string): Buffer {
  const clean = hex.replace(/[\s:-]/g, '')
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`Invalid hex command: "${hex}"`)
  }
  return Buffer.from(clean, 'hex')
}
