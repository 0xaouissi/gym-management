import type { DataChangeEntity, EventChannel } from './channels'
import type {
  AccessLog,
  AccessScanOutcome,
  ActionResult,
  AuditLog,
  Client,
  ClientDetail,
  ClientListItem,
  DashboardStats,
  DurationUnit,
  ExpiringSubscription,
  GymSettings,
  HardwareStatus,
  LoginResult,
  Paged,
  Payment,
  PaymentMethod,
  PaymentWithDetails,
  ReportRow,
  RfidCardWithClient,
  SessionUser,
  SubscriptionPlan,
  SubscriptionWithDetails,
  TurnstileTestResult,
  User,
  Role,
  ClientStatus,
  RfidCardStatus,
  SubscriptionStatus,
  ScanSource,
  AccessResult
} from './types'

export interface ClientInput {
  firstName: string
  lastName: string
  phone?: string | null
  email?: string | null
  dateOfBirth?: string | null
  address?: string | null
  photo?: string | null
  notes?: string | null
  status?: ClientStatus
  rfidUid?: string | null
}

export interface PaymentInput {
  clientId: number
  subscriptionId?: number | null
  amount: number
  paymentDate?: string
  paymentMethod: PaymentMethod
  reference?: string | null
  notes?: string | null
}

export interface SubscriptionCreateInput {
  clientId: number
  planId: number
  startDate?: string
  /** Number of calendar months the subscription should last (multiplies the plan price). */
  months?: number
  price?: number
  notes?: string | null
  payment?: {
    amount: number
    paymentMethod: PaymentMethod
    reference?: string | null
  } | null
}

export interface SubscriptionRenewInput {
  subscriptionId: number
  planId?: number
  /** Number of calendar months the renewal should last (multiplies the plan price). */
  months?: number
  price?: number
  payment?: {
    amount: number
    paymentMethod: PaymentMethod
    reference?: string | null
  } | null
}

export interface PlanInput {
  name: string
  description?: string | null
  durationValue: number
  durationUnit: DurationUnit
  price: number
  isActive?: boolean
}

