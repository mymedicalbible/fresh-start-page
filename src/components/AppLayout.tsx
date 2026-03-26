import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fetchNotificationPrefs, tryBrowserNotification } from '../lib/notify'

export function AppLayout () {
  const { user, signOut } = useAuth()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return

    let cancelled = false

    async function loadUnread () {
      const { count } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null)
      if (!cancelled) setUnread(count ?? 0)
    }

    loadUnread()

    const channel = supabase
      .channel(`notifs:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadUnread()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`notifs-push:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const row = payload.new as { title?: string; body?: string | null }
          const prefs = await fetchNotificationPrefs()
          if (!prefs?.browser_push_enabled) return
          tryBrowserNotification(row.title ?? 'Medical Tracker', row.body ?? '')
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

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
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/analytics">
          <span className="ico" aria-hidden>📈</span>
          Charts
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/ai">
          <span className="ico" aria-hidden>✨</span>
          AI
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/meds">
          <span className="ico" aria-hidden>💊</span>
          Meds
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/notifications">
          <span className="ico" aria-hidden>🔔</span>
          Alerts
          {unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </NavLink>
        <NavLink className={({ isActive }) => (isActive ? 'active' : '')} to="/app/settings">
          <span className="ico" aria-hidden>⚙️</span>
          Settings
        </NavLink>
      </nav>
    </div>
  )
}
