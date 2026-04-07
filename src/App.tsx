import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { QuickLogPage } from './pages/QuickLogPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { MedicationsPage } from './pages/MedicationsPage'
import { RecordsPage } from './pages/RecordsPage'
import { DoctorsPage } from './pages/DoctorsPage'
import { DoctorProfilePage } from './pages/DoctorProfilePage'
import { TestsOrderedPage } from './pages/TestsOrderedPage'
import { QuestionsArchivePage } from './pages/QuestionsArchivePage'
import { DiagnosesDirectoryPage } from './pages/DiagnosesDirectoryPage'
import { VisitsPage } from './pages/VisitsPage'
import { ProfilePage } from './pages/ProfilePage'


function Protected ({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="login-wrap muted"><p>Loading…</p></div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}


export default function App () {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/app" element={<Protected><AppLayout /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="log" element={<QuickLogPage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="meds" element={<MedicationsPage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="doctors/:id" element={<DoctorProfilePage />} />
        <Route path="tests" element={<TestsOrderedPage />} />
        <Route path="questions" element={<QuestionsArchivePage />} />
        <Route path="diagnoses" element={<DiagnosesDirectoryPage />} />
        <Route path="visits" element={<VisitsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
