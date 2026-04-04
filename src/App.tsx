import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import QuickLogPage from './pages/QuickLogPage'
import AnalyticsPage from './pages/AnalyticsPage'
import VisitsPage from './pages/VisitsPage'
import DoctorsPage from './pages/DoctorsPage'
import MedicationsPage from './pages/MedicationsPage'
import DiagnosesDirectoryPage from './pages/DiagnosesDirectoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/log" element={<QuickLogPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/visits" element={<VisitsPage />} />
        <Route path="/doctors" element={<DoctorsPage />} />
        <Route path="/meds" element={<MedicationsPage />} />
        <Route path="/diagnoses" element={<DiagnosesDirectoryPage />} />
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  )
}