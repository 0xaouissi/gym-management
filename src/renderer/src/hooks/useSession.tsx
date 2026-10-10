import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LoginResult, SessionUser } from '@shared/types'

interface SetupInput {
  username: string
  password: string
  fullName: string
  gymName?: string
}

interface SessionContextValue {
  user: SessionUser | null
  loading: boolean
  needsSetup: boolean
  login(username: string, password: string): Promise<LoginResult>
  setupAdmin(input: SetupInput): Promise<LoginResult>
  logout(): Promise<void>
  refresh(): Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [session, setupRequired] = await Promise.all([
        window.api.auth.session(),
        window.api.auth.needsSetup()
      ])
      setUser(session)
      setNeedsSetup(setupRequired)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const result = await window.api.auth.login(username, password)
    if (result.ok && result.user) {
      setUser(result.user)
      setNeedsSetup(false)
    }
    return result
  }, [])

  const setupAdmin = useCallback(async (input: SetupInput) => {
    const result = await window.api.auth.setupAdmin(input)
    if (result.ok && result.user) {
      setUser(result.user)
      setNeedsSetup(false)
    }
    return result
  }, [])

  const logout = useCallback(async () => {
    await window.api.auth.logout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, needsSetup, login, setupAdmin, logout, refresh }),
    [user, loading, needsSetup, login, setupAdmin, logout, refresh]
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) throw new Error('useSession must be used inside SessionProvider')
  return context
}
