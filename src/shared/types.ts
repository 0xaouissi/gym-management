export type Role = 'ADMIN' | 'RECEPTIONIST'
export type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED'
export type RfidCardStatus = 'ACTIVE' | 'BLOCKED' | 'LOST' | 'REVOKED'
export type SubscriptionStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED'
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID'
export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'OTHER'
export type AccessResult = 'ALLOWED' | 'DENIED'
export type DurationUnit = 'DAYS' | 'WEEKS' | 'MONTHS'

export type AllowReason = 'ACTIVE_SUBSCRIPTION'
export type DenyReason =
  | 'UNKNOWN_CARD'
  | 'CARD_BLOCKED'
  | 'CARD_REVOKED'
  | 'CARD_LOST'
  | 'CLIENT_BLOCKED'
  | 'CLIENT_INACTIVE'
  | 'NO_SUBSCRIPTION'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_SUSPENDED'
  | 'SUBSCRIPTION_CANCELLED'
export type AccessReason = AllowReason | DenyReason

export interface SessionUser {
  id: number
  username: string
  fullName: string
  role: Role
}

export interface User extends SessionUser {
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Client {
  id: number
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  dateOfBirth: string | null
  address: string | null
  photo: string | null
  notes: string | null
  rfidUid: string | null
  status: ClientStatus
  createdAt: string
  updatedAt: string
}

export interface RfidCard {
  id: number
  uid: string
  cardNumber: string | null
  clientId: number
  status: RfidCardStatus
  issuedAt: string
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface RfidCardWithClient extends RfidCard {
  clientName: string
  clientStatus: ClientStatus
}

export interface SubscriptionPlan {
  id: number
  name: string
  description: string | null
  durationValue: number
  durationUnit: DurationUnit
  price: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface Subscription {
  id: number
  clientId: number
  planId: number
  startDate: string
  endDate: string
  status: SubscriptionStatus
  price: number
  paymentStatus: PaymentStatus
  isRenewal: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface SubscriptionWithDetails extends Subscription {
  planName: string
  planDurationValue: number
  planDurationUnit: DurationUnit
  clientName: string
  paidAmount: number
  outstanding: number
}

export interface ClientListItem extends Client {
  currentSubscription: SubscriptionWithDetails | null
}

export interface Payment {
  id: number
  clientId: number
  subscriptionId: number | null
  amount: number
  paymentDate: string
  paymentMethod: PaymentMethod
  reference: string | null
  notes: string | null
  createdAt: string
}

export interface PaymentWithDetails extends Payment {
  clientName: string
  planName: string | null
}

export interface AccessLog {
  id: number
  clientId: number | null
  clientName: string | null
  rfidUid: string
  timestamp: string
  result: AccessResult
  reason: AccessReason
  subscriptionId: number | null
  deviceId: string | null
}

export interface AuditLog {
  id: number
  userId: number | null
  username: string
  action: string
  entity: string
  entityId: string | null
  details: string | null
  timestamp: string
}

export interface ClientDetail extends Client {
  rfidCard: RfidCard | null
  rfidCards: RfidCard[]
  currentSubscription: SubscriptionWithDetails | null
  subscriptions: SubscriptionWithDetails[]
  payments: PaymentWithDetails[]
  recentAccess: AccessLog[]
  totals: { totalPaid: number; outstanding: number }
}

export interface AccessDecision {
  allowed: boolean
  reason: AccessReason
  clientId?: number
  clientName?: string
  cardId?: number
  subscriptionId?: number
  subscriptionEndDate?: string
}

export type ScanSource = 'MOCK' | 'KEYBOARD' | 'SERIAL' | 'TCP' | 'SIMULATED' | 'MANUAL'

export interface AccessScanOutcome {
  decision: AccessDecision
  uid: string
  timestamp: string
  logId: number
  source: ScanSource
  deviceId: string | null
  turnstileOpened: boolean
  turnstileError?: string
}

export type RfidReaderMode = 'MOCK' | 'KEYBOARD' | 'SERIAL' | 'TCP'
export type TurnstileMode = 'MOCK' | 'HTTP' | 'TCP' | 'SERIAL_RELAY'

export interface RfidSettings {
  mode: RfidReaderMode
  deviceName: string
  serialPort: string
  baudRate: number
  tcpHost: string
  tcpPort: number
  parser: 'LINE' | 'RAW'
}

export interface TurnstileSettings {
  mode: TurnstileMode
  deviceName: string
  openDurationSec: number
  httpUrl: string
  httpMethod: 'GET' | 'POST'
  tcpHost: string
  tcpPort: number
  openCommandHex: string
  lockCommandHex: string
  serialPort: string
  baudRate: number
  relayPulseMs: number
}

export type ThemeMode = 'dark' | 'light'

export interface GymSettings {
  gymName: string
  gymAddress: string
  gymPhone: string
  gymLogo: string
  currency: string
  expirationWarningDays: number
  theme: ThemeMode
  sounds: boolean
  rfid: RfidSettings
  turnstile: TurnstileSettings
}

export interface HardwareStatus {
  rfid: { mode: RfidReaderMode; connected: boolean; detail: string }
  turnstile: { mode: TurnstileMode; connected: boolean; detail: string }
  database: { connected: boolean; detail: string }
}

export interface DashboardStats {
  totalClients: number
  activeClients: number
  blockedClients: number
  activeSubscriptions: number
  expiredSubscriptions: number
  expiringSoon: number
  todayEntries: number
  todayDenied: number
  todayRevenue: number
  monthRevenue: number
  totalRevenue: number
  expiringBuckets: { expired: number; today: number; in1: number; in3: number; in7: number }
  entriesByDay: { date: string; allowed: number; denied: number }[]
  revenueByMonth: { month: string; amount: number }[]
}

export interface ExpiringSubscription {
  subscriptionId: number
  clientId: number
  clientName: string
  planName: string
  endDate: string
  daysLeft: number
}

export interface ListParams {
  search?: string
  status?: string
  page?: number
  pageSize?: number
}

export interface Paged<T> {
  items: T[]
  total: number
}

export interface ReportRow {
  period: string
  [key: string]: string | number
}

export interface LoginResult {
  ok: boolean
  user?: SessionUser
  error?: string
}

export interface ActionResult<T = void> {
  ok: boolean
  error?: string
  data?: T
}

export interface TurnstileTestResult {
  ok: boolean
  detail: string
}
