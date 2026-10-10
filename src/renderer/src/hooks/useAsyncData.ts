import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from '@renderer/lib/utils'

export interface AsyncData<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** Re-fetch showing the loading state. */
  reload(): Promise<void>
  /** Re-fetch quietly, keeping the current data visible. */
  refresh(): Promise<void>
}

interface AsyncDataOptions {
  /** Re-fetch automatically whenever the backend reports a data change. */
  live?: boolean
}

export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
  options: AsyncDataOptions = {}
): AsyncData<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })

  const requestIdRef = useRef(0)
  const run = useCallback(async (showSpinner: boolean) => {
    const requestId = ++requestIdRef.current
    if (showSpinner) setLoading(true)
    try {
      const result = await loaderRef.current()
      if (requestIdRef.current !== requestId) return
      setData(result)
      setError(null)
    } catch (e) {
      if (requestIdRef.current !== requestId) return
      setError(describeError(e))
    } finally {
      if (requestIdRef.current === requestId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void run(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const live = options.live ?? false
  useEffect(() => {
    if (!live) return
    return window.api.onDataChanged(() => {
      void run(false)
    })
  }, [live, run])

  const reload = useCallback(() => run(true), [run])
  const refresh = useCallback(() => run(false), [run])

  return { data, loading, error, reload, refresh }
}
