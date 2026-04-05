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
            {user?.email && <div className="subtitle">{user.email}</div>}
          </div>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={() => signOut()}>
            Sign out
          </button>
        </header>
        <Outlet />
      </div>
    </div>
  )
}
