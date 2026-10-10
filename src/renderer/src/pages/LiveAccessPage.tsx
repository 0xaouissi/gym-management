import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  Ban,
  CheckCircle2,
  CircleSlash,
  DoorOpen,
  KeyRound,
  ScanLine,
  Send,
  ShieldAlert,
  XCircle,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'
import type { AccessLog, AccessScanOutcome } from '@shared/types'
import { ACCESS_REASON_LABELS, MOCK_DEFAULT_UID } from '@shared/constants'
import { formatDate, formatTime } from '@shared/utils'
import { useAsyncData } from '@renderer/hooks/useAsyncData'
import { useHardwareStatus } from '@renderer/hooks/useHardwareStatus'
import { useSession } from '@renderer/hooks/useSession'
import { describeError } from '@renderer/lib/utils'
import { PageHeader } from '@renderer/components/ui/page-header'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { AccessResultBadge } from '@renderer/components/ui/status-badges'
import { EmptyState } from '@renderer/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { cn } from '@renderer/lib/utils'

interface VerdictView {
  title: string
  subtitle: string
  detail?: string
  wrapper: string
  icon: React.JSX.Element
}

function verdictFor(outcome: AccessScanOutcome): VerdictView {
  const { decision } = outcome
  const reason = ACCESS_REASON_LABELS[decision.reason]

  if (decision.allowed) {
    return {
      title: 'ACCESS GRANTED',
      subtitle: decision.clientName ?? outcome.uid,
      detail: decision.subscriptionEndDate
        ? `Subscription valid until ${formatDate(decision.subscriptionEndDate)}`
        : undefined,
      wrapper: 'border-success/50 bg-success/15 text-success',
      icon: <CheckCircle2 className="size-14" />
    }
  }

  if (decision.reason === 'UNKNOWN_CARD') {
    return {
      title: 'UNKNOWN CARD',
      subtitle: outcome.uid,
      detail: 'This card is not registered to any client.',
      wrapper: 'border-warning/50 bg-warning/15 text-warning',
      icon: <CircleSlash className="size-14" />
    }
  }

  return {
    title: 'ACCESS DENIED',
    subtitle: decision.clientName ?? outcome.uid,
    detail: reason,
    wrapper: 'border-destructive/50 bg-destructive/15 text-destructive',
    icon: <XCircle className="size-14" />
  }
}

