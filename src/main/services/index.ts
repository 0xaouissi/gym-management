import type { Db } from '../db/database'
import type { TurnstileController } from '../hardware/contracts'
import { AccessService } from './access.service'
import { AuditService } from './audit.service'
import { AuthService } from './auth.service'
import { ClientsService } from './clients.service'
import { DashboardService } from './dashboard.service'
import { DemoService } from './demo.service'
import { PaymentsService } from './payments.service'
import { PlansService } from './plans.service'
import { ReportsService } from './reports.service'
import { RfidService } from './rfid.service'
import { SettingsService } from './settings.service'
import { SubscriptionsService } from './subscriptions.service'
import { UsersService } from './users.service'

export interface Services {
  auth: AuthService
  audit: AuditService
  settings: SettingsService
  users: UsersService
  plans: PlansService
  rfid: RfidService
  clients: ClientsService
  subscriptions: SubscriptionsService
  payments: PaymentsService
  access: AccessService
  dashboard: DashboardService
  reports: ReportsService
  demo: DemoService
  setTurnstile: (turnstile: TurnstileController | null) => void
}

export function createServices(db: Db): Services {
  const auth = new AuthService(db)
  const audit = new AuditService(db, () => auth.session())
  auth.setAuditService(audit)
  const settings = new SettingsService(db)
  const users = new UsersService(db, audit)
  const plans = new PlansService(db, audit)
  const rfid = new RfidService(db, audit)
  const clients = new ClientsService(db, audit, rfid, settings)
  const subscriptions = new SubscriptionsService(db, audit, plans, settings)
  const payments = new PaymentsService(db, audit)

  let turnstile: TurnstileController | null = null
  const access = new AccessService(
    db,
    () => turnstile,
    () => settings.get().turnstile.deviceName || null
  )
  const dashboard = new DashboardService(db, settings)
  const reports = new ReportsService(db)
  const demo = new DemoService(db, audit)

  return {
    auth,
    audit,
    settings,
    users,
    plans,
    rfid,
    clients,
    subscriptions,
    payments,
    access,
    dashboard,
    reports,
    demo,
    setTurnstile: (next) => {
      turnstile = next
    }
  }
}
