import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Info, Lock, RefreshCw, Save, Unlock } from 'lucide-react'
import type { GymSettings, RfidReaderMode, RfidSettings, ThemeMode, TurnstileMode, TurnstileSettings } from '@shared/types'
import { CURRENCIES, HARDWARE_RECONNECT_INTERVAL_MS } from '@shared/constants'
import { toast } from 'sonner'
import { useSession } from '@renderer/hooks/useSession'
import { useSettings } from '@renderer/hooks/useSettings'
import { useHardwareStatus } from '@renderer/hooks/useHardwareStatus'
import { describeError } from '@renderer/lib/utils'
import { PageHeader } from '@renderer/components/ui/page-header'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'

type SectionKey = 'gym' | 'regional' | 'rfid' | 'turnstile'

const RFID_MODES: RfidReaderMode[] = ['MOCK', 'KEYBOARD', 'SERIAL', 'TCP']
const TURNSTILE_MODES: TurnstileMode[] = ['MOCK', 'HTTP', 'TCP', 'SERIAL_RELAY']
const THEME_MODES: ThemeMode[] = ['dark', 'light']

const RFID_MODE_LABELS: Record<RfidReaderMode, string> = {
  MOCK: 'Mock — development only',
  KEYBOARD: 'Keyboard wedge (USB HID)',
  SERIAL: 'Serial port',
  TCP: 'TCP / Ethernet'
}

const TURNSTILE_MODE_LABELS: Record<TurnstileMode, string> = {
  MOCK: 'Mock — development only',
  HTTP: 'HTTP API',
  TCP: 'TCP (hex commands)',
  SERIAL_RELAY: 'Serial relay'
}

interface GymDraft {
  gymName: string
  gymAddress: string
  gymPhone: string
  gymLogo: string
}

interface RegionalDraft {
  currency: string
  expirationWarningDays: string
  theme: ThemeMode
  sounds: boolean
}

interface RfidDraft {
  mode: RfidReaderMode
  deviceName: string
  parser: 'LINE' | 'RAW'
  serialPort: string
  baudRate: string
  tcpHost: string
  tcpPort: string
}

interface TurnstileDraft {
  mode: TurnstileMode
  deviceName: string
  openDurationSec: string
  httpUrl: string
  httpMethod: 'GET' | 'POST'
  tcpHost: string
  tcpPort: string
  openCommandHex: string
  lockCommandHex: string
  serialPort: string
  baudRate: string
  relayPulseMs: string
}

interface Drafts {
  gym: GymDraft
  regional: RegionalDraft
  rfid: RfidDraft
  turnstile: TurnstileDraft
}

function toDrafts(settings: GymSettings): Drafts {
  return {
    gym: {
      gymName: settings.gymName,
      gymAddress: settings.gymAddress,
      gymPhone: settings.gymPhone,
      gymLogo: settings.gymLogo
    },
    regional: {
      currency: settings.currency,
      expirationWarningDays: String(settings.expirationWarningDays),
      theme: settings.theme,
      sounds: settings.sounds
    },
    rfid: {
      mode: settings.rfid.mode,
      deviceName: settings.rfid.deviceName,
      parser: settings.rfid.parser,
      serialPort: settings.rfid.serialPort,
      baudRate: String(settings.rfid.baudRate),
      tcpHost: settings.rfid.tcpHost,
      tcpPort: String(settings.rfid.tcpPort)
    },
    turnstile: {
      mode: settings.turnstile.mode,
      deviceName: settings.turnstile.deviceName,
      openDurationSec: String(settings.turnstile.openDurationSec),
      httpUrl: settings.turnstile.httpUrl,
      httpMethod: settings.turnstile.httpMethod,
      tcpHost: settings.turnstile.tcpHost,
      tcpPort: String(settings.turnstile.tcpPort),
      openCommandHex: settings.turnstile.openCommandHex,
      lockCommandHex: settings.turnstile.lockCommandHex,
      serialPort: settings.turnstile.serialPort,
      baudRate: String(settings.turnstile.baudRate),
      relayPulseMs: String(settings.turnstile.relayPulseMs)
    }
  }
}

function isHexCommand(value: string): boolean {
  const compact = value.replace(/\s+/g, '')
  return compact.length === 0 || (compact.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(compact))
}

