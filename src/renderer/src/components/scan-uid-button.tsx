import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

interface ScanUidButtonProps {
  onCaptured(uid: string): void
  disabled?: boolean
}

const CAPTURE_TIMEOUT_MS = 30_000

export function ScanUidButton({ onCaptured, disabled = false }: ScanUidButtonProps): React.JSX.Element {
  const [capturing, setCapturing] = useState(false)
  const onCapturedRef = useRef(onCaptured)
  onCapturedRef.current = onCaptured

  useEffect(() => {
    if (!capturing) return undefined
    let active = true
    const stop = (): void => {
      if (!active) return
      active = false
      setCapturing(false)
      void window.api.rfid.setScanCapture(false)
    }
    const unsubscribe = window.api.onScanCaptured((uid) => {
      onCapturedRef.current(uid)
      stop()
    })
    const timer = window.setTimeout(stop, CAPTURE_TIMEOUT_MS)
    return () => {
      active = false
      window.clearTimeout(timer)
      unsubscribe()
      void window.api.rfid.setScanCapture(false)
    }
  }, [capturing])

  const toggle = async (): Promise<void> => {
    if (capturing) {
      setCapturing(false)
      await window.api.rfid.setScanCapture(false)
      return
    }
    await window.api.rfid.setScanCapture(true)
    setCapturing(true)
  }

  return (
    <Button
      type="button"
      variant={capturing ? 'default' : 'outline'}
      disabled={disabled}
      onClick={() => void toggle()}
      className={cn(capturing && 'pulse-ring')}
    >
      <ScanLine className={cn('mr-2 size-4', capturing && 'animate-pulse')} />
      {capturing ? 'Waiting for card…' : 'Scan card'}
    </Button>
  )
}
