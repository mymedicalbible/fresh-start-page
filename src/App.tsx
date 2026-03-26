import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { QuickLogPage } from './pages/QuickLogPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AiSummariesPage } from './pages/AiSummariesPage'
import { MedicationsPage } from './pages/MedicationsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SettingsPage } from './pages/SettingsPage'

function Protected ({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="login-wrap muted">
        <p>Loading…</p>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App () {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={(
          <Protected>
            <AppLayout />
          </Protected>
        )}
      >
        <Route index element={<DashboardPage />} />
        <Route path="log" element={<QuickLogPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="ai" element={<AiSummariesPage />} />
        <Route path="meds" element={<MedicationsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