function Field({
  label,
  htmlFor,
  hint,
  children
}: {
  label: string
  htmlFor: string
  hint?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function AdminOnlyNote(): React.JSX.Element {
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
      <Lock className="mt-0.5 size-3.5 shrink-0" />
      RFID reader and turnstile configuration is restricted to administrators. Receptionists can review the current
      settings but cannot change them.
    </p>
  )
}

export function SettingsPage(): React.JSX.Element {
  const { user } = useSession()
  const isAdmin = user?.role === 'ADMIN'
  const { settings, update } = useSettings()
  const hardware = useHardwareStatus()

  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(settings))
  const [saving, setSaving] = useState<SectionKey | null>(null)
  const [hardwareBusy, setHardwareBusy] = useState<'reconnect' | 'test' | null>(null)

  useEffect(() => {
    setDrafts(toDrafts(settings))
  }, [settings])

  const baseline = useMemo(() => toDrafts(settings), [settings])
  const gymDirty = JSON.stringify(drafts.gym) !== JSON.stringify(baseline.gym)
  const regionalDirty = JSON.stringify(drafts.regional) !== JSON.stringify(baseline.regional)
  const rfidDirty = JSON.stringify(drafts.rfid) !== JSON.stringify(baseline.rfid)
  const turnstileDirty = JSON.stringify(drafts.turnstile) !== JSON.stringify(baseline.turnstile)

  const updateGym = (patch: Partial<GymDraft>): void => setDrafts((prev) => ({ ...prev, gym: { ...prev.gym, ...patch } }))
  const updateRegional = (patch: Partial<RegionalDraft>): void =>
    setDrafts((prev) => ({ ...prev, regional: { ...prev.regional, ...patch } }))
  const updateRfid = (patch: Partial<RfidDraft>): void => setDrafts((prev) => ({ ...prev, rfid: { ...prev.rfid, ...patch } }))
  const updateTurnstile = (patch: Partial<TurnstileDraft>): void =>
    setDrafts((prev) => ({ ...prev, turnstile: { ...prev.turnstile, ...patch } }))

  const save = async (section: SectionKey, patch: Partial<GymSettings>): Promise<void> => {
    setSaving(section)
    try {
      await update(patch)
      toast.success('Settings saved')
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setSaving(null)
    }
  }

  const saveGym = (): void => {
    if (!drafts.gym.gymName.trim()) {
      toast.error('Gym name is required')
      return
    }
    void save('gym', {
      gymName: drafts.gym.gymName.trim(),
      gymAddress: drafts.gym.gymAddress.trim(),
      gymPhone: drafts.gym.gymPhone.trim(),
      gymLogo: drafts.gym.gymLogo.trim()
    })
  }

  const saveRegional = (): void => {
    const warningDays = Number(drafts.regional.expirationWarningDays)
    if (!Number.isInteger(warningDays) || warningDays < 0 || warningDays > 90) {
      toast.error('Expiration warning must be a whole number between 0 and 90 days')
      return
    }
    void save('regional', {
      currency: drafts.regional.currency,
      expirationWarningDays: warningDays,
      theme: drafts.regional.theme,
      sounds: drafts.regional.sounds
    })
  }

  const saveRfid = (): void => {
    const deviceName = drafts.rfid.deviceName.trim()
    if (!deviceName) {
      toast.error('Enter the reader device name')
      return
    }
    if (drafts.rfid.mode === 'SERIAL') {
      const baudRate = Number(drafts.rfid.baudRate)
      if (!drafts.rfid.serialPort.trim()) {
        toast.error('Enter the serial port of the reader (e.g. COM3)')
        return
      }
      if (!Number.isInteger(baudRate) || baudRate <= 0) {
        toast.error('Baud rate must be a positive whole number')
        return
      }
    }
    if (drafts.rfid.mode === 'TCP') {
      const tcpPort = Number(drafts.rfid.tcpPort)
      if (!drafts.rfid.tcpHost.trim()) {
        toast.error('Enter the reader IP address or host name')
        return
      }
      if (!Number.isInteger(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
        toast.error('TCP port must be a whole number between 1 and 65535')
        return
      }
    }
    const rfid: RfidSettings = {
      mode: drafts.rfid.mode,
      deviceName,
      parser: drafts.rfid.parser,
      serialPort: drafts.rfid.serialPort.trim(),
      baudRate: Number(drafts.rfid.baudRate) || settings.rfid.baudRate,
      tcpHost: drafts.rfid.tcpHost.trim(),
      tcpPort: Number(drafts.rfid.tcpPort) || settings.rfid.tcpPort
    }
    void save('rfid', { rfid })
  }

  const saveTurnstile = (): void => {
    const deviceName = drafts.turnstile.deviceName.trim()
    if (!deviceName) {
      toast.error('Enter the turnstile device name')
      return
    }
    const openDurationSec = Number(drafts.turnstile.openDurationSec)
    if (!Number.isInteger(openDurationSec) || openDurationSec < 1 || openDurationSec > 600) {
      toast.error('Open duration must be a whole number between 1 and 600 seconds')
      return
    }
    if (drafts.turnstile.mode === 'HTTP') {
      if (!/^https?:\/\//i.test(drafts.turnstile.httpUrl.trim())) {
        toast.error('Enter a valid HTTP URL, e.g. http://192.168.1.150/api/open')
        return
      }
    }
    if (drafts.turnstile.mode === 'TCP') {
      const tcpPort = Number(drafts.turnstile.tcpPort)
      if (!drafts.turnstile.tcpHost.trim()) {
        toast.error('Enter the turnstile IP address or host name')
        return
      }
      if (!Number.isInteger(tcpPort) || tcpPort < 1 || tcpPort > 65535) {
        toast.error('TCP port must be a whole number between 1 and 65535')
        return
      }
      if (!isHexCommand(drafts.turnstile.openCommandHex) || drafts.turnstile.openCommandHex.replace(/\s+/g, '') === '') {
        toast.error('Open command must be hex bytes, e.g. A0 01 01 A2')
        return
      }
      if (!isHexCommand(drafts.turnstile.lockCommandHex)) {
        toast.error('Lock command must be hex bytes, or leave it empty if not required')
        return
      }
    }
    if (drafts.turnstile.mode === 'SERIAL_RELAY') {
      const baudRate = Number(drafts.turnstile.baudRate)
      const relayPulseMs = Number(drafts.turnstile.relayPulseMs)
      if (!drafts.turnstile.serialPort.trim()) {
        toast.error('Enter the serial port of the relay board (e.g. COM4)')
        return
      }
      if (!Number.isInteger(baudRate) || baudRate <= 0) {
        toast.error('Baud rate must be a positive whole number')
        return
      }
      if (!Number.isInteger(relayPulseMs) || relayPulseMs < 50 || relayPulseMs > 60000) {
        toast.error('Relay pulse must be between 50 and 60000 milliseconds')
        return
      }
    }
    const turnstile: TurnstileSettings = {
      mode: drafts.turnstile.mode,
      deviceName,
      openDurationSec,
      httpUrl: drafts.turnstile.httpUrl.trim(),
      httpMethod: drafts.turnstile.httpMethod,
      tcpHost: drafts.turnstile.tcpHost.trim(),
      tcpPort: Number(drafts.turnstile.tcpPort) || settings.turnstile.tcpPort,
      openCommandHex: drafts.turnstile.openCommandHex.trim(),
      lockCommandHex: drafts.turnstile.lockCommandHex.trim(),
      serialPort: drafts.turnstile.serialPort.trim(),
      baudRate: Number(drafts.turnstile.baudRate) || settings.turnstile.baudRate,
      relayPulseMs: Number(drafts.turnstile.relayPulseMs) || settings.turnstile.relayPulseMs
    }
    void save('turnstile', { turnstile })
  }

  const reconnect = async (): Promise<void> => {
    setHardwareBusy('reconnect')
    try {
      const status = await window.api.hardware.reconnect()
      toast.success('Hardware reconnected', {
        description: `Reader ${status.rfid.connected ? 'online' : 'offline'} · Turnstile ${
          status.turnstile.connected ? 'online' : 'offline'
        }`
      })
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setHardwareBusy(null)
    }
  }

  const testTurnstile = async (): Promise<void> => {
    setHardwareBusy('test')
    try {
      const result = await window.api.hardware.testOpen()
      if (result.ok) {
        toast.success('Turnstile opened', { description: result.detail })
      } else {
        toast.error('Turnstile test failed', { description: result.detail })
      }
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setHardwareBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Gym profile, currency, alerts and the RFID reader / turnstile hardware configuration."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gym information</CardTitle>
          <CardDescription>Shown on the dashboard, receipts and exported reports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Gym name" htmlFor="settings-gym-name">
            <Input
              id="settings-gym-name"
              value={drafts.gym.gymName}
              onChange={(event) => updateGym({ gymName: event.target.value })}
              placeholder="Iron Temple Fitness"
            />
          </Field>
          <Field label="Phone" htmlFor="settings-gym-phone">
            <Input
              id="settings-gym-phone"
              value={drafts.gym.gymPhone}
              onChange={(event) => updateGym({ gymPhone: event.target.value })}
              placeholder="+213 555 00 00 00"
            />
          </Field>
          <Field label="Address" htmlFor="settings-gym-address">
            <Input
              id="settings-gym-address"
              value={drafts.gym.gymAddress}
              onChange={(event) => updateGym({ gymAddress: event.target.value })}
              placeholder="12 Rue des Sports, Alger"
            />
          </Field>
          <Field
            label="Logo"
            htmlFor="settings-gym-logo"
            hint="Optional path or URL to a PNG / JPG used on the login screen and dashboard."
          >
            <Input
              id="settings-gym-logo"
              value={drafts.gym.gymLogo}
              onChange={(event) => updateGym({ gymLogo: event.target.value })}
              placeholder="C:\images\logo.png"
            />
          </Field>
        </CardContent>
        <CardFooter className="justify-between">
          <p className="text-xs text-muted-foreground">{gymDirty ? 'Unsaved changes' : 'All changes saved'}</p>
          <Button onClick={saveGym} disabled={!gymDirty || saving !== null}>
            <Save className="mr-2 size-4" />
            {saving === 'gym' ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regional &amp; alerts</CardTitle>
          <CardDescription>Currency, expiry warnings and interface preferences for this workstation.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency" htmlFor="settings-currency" hint="Used for plans, payments and reports.">
            <Select value={drafts.regional.currency} onValueChange={(value) => updateRegional({ currency: value })}>
              <SelectTrigger id="settings-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Expiration warning (days)"
            htmlFor="settings-warning-days"
            hint="Subscriptions ending within this window are highlighted on the dashboard."
          >
            <Input
              id="settings-warning-days"
              type="number"
              min={0}
              max={90}
              value={drafts.regional.expirationWarningDays}
              onChange={(event) => updateRegional({ expirationWarningDays: event.target.value })}
            />
          </Field>
          <Field label="Theme" htmlFor="settings-theme">
            <Select
              value={drafts.regional.theme}
              onValueChange={(value) => updateRegional({ theme: value as ThemeMode })}
            >
              <SelectTrigger id="settings-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THEME_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {mode === 'dark' ? 'Dark' : 'Light'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Sound feedback</p>
              <p className="text-xs text-muted-foreground">Play a chime when the turnstile grants access.</p>
            </div>
            <Switch
              checked={drafts.regional.sounds}
              onCheckedChange={(checked) => updateRegional({ sounds: checked })}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-between">
          <p className="text-xs text-muted-foreground">{regionalDirty ? 'Unsaved changes' : 'All changes saved'}</p>
          <Button onClick={saveRegional} disabled={!regionalDirty || saving !== null}>
            <Save className="mr-2 size-4" />
            {saving === 'regional' ? 'Saving…' : 'Save changes'}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">RFID reader</CardTitle>
            <CardDescription>
              How the app talks to the card reader at the entrance. Mock mode is for development without hardware.
            </CardDescription>
          </div>
          <Badge variant={hardware?.rfid.connected ? 'success' : 'destructive'}>
            {hardware?.rfid.connected ? 'Connected' : 'Offline'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reader mode" htmlFor="settings-rfid-mode">
              <Select
                value={drafts.rfid.mode}
                onValueChange={(value) => updateRfid({ mode: value as RfidReaderMode })}
                disabled={!isAdmin}
              >
                <SelectTrigger id="settings-rfid-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RFID_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {RFID_MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Device name" htmlFor="settings-rfid-device" hint="Shown in access logs as the scan source device.">
              <Input
                id="settings-rfid-device"
                value={drafts.rfid.deviceName}
                onChange={(event) => updateRfid({ deviceName: event.target.value })}
                disabled={!isAdmin}
                placeholder="READER-01"
              />
            </Field>
            {drafts.rfid.mode === 'SERIAL' ? (
              <>
                <Field label="Serial port" htmlFor="settings-rfid-port" hint="Windows COM port the reader is attached to.">
                  <Input
                    id="settings-rfid-port"
                    value={drafts.rfid.serialPort}
                    onChange={(event) => updateRfid({ serialPort: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="COM3"
                  />
                </Field>
                <Field label="Baud rate" htmlFor="settings-rfid-baud">
                  <Input
                    id="settings-rfid-baud"
                    type="number"
                    min={300}
                    value={drafts.rfid.baudRate}
                    onChange={(event) => updateRfid({ baudRate: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="9600"
                  />
                </Field>
              </>
            ) : null}
            {drafts.rfid.mode === 'TCP' ? (
              <>
                <Field label="Host / IP" htmlFor="settings-rfid-host">
                  <Input
                    id="settings-rfid-host"
                    value={drafts.rfid.tcpHost}
                    onChange={(event) => updateRfid({ tcpHost: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="192.168.1.100"
                  />
                </Field>
                <Field label="TCP port" htmlFor="settings-rfid-tcp-port">
                  <Input
                    id="settings-rfid-tcp-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={drafts.rfid.tcpPort}
                    onChange={(event) => updateRfid({ tcpPort: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="4001"
                  />
                </Field>
              </>
            ) : null}
            {drafts.rfid.mode === 'SERIAL' || drafts.rfid.mode === 'TCP' ? (
              <Field
                label="Message parser"
                htmlFor="settings-rfid-parser"
                hint="Line waits for an end-of-line character; raw accepts every chunk as a UID."
              >
                <Select
                  value={drafts.rfid.parser}
                  onValueChange={(value) => updateRfid({ parser: value as 'LINE' | 'RAW' })}
                  disabled={!isAdmin}
                >
                  <SelectTrigger id="settings-rfid-parser">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LINE">Line (end-of-line terminated)</SelectItem>
                    <SelectItem value="RAW">Raw</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Status: {hardware?.rfid.detail ?? 'unknown'} · Mode: {hardware?.rfid.mode ?? '—'}
          </p>
          {!isAdmin ? <AdminOnlyNote /> : null}
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <p className="text-xs text-muted-foreground">{rfidDirty ? 'Unsaved changes' : 'All changes saved'}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void reconnect()}
              disabled={!isAdmin || hardwareBusy !== null}
              title={isAdmin ? 'Reconnect reader and turnstile now' : 'Administrators only'}
            >
              <RefreshCw className={hardwareBusy === 'reconnect' ? 'mr-2 size-4 animate-spin' : 'mr-2 size-4'} />
              {hardwareBusy === 'reconnect' ? 'Reconnecting…' : 'Reconnect'}
            </Button>
            <Button onClick={saveRfid} disabled={!isAdmin || !rfidDirty || saving !== null}>
              <Save className="mr-2 size-4" />
              {saving === 'rfid' ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Turnstile (ZK TS1000)</CardTitle>
            <CardDescription>
              How the app opens the gate after a valid scan. The turnstile only receives an open command after the
              backend authorizes the access.
            </CardDescription>
          </div>
          <Badge variant={hardware?.turnstile.connected ? 'success' : 'destructive'}>
            {hardware?.turnstile.connected ? 'Connected' : 'Offline'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Turnstile mode" htmlFor="settings-ts-mode">
              <Select
                value={drafts.turnstile.mode}
                onValueChange={(value) => updateTurnstile({ mode: value as TurnstileMode })}
                disabled={!isAdmin}
              >
                <SelectTrigger id="settings-ts-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TURNSTILE_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {TURNSTILE_MODE_LABELS[mode]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Device name" htmlFor="settings-ts-device">
              <Input
                id="settings-ts-device"
                value={drafts.turnstile.deviceName}
                onChange={(event) => updateTurnstile({ deviceName: event.target.value })}
                disabled={!isAdmin}
                placeholder="TURNSTILE-01"
              />
            </Field>
            <Field
              label="Open duration (seconds)"
              htmlFor="settings-ts-duration"
              hint="How long the gate stays unlocked after a granted access."
            >
              <Input
                id="settings-ts-duration"
                type="number"
                min={1}
                max={600}
                value={drafts.turnstile.openDurationSec}
                onChange={(event) => updateTurnstile({ openDurationSec: event.target.value })}
                disabled={!isAdmin}
              />
            </Field>
            {drafts.turnstile.mode === 'HTTP' ? (
              <>
                <Field label="Method" htmlFor="settings-ts-http-method">
                  <Select
                    value={drafts.turnstile.httpMethod}
                    onValueChange={(value) => updateTurnstile({ httpMethod: value as 'GET' | 'POST' })}
                    disabled={!isAdmin}
                  >
                    <SelectTrigger id="settings-ts-http-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Open URL" htmlFor="settings-ts-http-url" hint="Called with the open request when access is granted.">
                  <Input
                    id="settings-ts-http-url"
                    value={drafts.turnstile.httpUrl}
                    onChange={(event) => updateTurnstile({ httpUrl: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="http://192.168.1.150/api/open"
                  />
                </Field>
              </>
            ) : null}
            {drafts.turnstile.mode === 'TCP' ? (
              <>
                <Field label="Host / IP" htmlFor="settings-ts-host">
                  <Input
                    id="settings-ts-host"
                    value={drafts.turnstile.tcpHost}
                    onChange={(event) => updateTurnstile({ tcpHost: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="192.168.1.150"
                  />
                </Field>
                <Field label="TCP port" htmlFor="settings-ts-tcp-port">
                  <Input
                    id="settings-ts-tcp-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={drafts.turnstile.tcpPort}
                    onChange={(event) => updateTurnstile({ tcpPort: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="4002"
                  />
                </Field>
                <Field
                  label="Open command (hex)"
                  htmlFor="settings-ts-open-cmd"
                  hint="Byte sequence sent to open the gate. ZK TS1000 default: A0 01 01 A2."
                >
                  <Input
                    id="settings-ts-open-cmd"
                    value={drafts.turnstile.openCommandHex}
                    onChange={(event) => updateTurnstile({ openCommandHex: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="A0 01 01 A2"
                  />
                </Field>
                <Field
                  label="Lock command (hex)"
                  htmlFor="settings-ts-lock-cmd"
                  hint="Optional. Sent after the open duration if the device expects an explicit lock."
                >
                  <Input
                    id="settings-ts-lock-cmd"
                    value={drafts.turnstile.lockCommandHex}
                    onChange={(event) => updateTurnstile({ lockCommandHex: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="Leave empty if not required"
                  />
                </Field>
              </>
            ) : null}
            {drafts.turnstile.mode === 'SERIAL_RELAY' ? (
              <>
                <Field label="Serial port" htmlFor="settings-ts-serial-port" hint="Relay board that drives the gate input.">
                  <Input
                    id="settings-ts-serial-port"
                    value={drafts.turnstile.serialPort}
                    onChange={(event) => updateTurnstile({ serialPort: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="COM4"
                  />
                </Field>
                <Field label="Baud rate" htmlFor="settings-ts-baud">
                  <Input
                    id="settings-ts-baud"
                    type="number"
                    min={300}
                    value={drafts.turnstile.baudRate}
                    onChange={(event) => updateTurnstile({ baudRate: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="9600"
                  />
                </Field>
                <Field label="Relay pulse (ms)" htmlFor="settings-ts-pulse" hint="How long the relay contact stays closed.">
                  <Input
                    id="settings-ts-pulse"
                    type="number"
                    min={50}
                    max={60000}
                    value={drafts.turnstile.relayPulseMs}
                    onChange={(event) => updateTurnstile({ relayPulseMs: event.target.value })}
                    disabled={!isAdmin}
                    placeholder="500"
                  />
                </Field>
              </>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Status: {hardware?.turnstile.detail ?? 'unknown'} · Mode: {hardware?.turnstile.mode ?? '—'}
          </p>
          {!isAdmin ? <AdminOnlyNote /> : null}
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <p className="text-xs text-muted-foreground">{turnstileDirty ? 'Unsaved changes' : 'All changes saved'}</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void testTurnstile()}
              disabled={!isAdmin || hardwareBusy !== null}
              title={isAdmin ? 'Send an open command to the turnstile' : 'Administrators only'}
            >
              <Unlock className="mr-2 size-4" />
              {hardwareBusy === 'test' ? 'Opening…' : 'Test open'}
            </Button>
            <Button onClick={saveTurnstile} disabled={!isAdmin || !turnstileDirty || saving !== null}>
              <Save className="mr-2 size-4" />
              {saving === 'turnstile' ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          The app supervises both devices continuously and retries a dropped connection every{' '}
          {HARDWARE_RECONNECT_INTERVAL_MS / 1000} seconds. Saving RFID or turnstile changes reconnects the hardware
          immediately, and every access decision is still evaluated in the backend — this screen only changes how the
          devices are reached.
        </span>
      </p>
    </div>
  )
}
