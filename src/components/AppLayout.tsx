import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function AppLayout () {
  const { user, signOut } = useAuth()

  return (
    <div className="app-shell">
      <div className="page">
        <header className="top-bar">
          <div>
            <h1>Medical Tracker</h1>
            <div className="muted">
              {user?.email}
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </header>
        <Outlet />
      </div>

      <nav className="bottom-nav" aria-label="Main">
        <NavLink end className={({ isActive }) => (isActive ? 'active' : '')} to="/app">
          <span className="ico" aria-hidden>🏠</span>
          Home
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/log">
          <span className="ico" aria-hidden>⚡</span>
          Log
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/records">
          <span className="ico" aria-hidden>🗂️</span>
          Records
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/analytics">
          <span className="ico" aria-hidden>📈</span>
          Charts
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/meds">
          <span className="ico" aria-hidden>💊</span>
          Meds
        </NavLink>
      </nav>
    </div>
  )
}
