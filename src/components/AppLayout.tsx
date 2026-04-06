import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS: { path: string; label: string; icon: string }[] = [
  { path: '/app',        label: 'Home',    icon: '🏠' },
  { path: '/app/doctors', label: 'Doctors', icon: '🩺' },
  { path: '/app/records', label: 'Records', icon: '📁' },
  { path: '/app/analytics', label: 'Trends', icon: '📊' },
]

export function AppLayout () {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="app-shell">
      <div className="page">
        <header className="top-bar">
          <div>
            <h1>Medical Tracker</h1>
            {user?.email && <div className="subtitle">{user.email}</div>}
          </div>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={() => signOut()}>
            Sign out
          </button>
        </header>
        <Outlet />
      </div>

      <nav className="bottom-nav">
        {NAV_ITEMS.map((item) => {
          const active = item.path === '/app'
            ? pathname === '/app' || pathname === '/app/'
            : pathname.startsWith(item.path)
          return (
            <button key={item.path} type="button"
              className={`bottom-nav-item${active ? ' active' : ''}`}
              onClick={() => navigate(item.path)}>
              <span className="bottom-nav-icon">{item.icon}</span>
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
