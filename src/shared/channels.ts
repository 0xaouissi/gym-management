export const CH = {
  authNeedsSetup: 'auth:needs-setup',
  authSetupAdmin: 'auth:setup-admin',
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authSession: 'auth:session',

  clientsList: 'clients:list',
  clientsGet: 'clients:get',
  clientsCreate: 'clients:create',
  clientsUpdate: 'clients:update',
  clientsDelete: 'clients:delete',
  clientsGlobalSearch: 'clients:global-search',

  plansList: 'plans:list',
  plansCreate: 'plans:create',
  plansUpdate: 'plans:update',
  plansDelete: 'plans:delete',

  subsList: 'subs:list',
  subsForClient: 'subs:for-client',
  subsCreate: 'subs:create',
  subsRenew: 'subs:renew',
  subsCancel: 'subs:cancel',
  subsSuspend: 'subs:suspend',
  subsResume: 'subs:resume',
  subsExtend: 'subs:extend',
  subsChangePlan: 'subs:change-plan',
  subsExpiring: 'subs:expiring',

  rfidList: 'rfid:list',
  rfidAssign: 'rfid:assign',
  rfidReplace: 'rfid:replace',
  rfidBlock: 'rfid:block',
  rfidUnblock: 'rfid:unblock',
  rfidMarkLost: 'rfid:mark-lost',
  rfidRevoke: 'rfid:revoke',
  rfidFind: 'rfid:find',
  rfidSetScanCapture: 'rfid:set-scan-capture',

  accessScan: 'access:scan',
  accessSimulate: 'access:simulate',
  accessLogs: 'access:logs',
  accessToday: 'access:today',
  accessRecent: 'access:recent',

  paymentsList: 'payments:list',
  paymentsCreate: 'payments:create',
  paymentsDelete: 'payments:delete',

  dashboardStats: 'dashboard:stats',

  reportsAttendance: 'reports:attendance',
  reportsRevenue: 'reports:revenue',
  reportsSubscriptions: 'reports:subscriptions',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  hardwareStatus: 'hardware:status',
  hardwareTestOpen: 'hardware:test-open',
  hardwareReconnect: 'hardware:reconnect',

  usersList: 'users:list',
  usersCreate: 'users:create',
  usersUpdate: 'users:update',
  usersResetPassword: 'users:reset-password',
  usersDelete: 'users:delete',

  auditList: 'audit:list',

  exportSave: 'export:save',
  windowSetFullscreen: 'window:set-fullscreen',

  devGenerateDemoData: 'dev:generate-demo-data'
} as const

export const EV = {
  accessResult: 'event:access-result',
  hardwareStatus: 'event:hardware-status',
  scanCaptured: 'event:scan-captured',
  dataChanged: 'event:data-changed'
} as const

export type EventChannel = (typeof EV)[keyof typeof EV]
export type DataChangeEntity =
  | 'clients'
  | 'subscriptions'
  | 'rfid'
  | 'payments'
  | 'settings'
  | 'users'
  | 'plans'
