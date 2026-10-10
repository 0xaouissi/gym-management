import { useEffect, useState } from 'react'
import type { HardwareStatus } from '@shared/types'

export function useHardwareStatus(): HardwareStatus | null {
  const [status, setStatus] = useState<HardwareStatus | null>(null)

  useEffect(() => {
    let active = true
    void window.api.hardware
      .status()
      .then((next) => {
        if (active) setStatus(next)
      })
      .catch(() => {
        // status is best-effort; the indicator simply stays empty
      })
    const unsubscribe = window.api.onHardwareStatus((next) => setStatus(next))
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return status
}
