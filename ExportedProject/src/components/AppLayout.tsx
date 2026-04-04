import { Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function AppLayout () {
  const { user, signOut } = useAuth()

  return (
    <div className="app-shell">
      <div className="page">
        <header className="top-bar">
          <div>
            <h1>Medical Tracker</h1>
            <div className="muted">{user?.email}</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </header>
        <Outlet />
      </div>
    </div>
  )
}