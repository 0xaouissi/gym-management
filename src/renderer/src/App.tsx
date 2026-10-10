import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Dumbbell } from 'lucide-react'
import { SessionProvider, useSession } from '@renderer/hooks/useSession'
import { SettingsProvider } from '@renderer/hooks/useSettings'
import { AppLayout } from '@renderer/layouts/AppLayout'
import { Toaster } from '@renderer/components/ui/toaster'
import { LoadingPanel } from '@renderer/components/ui/spinner'
import { LoginPage } from '@renderer/pages/LoginPage'
import { DashboardPage } from '@renderer/pages/DashboardPage'
import { LiveAccessPage } from '@renderer/pages/LiveAccessPage'
import { ClientsPage } from '@renderer/pages/ClientsPage'
import { ClientDetailPage } from '@renderer/pages/ClientDetailPage'
import { SubscriptionsPage } from '@renderer/pages/SubscriptionsPage'
import { RfidCardsPage } from '@renderer/pages/RfidCardsPage'
import { AccessControlPage } from '@renderer/pages/AccessControlPage'
import { AttendancePage } from '@renderer/pages/AttendancePage'
import { PaymentsPage } from '@renderer/pages/PaymentsPage'
import { ReportsPage } from '@renderer/pages/ReportsPage'
import { SettingsPage } from '@renderer/pages/SettingsPage'
import { UsersPage } from '@renderer/pages/UsersPage'
import { AuditPage } from '@renderer/pages/AuditPage'

function AdminOnly({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const { user } = useSession()
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}

function AppRoutes(): React.JSX.Element {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Dumbbell className="size-7" />
        </div>
        <LoadingPanel label="Starting Gym Manager…" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="live" element={<LiveAccessPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/:id" element={<ClientDetailPage />} />
        <Route path="subscriptions" element={<SubscriptionsPage />} />
        <Route path="rfid" element={<RfidCardsPage />} />
        <Route path="access-control" element={<AccessControlPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route
          path="users"
          element={
            <AdminOnly>
              <UsersPage />
            </AdminOnly>
          }
        />
        <Route
          path="audit"
          element={
            <AdminOnly>
              <AuditPage />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App(): React.JSX.Element {
  return (
    <SessionProvider>
      <SettingsProvider>
        <HashRouter>
          <AppRoutes />
          <Toaster />
        </HashRouter>
      </SettingsProvider>
    </SessionProvider>
  )
}
