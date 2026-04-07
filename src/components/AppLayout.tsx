import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useDoctorNoteModal } from '../contexts/DoctorNoteModalContext'

type NavItem =
  | { kind: 'path'; path: string; label: string }
  | { kind: 'note'; label: string }

const NAV_ITEMS: NavItem[] = [
  { kind: 'path', path: '/app', label: 'home' },
  { kind: 'path', path: '/app/analytics', label: 'charts' },
  { kind: 'note', label: 'note' },
  { kind: 'path', path: '/app/tests', label: 'tests' },
  { kind: 'path', path: '/app/records', label: 'records' },
]

function IconHome () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
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

function IconNote () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}

function IconTests () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <path d="M14 2v6h6M10 13h4M10 17h4" />
    </svg>
  )
}

function IconRecords () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h8" />
    </svg>
  )
}

const NAV_ICONS = [IconHome, IconCharts, IconNote, IconTests, IconRecords] as const

export function AppLayout () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { openNoteModal } = useDoctorNoteModal()
  const isHome = pathname === '/app' || pathname === '/app/'

  function isActivePath (path: string): boolean {
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
          const Icon = NAV_ICONS[i] ?? IconHome
          if (item.kind === 'note') {
            return (
              <button
                key="note"
                type="button"
                className="bottom-nav-item bottom-nav-item--scrapbook"
                onClick={() => openNoteModal()}
                aria-label="Log a note for a doctor"
              >
                <span className="bottom-nav-icon bottom-nav-icon--scrapbook" aria-hidden>
                  <Icon />
                </span>
                <span className="bottom-nav-label bottom-nav-label--scrapbook">log note</span>
              </button>
            )
          }
          const active = isActivePath(item.path)
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
