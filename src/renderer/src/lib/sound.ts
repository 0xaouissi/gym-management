let context: AudioContext | null = null

function audioContext(): AudioContext {
  if (!context) context = new AudioContext()
  return context
}

function beep(frequency: number, delay: number, duration: number, type: OscillatorType = 'sine'): void {
  try {
    const ctx = audioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + delay
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, start)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.05)
  } catch {
    // sound is a non-essential enhancement; ignore audio failures
  }
}

export function playGrantedSound(): void {
  beep(880, 0, 0.14)
  beep(1318.5, 0.12, 0.22)
}

export function playDeniedSound(): void {
  beep(196, 0, 0.28, 'square')
  beep(146.8, 0.24, 0.4, 'square')
}
