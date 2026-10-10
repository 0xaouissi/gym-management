import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS } from '@shared/constants'
import type { GymSettings } from '@shared/types'
import { useSession } from './useSession'

interface SettingsContextValue {
  settings: GymSettings
  loaded: boolean
  update(patch: Partial<GymSettings>): Promise<GymSettings>
  refresh(): Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { user } = useSession()
  const [settings, setSettings] = useState<GymSettings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const next = await window.api.settings.get()
      setSettings(next)
      setLoaded(true)
    } catch {
      // settings require a signed-in session; keep defaults until the user logs in
    }
  }, [])

  useEffect(() => {
    if (user) void refresh()
  }, [user, refresh])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme !== 'light')
  }, [settings.theme])

  const update = useCallback(async (patch: Partial<GymSettings>) => {
    const next = await window.api.settings.update(patch)
    setSettings(next)
    return next
  }, [])

  const value = useMemo(() => ({ settings, loaded, update, refresh }), [settings, loaded, update, refresh])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used inside SettingsProvider')
  return context
}