export interface GymApi {
  auth: {
    needsSetup(): Promise<boolean>
    setupAdmin(payload: { username: string; password: string; fullName: string; gymName?: string }): Promise<LoginResult>
    login(username: string, password: string): Promise<LoginResult>
    logout(): Promise<void>
    session(): Promise<SessionUser | null>
  }
  clients: {
    list(params: {
      search?: string
      status?: ClientStatus | 'ALL'
      subscriptionFilter?: 'ALL' | 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'NONE' | 'SUSPENDED'
      page?: number
      pageSize?: number
    }): Promise<Paged<ClientListItem>>
    get(id: number): Promise<ClientDetail | null>
    create(input: ClientInput): Promise<ActionResult<Client>>
    update(id: number, input: Partial<ClientInput>): Promise<ActionResult<Client>>
    delete(id: number): Promise<ActionResult>
    globalSearch(query: string): Promise<ClientListItem[]>
  }
  plans: {
    list(includeInactive?: boolean): Promise<SubscriptionPlan[]>
    create(input: PlanInput): Promise<ActionResult<SubscriptionPlan>>
    update(id: number, input: Partial<PlanInput>): Promise<ActionResult<SubscriptionPlan>>
    delete(id: number): Promise<ActionResult>
  }
  subs: {
    list(params: {
      search?: string
      status?: SubscriptionStatus | 'ALL'
      expiringOnly?: boolean
      page?: number
      pageSize?: number
    }): Promise<Paged<SubscriptionWithDetails>>
    forClient(clientId: number): Promise<SubscriptionWithDetails[]>
    create(input: SubscriptionCreateInput): Promise<ActionResult<SubscriptionWithDetails>>
    renew(input: SubscriptionRenewInput): Promise<ActionResult<SubscriptionWithDetails>>
    cancel(id: number, reason?: string): Promise<ActionResult>
    suspend(id: number, reason?: string): Promise<ActionResult>
    resume(id: number): Promise<ActionResult>
    extend(id: number, days: number): Promise<ActionResult>
    changePlan(id: number, planId: number, recalculateEndDate: boolean): Promise<ActionResult>
    expiring(withinDays: number): Promise<ExpiringSubscription[]>
  }
  rfid: {
    list(params: { status?: RfidCardStatus | 'ALL'; search?: string }): Promise<RfidCardWithClient[]>
    assign(payload: { clientId: number; uid: string; cardNumber?: string | null }): Promise<ActionResult<RfidCardWithClient>>
    replace(payload: { clientId: number; newUid: string; cardNumber?: string | null }): Promise<ActionResult<RfidCardWithClient>>
    block(cardId: number): Promise<ActionResult>
    unblock(cardId: number): Promise<ActionResult>
    markLost(cardId: number): Promise<ActionResult>
    revoke(cardId: number): Promise<ActionResult>
    find(uid: string): Promise<RfidCardWithClient | null>
    setScanCapture(active: boolean): Promise<void>
  }
  access: {
    /** Returns null when the scan was consumed by RFID card capture mode instead of access control. */
    scan(uid: string, source?: ScanSource): Promise<AccessScanOutcome | null>
    simulate(uid?: string): Promise<AccessScanOutcome>
    logs(params: {
      from?: string
      to?: string
      result?: AccessResult | 'ALL'
      search?: string
      clientId?: number
      page?: number
      pageSize?: number
    }): Promise<Paged<AccessLog>>
    today(): Promise<{ entries: number; denied: number }>
    recent(limit?: number): Promise<AccessLog[]>
  }
  payments: {
    list(params: {
      from?: string
      to?: string
      method?: PaymentMethod | 'ALL'
      search?: string
      page?: number
      pageSize?: number
    }): Promise<Paged<PaymentWithDetails>>
    create(input: PaymentInput): Promise<ActionResult<Payment>>
    delete(id: number): Promise<ActionResult>
  }
  dashboard: {
    stats(): Promise<DashboardStats>
  }
  reports: {
    attendance(params: { from: string; to: string; groupBy: 'DAY' | 'WEEK' | 'MONTH' }): Promise<ReportRow[]>
    revenue(params: { from: string; to: string; groupBy: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR' }): Promise<ReportRow[]>
    subscriptions(params: {
      from: string
      to: string
    }): Promise<{
      summary: { active: number; expired: number; suspended: number; cancelled: number; newCount: number; renewals: number }
      rows: ReportRow[]
    }>
  }
  settings: {
    get(): Promise<GymSettings>
    update(patch: Partial<GymSettings>): Promise<GymSettings>
  }
  hardware: {
    status(): Promise<HardwareStatus>
    testOpen(): Promise<TurnstileTestResult>
    reconnect(): Promise<HardwareStatus>
  }
  users: {
    list(): Promise<User[]>
    create(payload: { username: string; password: string; fullName: string; role: Role }): Promise<ActionResult<User>>
    update(id: number, patch: { fullName?: string; role?: Role; isActive?: boolean }): Promise<ActionResult<User>>
    resetPassword(id: number, newPassword: string): Promise<ActionResult>
    delete(id: number): Promise<ActionResult>
  }
  audit: {
    list(params: { search?: string; page?: number; pageSize?: number }): Promise<Paged<AuditLog>>
  }
  exports: {
    save(payload: { filename: string; content: string | Uint8Array }): Promise<ActionResult<{ path: string }>>
  }
  window: {
    setFullscreen(fullscreen: boolean): Promise<boolean>
  }
  dev: {
    generateDemoData(): Promise<ActionResult<{ clients: number; subscriptions: number; payments: number; logs: number }>>
  }
  on(channel: EventChannel, listener: (payload: unknown) => void): () => void
  onAccessResult(listener: (payload: AccessScanOutcome) => void): () => void
  onHardwareStatus(listener: (payload: HardwareStatus) => void): () => void
  onScanCaptured(listener: (uid: string) => void): () => void
  onDataChanged(listener: (entity: DataChangeEntity) => void): () => void
}

declare global {
  interface Window {
    api: GymApi
  }
}
