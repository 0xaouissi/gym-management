import { BrowserWindow, dialog, ipcMain, type FileFilter } from 'electron'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { CH, EV, type DataChangeEntity } from '@shared/channels'
import type {
  ClientStatus,
  GymSettings,
  PaymentMethod,
  RfidCardStatus,
  ScanSource,
  SessionUser,
  SubscriptionStatus
} from '@shared/types'
import type { HardwareManager } from './hardware'
import type { Services } from './services'

export interface IpcDeps {
  services: Services
  hardware: HardwareManager
}

export function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

type Guard = 'none' | 'user' | 'admin'

interface Payload {
  [key: string]: unknown
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN
}

function obj(value: unknown): Payload {
  return value && typeof value === 'object' ? (value as Payload) : {}
}

const EXT_FILTERS: Record<string, FileFilter> = {
  csv: { name: 'CSV file', extensions: ['csv'] },
  xlsx: { name: 'Excel workbook', extensions: ['xlsx'] },
  xls: { name: 'Excel workbook', extensions: ['xls'] },
  pdf: { name: 'PDF document', extensions: ['pdf'] },
  json: { name: 'JSON file', extensions: ['json'] },
  txt: { name: 'Text file', extensions: ['txt'] }
}

export function registerIpcHandlers({ services, hardware }: IpcDeps): void {
  const requireSession = (): SessionUser => {
    const session = services.auth.session()
    if (!session) throw new Error('You must sign in to perform this action')
    return session
  }

  const requireAdmin = (): SessionUser => {
    const session = requireSession()
    if (session.role !== 'ADMIN') throw new Error('Only an administrator can perform this action')
    return session
  }

  const handle = <T>(channel: string, guard: Guard, fn: (payload: Payload) => T | Promise<T>): void => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (_event, raw: unknown) => {
      if (guard === 'user') requireSession()
      if (guard === 'admin') requireAdmin()
      return fn(obj(raw))
    })
  }

  const dataChanged = (entity: DataChangeEntity, ...extra: DataChangeEntity[]): void => {
    for (const item of [entity, ...extra]) broadcast(EV.dataChanged, item)
  }

  // Auth
  handle(CH.authNeedsSetup, 'none', () => services.auth.needsSetup())
  handle(CH.authSetupAdmin, 'none', (payload) => {
    const result = services.auth.setupAdmin({
      username: str(payload.username),
      password: str(payload.password),
      fullName: str(payload.fullName)
    })
    const gymName = str(payload.gymName).trim()
    if (result.ok && gymName) services.settings.update({ gymName })
    return result
  })
  handle(CH.authLogin, 'none', (payload) => services.auth.login(str(payload.username), str(payload.password)))
  handle(CH.authLogout, 'none', () => {
    services.auth.logout()
  })
  handle(CH.authSession, 'none', () => services.auth.session())

  // Clients
  handle(CH.clientsList, 'user', (payload) =>
    services.clients.list({
      search: str(payload.search),
      status: (payload.status as ClientStatus | 'ALL') ?? 'ALL',
      subscriptionFilter: payload.subscriptionFilter as
        | 'ALL'
        | 'ACTIVE'
        | 'EXPIRING'
        | 'EXPIRED'
        | 'NONE'
        | 'SUSPENDED',
      page: num(payload.page) || 1,
      pageSize: num(payload.pageSize) || 25
    })
  )
  handle(CH.clientsGet, 'user', (payload) => services.clients.get(num(payload.id)))
  handle(CH.clientsCreate, 'user', (payload) => {
    const result = services.clients.create(obj(payload.input) as Parameters<Services['clients']['create']>[0])
    if (result.ok) dataChanged('clients')
    return result
  })
  handle(CH.clientsUpdate, 'user', (payload) => {
    const result = services.clients.update(
      num(payload.id),
      obj(payload.input) as Parameters<Services['clients']['update']>[1]
    )
    if (result.ok) dataChanged('clients')
    return result
  })
  handle(CH.clientsDelete, 'user', (payload) => {
    const result = services.clients.delete(num(payload.id))
    if (result.ok) dataChanged('clients')
    return result
  })
  handle(CH.clientsGlobalSearch, 'user', (payload) => services.clients.globalSearch(str(payload.query)))

  // Plans
  handle(CH.plansList, 'user', (payload) => services.plans.list(Boolean(payload.includeInactive)))
  handle(CH.plansCreate, 'user', (payload) => {
    const result = services.plans.create(obj(payload.input) as Parameters<Services['plans']['create']>[0])
    if (result.ok) dataChanged('plans')
    return result
  })
  handle(CH.plansUpdate, 'user', (payload) => {
    const result = services.plans.update(
      num(payload.id),
      obj(payload.input) as Parameters<Services['plans']['update']>[1]
    )
    if (result.ok) dataChanged('plans')
    return result
  })
  handle(CH.plansDelete, 'user', (payload) => {
    const result = services.plans.delete(num(payload.id))
    if (result.ok) dataChanged('plans')
    return result
  })

  // Subscriptions
  handle(CH.subsList, 'user', (payload) =>
    services.subscriptions.list({
      search: str(payload.search),
      status: (payload.status as SubscriptionStatus | 'ALL') ?? 'ALL',
      expiringOnly: Boolean(payload.expiringOnly),
      page: num(payload.page) || 1,
      pageSize: num(payload.pageSize) || 25
    })
  )
  handle(CH.subsForClient, 'user', (payload) => services.subscriptions.forClient(num(payload.clientId)))
  handle(CH.subsCreate, 'user', (payload) => {
    const result = services.subscriptions.create(
      obj(payload.input) as Parameters<Services['subscriptions']['create']>[0]
    )
    if (result.ok) dataChanged('subscriptions', 'clients')
    return result
  })
  handle(CH.subsRenew, 'user', (payload) => {
    const result = services.subscriptions.renew(
      obj(payload.input) as Parameters<Services['subscriptions']['renew']>[0]
    )
    if (result.ok) dataChanged('subscriptions', 'clients', 'payments')
    return result
  })
  handle(CH.subsCancel, 'user', (payload) => {
    const result = services.subscriptions.cancel(num(payload.id), str(payload.reason) || undefined)
    if (result.ok) dataChanged('subscriptions', 'clients')
    return result
  })
  handle(CH.subsSuspend, 'user', (payload) => {
    const result = services.subscriptions.suspend(num(payload.id), str(payload.reason) || undefined)
    if (result.ok) dataChanged('subscriptions', 'clients')
    return result
  })
  handle(CH.subsResume, 'user', (payload) => {
    const result = services.subscriptions.resume(num(payload.id))
    if (result.ok) dataChanged('subscriptions', 'clients')
    return result
  })
  handle(CH.subsExtend, 'user', (payload) => {
    const result = services.subscriptions.extend(num(payload.id), num(payload.days))
    if (result.ok) dataChanged('subscriptions', 'clients')
    return result
  })
  handle(CH.subsChangePlan, 'user', (payload) => {
    const result = services.subscriptions.changePlan(
      num(payload.id),
      num(payload.planId),
      Boolean(payload.recalculateEndDate)
    )
    if (result.ok) dataChanged('subscriptions', 'clients')
    return result
  })
  handle(CH.subsExpiring, 'user', (payload) => services.subscriptions.expiring(num(payload.withinDays) || 7))

  // RFID cards
  handle(CH.rfidList, 'user', (payload) =>
    services.rfid.list({
      status: (payload.status as RfidCardStatus | 'ALL') ?? 'ALL',
      search: str(payload.search)
    })
  )
  handle(CH.rfidAssign, 'user', (payload) => {
    const result = services.rfid.assign({
      clientId: num(payload.clientId),
      uid: str(payload.uid),
      cardNumber: str(payload.cardNumber) || null
    })
    if (result.ok) dataChanged('rfid', 'clients')
    return result
  })
  handle(CH.rfidReplace, 'user', (payload) => {
    const result = services.rfid.replace({
      clientId: num(payload.clientId),
      newUid: str(payload.newUid),
      cardNumber: str(payload.cardNumber) || null
    })
    if (result.ok) dataChanged('rfid', 'clients')
    return result
  })
  handle(CH.rfidBlock, 'user', (payload) => {
    const result = services.rfid.block(num(payload.id))
    if (result.ok) dataChanged('rfid', 'clients')
    return result
  })
  handle(CH.rfidUnblock, 'user', (payload) => {
    const result = services.rfid.unblock(num(payload.id))
    if (result.ok) dataChanged('rfid', 'clients')
    return result
  })
  handle(CH.rfidMarkLost, 'user', (payload) => {
    const result = services.rfid.markLost(num(payload.id))
    if (result.ok) dataChanged('rfid', 'clients')
    return result
  })
  handle(CH.rfidRevoke, 'user', (payload) => {
    const result = services.rfid.revoke(num(payload.id))
    if (result.ok) dataChanged('rfid', 'clients')
    return result
  })
  handle(CH.rfidFind, 'user', (payload) => services.rfid.findByUid(str(payload.uid)))
  handle(CH.rfidSetScanCapture, 'user', (payload) => {
    hardware.setScanCapture(Boolean(payload.active))
  })

  // Access control
  handle(CH.accessScan, 'user', async (payload) => {
    const outcome = await hardware.handleScan(str(payload.uid), (payload.source as ScanSource) ?? 'KEYBOARD')
    if (outcome) broadcast(EV.accessResult, outcome)
    return outcome
  })
  handle(CH.accessSimulate, 'user', async (payload) => {
    const outcome = await hardware.simulateScan(str(payload.uid) || undefined)
    broadcast(EV.accessResult, outcome)
    return outcome
  })
  handle(CH.accessLogs, 'user', (payload) =>
    services.access.logs({
      from: str(payload.from) || undefined,
      to: str(payload.to) || undefined,
      result: (payload.result as 'ALLOWED' | 'DENIED' | 'ALL') ?? 'ALL',
      search: str(payload.search),
      clientId: typeof payload.clientId === 'number' ? payload.clientId : undefined,
      page: num(payload.page) || 1,
      pageSize: num(payload.pageSize) || 25
    })
  )
  handle(CH.accessToday, 'user', () => services.access.today())
  handle(CH.accessRecent, 'user', (payload) => services.access.recent(num(payload.limit) || 20))

  // Payments
  handle(CH.paymentsList, 'user', (payload) =>
    services.payments.list({
      from: str(payload.from) || undefined,
      to: str(payload.to) || undefined,
      method: (payload.method as PaymentMethod | 'ALL') ?? 'ALL',
      search: str(payload.search),
      page: num(payload.page) || 1,
      pageSize: num(payload.pageSize) || 25
    })
  )
  handle(CH.paymentsCreate, 'user', (payload) => {
    const result = services.payments.create(
      obj(payload.input) as Parameters<Services['payments']['create']>[0]
    )
    if (result.ok) dataChanged('payments', 'subscriptions')
    return result
  })
  handle(CH.paymentsDelete, 'user', (payload) => {
    const result = services.payments.delete(num(payload.id))
    if (result.ok) dataChanged('payments', 'subscriptions')
    return result
  })

  // Dashboard & reports
  handle(CH.dashboardStats, 'user', () => services.dashboard.stats())
  handle(CH.reportsAttendance, 'user', (payload) =>
    services.reports.attendance({
      from: str(payload.from),
      to: str(payload.to),
      groupBy: (payload.groupBy as 'DAY' | 'WEEK' | 'MONTH') ?? 'DAY'
    })
  )
  handle(CH.reportsRevenue, 'user', (payload) =>
    services.reports.revenue({
      from: str(payload.from),
      to: str(payload.to),
      groupBy: (payload.groupBy as 'DAY' | 'WEEK' | 'MONTH' | 'YEAR') ?? 'DAY'
    })
  )
  handle(CH.reportsSubscriptions, 'user', (payload) =>
    services.reports.subscriptions({ from: str(payload.from), to: str(payload.to) })
  )

  // Settings
  handle(CH.settingsGet, 'user', () => services.settings.get())
  handle(CH.settingsUpdate, 'user', async (payload) => {
    const patch = obj(payload.patch) as Partial<GymSettings>
    const touchesHardware = Boolean(patch.rfid || patch.turnstile)
    if (touchesHardware) requireAdmin()
    const updated = services.settings.update(patch)
    if (touchesHardware) {
      await hardware.reconnect()
      broadcast(EV.hardwareStatus, hardware.getStatus())
    }
    dataChanged('settings')
    return updated
  })

  // Hardware
  handle(CH.hardwareStatus, 'user', () => hardware.getStatus())
  handle(CH.hardwareTestOpen, 'admin', () => hardware.testOpen())
  handle(CH.hardwareReconnect, 'admin', () => hardware.reconnect())

  // Users
  handle(CH.usersList, 'admin', () => services.users.list())
  handle(CH.usersCreate, 'admin', (payload) =>
    services.users.create(obj(payload.input) as Parameters<Services['users']['create']>[0])
  )
  handle(CH.usersUpdate, 'admin', (payload) => {
    const result = services.users.update(
      num(payload.id),
      obj(payload.patch) as Parameters<Services['users']['update']>[1]
    )
    if (result.ok) dataChanged('users')
    return result
  })
  handle(CH.usersResetPassword, 'admin', (payload) =>
    services.users.resetPassword(num(payload.id), str(payload.newPassword))
  )
  handle(CH.usersDelete, 'admin', (payload) => {
    const session = requireAdmin()
    const result = services.users.delete(num(payload.id), session.id)
    if (result.ok) dataChanged('users')
    return result
  })

  // Audit
  handle(CH.auditList, 'admin', (payload) =>
    services.audit.list({
      search: str(payload.search),
      page: num(payload.page) || 1,
      pageSize: num(payload.pageSize) || 25
    })
  )

  // Exports
  handle(CH.exportSave, 'user', async (payload) => {
    const filename = str(payload.filename) || 'export.txt'
    const content = payload.content
    if (typeof content !== 'string' && !(content instanceof Uint8Array)) {
      return { ok: false, error: 'Nothing to export' }
    }
    const extension = path.extname(filename).replace('.', '').toLowerCase()
    const filters = EXT_FILTERS[extension] ? [EXT_FILTERS[extension]] : undefined
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = win
      ? await dialog.showSaveDialog(win, { title: 'Save export', defaultPath: filename, filters })
      : await dialog.showSaveDialog({ title: 'Save export', defaultPath: filename, filters })
    if (result.canceled || !result.filePath) return { ok: false, error: 'Save cancelled' }
    await writeFile(result.filePath, content)
    return { ok: true, data: { path: result.filePath } }
  })

  // Window
  handle(CH.windowSetFullscreen, 'none', (payload) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    if (!win) return false
    win.setFullScreen(Boolean(payload.fullscreen))
    return win.isFullScreen()
  })

  // Developer tools
  handle(CH.devGenerateDemoData, 'admin', () => {
    const result = services.demo.generate()
    if (result.ok) dataChanged('clients', 'subscriptions', 'rfid', 'payments')
    return result
  })
}
