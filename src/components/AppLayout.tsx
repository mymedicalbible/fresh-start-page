import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { SpiralBinding } from './SpiralBinding'

type NavItem =
  | { kind: 'path'; path: string; label: string; icon: string }
  | { kind: 'handoff'; label: string; icon: string }

const NAV_ITEMS: NavItem[] = [
  { kind: 'path', path: '/app', label: 'Home', icon: '🏠' },
  { kind: 'path', path: '/app/records', label: 'Records', icon: '📋' },
  { kind: 'path', path: '/app/log', label: 'Log', icon: '✏️' },
  { kind: 'path', path: '/app/doctors', label: 'Doctors', icon: '🩺' },
  { kind: 'handoff', label: 'Summary', icon: '📄' },
]

export function AppLayout () {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const todayLine = format(new Date(), 'EEEE, MMMM d')

  function goNav (item: NavItem) {
    if (item.kind === 'handoff') {
      navigate('/app?handoff=1')
      return
    }
    navigate(item.path)
  }

  function isActive (item: NavItem): boolean {
    if (item.kind === 'handoff') return false
    if (item.path === '/app') return pathname === '/app' || pathname === '/app/'
    return pathname === item.path || pathname.startsWith(`${item.path}/`)
  }

  return (
    <div className="app-shell">
      <div className="app-page">
        <div className="notebook-outer">
          <SpiralBinding />
          <div className="paper-sheet paper-sheet--spiral">
          <header className="top-bar">
            <div>
              <h1 className="notebook-title">Medical Bible</h1>
              <div className="top-bar-date">{todayLine}</div>
              {user?.email && (
                <div className="subtitle top-bar-email">{user.email}</div>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-signout"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </header>
          <Outlet />
          </div>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item)
          const key = item.kind === 'path' ? item.path : 'handoff'
          return (
            <button
              key={key}
              type="button"
              className={`bottom-nav-item${active ? ' active' : ''}`}
              onClick={() => goNav(item)}
            >
              <span className="bottom-nav-icon">{item.icon}</span>
              <span className="bottom-nav-label">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