export function LiveAccessPage(): React.JSX.Element {
  const { user } = useSession()
  const hardware = useHardwareStatus()
  const [outcome, setOutcome] = useState<AccessScanOutcome | null>(null)
  const [manualUid, setManualUid] = useState('')
  const [simulateUid, setSimulateUid] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [pulseKey, setPulseKey] = useState(0)
  const recent = useAsyncData<AccessLog[]>(() => window.api.access.recent(15), [], { live: true })

  const gotOutcome = useRef<(value: AccessScanOutcome) => void>(() => {})
  gotOutcome.current = (value: AccessScanOutcome) => {
    setOutcome(value)
    setPulseKey((key) => key + 1)
  }

  useEffect(() => {
    return window.api.onAccessResult((next) => gotOutcome.current(next))
  }, [])

  const simulate = async (): Promise<void> => {
    setBusy(true)
    try {
      await window.api.access.simulate(simulateUid.trim() || MOCK_DEFAULT_UID)
      await recent.refresh()
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const submitManual = async (): Promise<void> => {
    const uid = manualUid.trim()
    if (!uid) return
    setManualUid('')
    setBusy(true)
    try {
      await window.api.access.scan(uid, 'MANUAL')
      await recent.refresh()
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  const testTurnstile = async (): Promise<void> => {
    setTesting(true)
    try {
      const result = await window.api.hardware.testOpen()
      if (result.ok) toast.success('Turnstile opened', { description: result.detail })
      else toast.error('Turnstile test failed', { description: result.detail })
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setTesting(false)
    }
  }

  const verdict = outcome ? verdictFor(outcome) : null

  return (
    <div className="space-y-5">
      <PageHeader
        title="Live Access"
        description="Every scan is validated in the backend before the turnstile opens."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void testTurnstile()} disabled={testing}>
              <DoorOpen className="size-4" />
              {testing ? 'Testing…' : 'Test Turnstile'}
            </Button>
            <Button size="sm" onClick={() => void simulate()} disabled={busy}>
              <Zap className="size-4" />
              Simulate RFID Scan
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div
          key={pulseKey}
          className={cn(
            'fm-overlay flex min-h-72 flex-col items-center justify-center gap-3 rounded-2xl border-2 p-8 text-center',
            verdict ? verdict.wrapper : 'border-dashed border-border bg-card/50 text-muted-foreground'
          )}
        >
          {verdict ? (
            <>
              <div className={outcome?.decision.allowed ? 'pulse-ring rounded-full' : ''}>{verdict.icon}</div>
              <p className="text-3xl font-bold tracking-tight sm:text-4xl">{verdict.title}</p>
              <p className="text-lg font-medium">{verdict.subtitle}</p>
              {verdict.detail ? <p className="text-sm opacity-90">{verdict.detail}</p> : null}
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs">
                <Badge variant="outline" className="font-mono">{outcome?.uid}</Badge>
                <Badge variant="outline">{outcome?.source}</Badge>
                <Badge variant={outcome?.turnstileOpened ? 'success' : 'muted'}>
                  {outcome?.turnstileOpened ? 'Turnstile opened' : 'Turnstile closed'}
                </Badge>
                {outcome?.turnstileError ? <Badge variant="warning">{outcome.turnstileError}</Badge> : null}
                <Badge variant="outline">{outcome ? formatTime(outcome.timestamp) : ''}</Badge>
              </div>
            </>
          ) : (
            <>
              <div className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-border">
                <ScanLine className="size-7" />
              </div>
              <p className="text-lg font-semibold">WAITING FOR A CARD</p>
              <p className="text-sm">Scan an RFID card, simulate a scan, or type a UID manually.</p>
            </>
          )}
        </div>

        <Card className="flex flex-col">
          <CardContent className="flex flex-1 flex-col gap-4 pt-5">
            <div className="space-y-1.5">
              <label htmlFor="manual-uid" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Manual UID entry
              </label>
              <div className="flex gap-2">
                <Input
                  id="manual-uid"
                  value={manualUid}
                  onChange={(event) => setManualUid(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitManual()
                  }}
                  placeholder="AABBCCDDEE"
                  className="font-mono"
                />
                <Button variant="secondary" onClick={() => void submitManual()} disabled={busy}>
                  <Send className="size-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Keyboard-wedge readers type the UID and press Enter — this works anywhere in the app.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="simulate-uid" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Simulated reader UID
              </label>
              <Input
                id="simulate-uid"
                value={simulateUid}
                onChange={(event) => setSimulateUid(event.target.value)}
                placeholder={MOCK_DEFAULT_UID}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the default {MOCK_DEFAULT_UID}.
              </p>
            </div>

            <div className="mt-auto space-y-2 rounded-lg border bg-card/50 p-3 text-xs">
              <p className="flex items-center gap-2 font-medium">
                <KeyRound className="size-3.5 text-primary" />
                Hardware
              </p>
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span>RFID reader · {hardware?.rfid.mode ?? '—'}</span>
                <Badge variant={hardware?.rfid.connected ? 'success' : 'destructive'}>
                  {hardware?.rfid.connected ? 'Connected' : 'Offline'}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span>Turnstile · {hardware?.turnstile.mode ?? '—'}</span>
                <Badge variant={hardware?.turnstile.connected ? 'success' : 'destructive'}>
                  {hardware?.turnstile.connected ? 'Connected' : 'Offline'}
                </Badge>
              </div>
              {user?.role !== 'ADMIN' ? (
                <p className="flex items-start gap-1.5 pt-1 text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  Only administrators can change hardware settings.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Activity className="size-4 text-primary" />
              Recent scans
            </p>
            {recent.data && recent.data.length > 0 ? (
              <p className="text-xs text-muted-foreground">{recent.data.length} latest attempts</p>
            ) : null}
          </div>

          {!recent.data || recent.data.length === 0 ? (
            <EmptyState icon={Ban} title="No access attempts recorded" description="Scans will show up here in real time." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Card UID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Device</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">{formatTime(log.timestamp)}</TableCell>
                    <TableCell className="font-mono text-xs">{log.rfidUid}</TableCell>
                    <TableCell className={verdictToneClassFromLog(log)}>{log.clientName ?? 'Unknown'}</TableCell>
                    <TableCell>
                      <AccessResultBadge result={log.result} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {ACCESS_REASON_LABELS[log.reason]}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{log.deviceId ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function verdictToneClassFromLog(log: AccessLog): string {
  if (log.result === 'ALLOWED') return 'font-medium text-success'
  if (log.reason === 'UNKNOWN_CARD') return 'text-warning'
  return ''
}
