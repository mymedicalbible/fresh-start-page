import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useDoctorNoteModal } from '../contexts/DoctorNoteModalContext'

type NavItem =
  | { kind: 'path'; path: string; label: string }
  | { kind: 'note'; label: string }

const NAV_ITEMS: NavItem[] = [
  { kind: 'path', path: '/app', label: 'home' },
  { kind: 'path', path: '/app/log', label: 'log' },
  { kind: 'note', label: 'note' },
  { kind: 'path', path: '/app/flares', label: 'flares' },
  { kind: 'path', path: '/app/more', label: 'more' },
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
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
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

function IconMore () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconFlares () {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.5-1-2-1-3.5C10 5.5 10 3 9 3c-1 3-1 4.5-1 6.5a2.5 2.5 0 0 0 5 0" />
    </svg>
  )
}

const NAV_ICONS = [IconHome, IconLog, IconNote, IconFlares, IconMore] as const

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
                aria-label="Note for a doctor"
              >
                <span className="bottom-nav-icon bottom-nav-icon--scrapbook" aria-hidden>
                  <Icon />
                </span>
                <span className="bottom-nav-label bottom-nav-label--scrapbook">note</span>
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
