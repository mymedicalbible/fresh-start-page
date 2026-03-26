import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Row = {
  id: string
  title: string
  body: string | null
  notification_type: string
  read_at: string | null
  created_at: string
}

export function NotificationsPage () {
  const { user } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load () {
    if (!user) return
    const { data, error: e } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100)
    if (e) setError(e.message)
    else setRows((data ?? []) as Row[])
  }

  useEffect(() => {
    load()
  }, [user])

  async function markRead (id: string) {
    await supabase.from('user_notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    await load()
  }

  async function markAllRead () {
    if (!user) return
    await supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)
    await load()
  }

  if (!user) return null

  return (
    <div>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Notifications</h2>
          <button type="button" className="btn btn-secondary" onClick={markAllRead}>Mark all read</button>
        </div>
        <p className="muted">High pain, MCAS hints, AI outputs, and lightweight appointment reminders appear here. Enable browser alerts in Settings.</p>

        {rows.length === 0
          ? (
            <p className="muted">No notifications yet.</p>
            )
          : (
            <div className="card" style={{ padding: 0, marginTop: 12, overflow: 'hidden' }}>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className={`list-item ${r.read_at ? '' : 'unread'}`}
                  onClick={() => { if (!r.read_at) markRead(r.id) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !r.read_at) markRead(r.id) }}
                  role="button"
                  tabIndex={0}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{r.title}</strong>
                    <span className="muted" style={{ fontSize: '0.78rem' }}>
                      {format(new Date(r.created_at), 'MMM d, HH:mm')}
                    </span>
                  </div>
                  {r.body && <div className="muted" style={{ marginTop: 6 }}>{r.body}</div>}
                  <div className="muted" style={{ marginTop: 6, fontSize: '0.75rem' }}>{r.notification_type}</div>
                </div>
              ))}
            </div>
            )}
      </div>
    </div>
  )
}
