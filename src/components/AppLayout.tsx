import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

type NavItem = { path: string; label: string }

const NAV_ITEMS: NavItem[] = [
  { path: '/app', label: 'home' },
  { path: '/app/log', label: 'log' },
  { path: '/app/analytics', label: 'charts' },
  { path: '/app/profile', label: 'profile' },
]

function IconHome () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  )
}

function IconLog () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

function IconCharts () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19V5M4 19h16M7 16l3-6 4 3 5-8" />
    </svg>
  )
}

function IconProfile () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20.5v-1c0-3 2.5-5.5 6.5-5.5s6.5 2.5 6.5 5.5v1" />
    </svg>
  )
}

const NAV_ICONS = [IconHome, IconLog, IconCharts, IconProfile] as const

export function AppLayout () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const isHome = pathname === '/app' || pathname === '/app/'

  function isActive (path: string): boolean {
    if (path === '/app') return isHome
    return pathname === path || pathname.startsWith(`${path}/`)
  }

  if (!user) return null

  return (
    <div className="app-shell app-shell--scrapbook">
      {!isHome && (
        <header className="scrap-layout-header">
          <span className="scrap-layout-brand">medical bible</span>
        </header>
      )}

      <div className="app-page app-page--scrapbook">
        <div className="scrapbook-sheet">
          <Outlet />
        </div>
      </div>

      <nav className="bottom-nav bottom-nav--scrapbook" aria-label="Main">
        {NAV_ITEMS.map((item, i) => {
          const active = isActive(item.path)
          const Icon = NAV_ICONS[i] ?? IconHome
          return (
            <button
              key={item.path}
              type="button"
              className={`bottom-nav-item bottom-nav-item--scrapbook${active ? ' active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="bottom-nav-icon bottom-nav-icon--scrapbook" aria-hidden>
                <Icon />
              </span>
              <span className="bottom-nav-label bottom-nav-label--scrapbook">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
