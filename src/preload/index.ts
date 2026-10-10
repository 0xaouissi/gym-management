import { contextBridge, ipcRenderer } from 'electron'
import { CH, EV, type EventChannel } from '@shared/channels'
import type { GymApi } from '@shared/api'

function invoke(channel: string, payload?: unknown): Promise<any> {
  return ipcRenderer.invoke(channel, payload)
}

function subscribe<T>(channel: EventChannel, listener: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown): void => {
    listener(payload as T)
  }
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: GymApi = {
  auth: {
    needsSetup: () => invoke(CH.authNeedsSetup),
    setupAdmin: (payload) => invoke(CH.authSetupAdmin, payload),
    login: (username, password) => invoke(CH.authLogin, { username, password }),
    logout: () => invoke(CH.authLogout),
    session: () => invoke(CH.authSession)
  },
  clients: {
    list: (params) => invoke(CH.clientsList, params),
    get: (id) => invoke(CH.clientsGet, { id }),
    create: (input) => invoke(CH.clientsCreate, { input }),
    update: (id, input) => invoke(CH.clientsUpdate, { id, input }),
    delete: (id) => invoke(CH.clientsDelete, { id }),
    globalSearch: (query) => invoke(CH.clientsGlobalSearch, { query })
  },
  plans: {
    list: (includeInactive) => invoke(CH.plansList, { includeInactive }),
    create: (input) => invoke(CH.plansCreate, { input }),
    update: (id, input) => invoke(CH.plansUpdate, { id, input }),
    delete: (id) => invoke(CH.plansDelete, { id })
  },
  subs: {
    list: (params) => invoke(CH.subsList, params),
    forClient: (clientId) => invoke(CH.subsForClient, { clientId }),
    create: (input) => invoke(CH.subsCreate, { input }),
    renew: (input) => invoke(CH.subsRenew, { input }),
    cancel: (id, reason) => invoke(CH.subsCancel, { id, reason }),
    suspend: (id, reason) => invoke(CH.subsSuspend, { id, reason }),
    resume: (id) => invoke(CH.subsResume, { id }),
    extend: (id, days) => invoke(CH.subsExtend, { id, days }),
    changePlan: (id, planId, recalculateEndDate) => invoke(CH.subsChangePlan, { id, planId, recalculateEndDate }),
    expiring: (withinDays) => invoke(CH.subsExpiring, { withinDays })
  },
  rfid: {
    list: (params) => invoke(CH.rfidList, params),
    assign: (payload) => invoke(CH.rfidAssign, payload),
    replace: (payload) => invoke(CH.rfidReplace, payload),
    block: (cardId) => invoke(CH.rfidBlock, { id: cardId }),
    unblock: (cardId) => invoke(CH.rfidUnblock, { id: cardId }),
    markLost: (cardId) => invoke(CH.rfidMarkLost, { id: cardId }),
    revoke: (cardId) => invoke(CH.rfidRevoke, { id: cardId }),
    find: (uid) => invoke(CH.rfidFind, { uid }),
    setScanCapture: (active) => invoke(CH.rfidSetScanCapture, { active })
  },
  access: {
    scan: (uid, source) => invoke(CH.accessScan, { uid, source }),
    simulate: (uid) => invoke(CH.accessSimulate, { uid }),
    logs: (params) => invoke(CH.accessLogs, params),
    today: () => invoke(CH.accessToday),
    recent: (limit) => invoke(CH.accessRecent, { limit })
  },
  payments: {
    list: (params) => invoke(CH.paymentsList, params),
    create: (input) => invoke(CH.paymentsCreate, { input }),
    delete: (id) => invoke(CH.paymentsDelete, { id })
  },
  dashboard: {
    stats: () => invoke(CH.dashboardStats)
  },
  reports: {
    attendance: (params) => invoke(CH.reportsAttendance, params),
    revenue: (params) => invoke(CH.reportsRevenue, params),
    subscriptions: (params) => invoke(CH.reportsSubscriptions, params)
  },
  settings: {
    get: () => invoke(CH.settingsGet),
    update: (patch) => invoke(CH.settingsUpdate, { patch })
  },
  hardware: {
    status: () => invoke(CH.hardwareStatus),
    testOpen: () => invoke(CH.hardwareTestOpen),
    reconnect: () => invoke(CH.hardwareReconnect)
  },
  users: {
    list: () => invoke(CH.usersList),
    create: (payload) => invoke(CH.usersCreate, payload),
    update: (id, patch) => invoke(CH.usersUpdate, { id, patch }),
    resetPassword: (id, newPassword) => invoke(CH.usersResetPassword, { id, newPassword }),
    delete: (id) => invoke(CH.usersDelete, { id })
  },
  audit: {
    list: (params) => invoke(CH.auditList, params)
  },
  exports: {
    save: (payload) => invoke(CH.exportSave, payload)
  },
  window: {
    setFullscreen: (fullscreen) => invoke(CH.windowSetFullscreen, { fullscreen })
  },
  dev: {
    generateDemoData: () => invoke(CH.devGenerateDemoData)
  },
  on: (channel, listener) => subscribe(channel, listener),
  onAccessResult: (listener) => subscribe(EV.accessResult, listener),
  onHardwareStatus: (listener) => subscribe(EV.hardwareStatus, listener),
  onScanCaptured: (listener) => subscribe(EV.scanCaptured, listener),
  onDataChanged: (listener) => subscribe(EV.dataChanged, listener)
}

contextBridge.exposeInMainWorld('api', api)
