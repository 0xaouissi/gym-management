import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  BarChart3,
  CalendarCheck,
  CreditCard,
  DoorOpen,
  Dumbbell,
  LayoutDashboard,
  LogOut,
  Moon,
  ScanLine,
  ScrollText,
  Settings as SettingsIcon,
  Sun,
  UserCog,
  Users,
  Wallet,
  type LucideIcon
} from 'lucide-react'
import { toast } from 'sonner'
import { ACCESS_REASON_LABELS, APP_NAME, ROLE_LABELS } from '@shared/constants'
import type { AccessScanOutcome } from '@shared/types'
import { useSession } from '@renderer/hooks/useSession'
import { useSettings } from '@renderer/hooks/useSettings'
import { useHardwareStatus } from '@renderer/hooks/useHardwareStatus'
import { playDeniedSound, playGrantedSound } from '@renderer/lib/sound'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/live', label: 'Live Access', icon: ScanLine }
    ]
  },
  {
    title: 'Members',
    items: [
      { to: '/clients', label: 'Clients', icon: Users },
      { to: '/subscriptions', label: 'Subscriptions', icon: CalendarCheck },
      { to: '/rfid', label: 'RFID Cards', icon: CreditCard },
      { to: '/attendance', label: 'Attendance', icon: Activity }
    ]
  },
  {
    title: 'Operations',
    items: [
      { to: '/access-control', label: 'Access Control', icon: DoorOpen },
      { to: '/payments', label: 'Payments', icon: Wallet },
      { to: '/reports', label: 'Reports', icon: BarChart3 }
    ]
  },
  {
    title: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
      { to: '/users', label: 'Users', icon: UserCog, adminOnly: true },
      { to: '/audit', label: 'Audit', icon: ScrollText, adminOnly: true }
    ]
  }
]

/** A hardware reader in keyboard-wedge mode types the UID then presses Enter. */
const WEDGE_GAP_MS = 120
const WEDGE_MIN_LENGTH = 4

function HardwarePill({ label, connected, detail }: { label: string; connected: boolean; detail: string }): React.JSX.Element {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs"
      title={detail}
    >
      <span
        className={cn('size-2 rounded-full', connected ? 'bg-success' : 'bg-destructive')}
        aria-hidden
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

export function AppLayout(): React.JSX.Element {
  const { user, logout } = useSession()
  const { settings, update } = useSettings()
  const hardware = useHardwareStatus()
  const location = useLocation()
  const routeRef = useRef(location.pathname)
  routeRef.current = location.pathname

  useEffect(() => {
    let buffer = ''
    let lastKeyAt = 0

    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return

      const now = Date.now()
      if (now - lastKeyAt > WEDGE_GAP_MS) buffer = ''
      lastKeyAt = now

      if (event.key === 'Enter') {
        const uid = buffer.trim()
        buffer = ''
        if (uid.length >= WEDGE_MIN_LENGTH) {
          event.preventDefault()
          void window.api.access.scan(uid, 'KEYBOARD')
        }
        return
      }

      if (event.key.length === 1) {
        buffer = (buffer + event.key).slice(-64)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const soundsRef = useRef(settings.sounds)
  soundsRef.current = settings.sounds

  useEffect(() => {
    const unsubscribe = window.api.onAccessResult((outcome: AccessScanOutcome) => {
      if (soundsRef.current) {
        if (outcome.decision.allowed) playGrantedSound()
        else playDeniedSound()
      }
      if (routeRef.current === '/live') return
      const reason = ACCESS_REASON_LABELS[outcome.decision.reason]
      if (outcome.decision.allowed) {
        toast.success(`${outcome.decision.clientName ?? outcome.uid} — access granted`, {
          description: reason
        })
      } else {
        toast.error(`${outcome.uid} — access denied`, { description: reason })
      }
    })
    return unsubscribe
  }, [])

  const isAdmin = user?.role === 'ADMIN'

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/40">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Dumbbell className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{settings.gymName || APP_NAME}</p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gym Manager</p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => !item.adminOnly || isAdmin)
            if (items.length === 0) return null
            return (
              <div key={group.title}>
                <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </p>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-primary/15 font-medium text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <p className="truncate">
            Signed in as <span className="text-foreground">{user?.fullName}</span>
          </p>
          <p className="truncate">{user ? ROLE_LABELS[user.role] : ''}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border px-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="size-4 text-primary" />
            <span>Access validation runs in the app backend</span>
          </div>

          <div className="flex items-center gap-2">
            <HardwarePill
              label="RFID"
              connected={hardware?.rfid.connected ?? false}
              detail={hardware ? `RFID (${hardware.rfid.mode}): ${hardware.rfid.detail}` : 'RFID: unknown'}
            />
            <HardwarePill
              label="Turnstile"
              connected={hardware?.turnstile.connected ?? false}
              detail={
                hardware
                  ? `Turnstile (${hardware.turnstile.mode}): ${hardware.turnstile.detail}`
                  : 'Turnstile: unknown'
              }
            />

            <Button
              variant="ghost"
              size="icon-sm"
              title="Toggle theme"
              onClick={() => void update({ theme: settings.theme === 'light' ? 'dark' : 'light' })}
            >
              {settings.theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary">
                    {user?.fullName?.slice(0, 1).toUpperCase() ?? '?'}
                  </span>
                  <span className="max-w-32 truncate">{user?.fullName}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm font-medium text-foreground">{user?.fullName}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {user?.username} · {user ? ROLE_LABELS[user.role] : ''}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void logout()}>
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  Validation runs offline on this computer
                </p>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
