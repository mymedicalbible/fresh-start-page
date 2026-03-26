import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function SettingsPage () {
  const { user } = useAuth()
  const [browserPush, setBrowserPush] = useState(false)
  const [highPain, setHighPain] = useState(true)
  const [appt, setAppointments] = useState(true)
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      if (data) {
        setBrowserPush(Boolean(data.browser_push_enabled))
        setHighPain(data.high_pain_alert !== false)
        setAppointments(data.appointment_reminders !== false)
      }
    })()
  }, [user])

  async function savePrefs (next: {
    browser_push_enabled?: boolean
    high_pain_alert?: boolean
    appointment_reminders?: boolean
  }) {
    if (!user) return
    setMsg(null)
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: user.id,
      browser_push_enabled: next.browser_push_enabled ?? browserPush,
      high_pain_alert: next.high_pain_alert ?? highPain,
      appointment_reminders: next.appointment_reminders ?? appt,
      updated_at: new Date().toISOString(),
    })
    if (error) setMsg(error.message)
    else setMsg('Saved.')
  }

  async function requestBrowserPermission () {
    if (typeof Notification === 'undefined') {
      setMsg('Browser notifications are not supported here.')
      return
    }
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') {
      setBrowserPush(true)
      await savePrefs({ browser_push_enabled: true })
    } else {
      setMsg('Permission not granted — pushes will stay in-app only.')
    }
  }

  if (!user) return null

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Settings</h2>

      {msg && <div className="banner success">{msg}</div>}

      <div className="form-group">
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={highPain}
            onChange={(e) => {
              setHighPain(e.target.checked)
              void savePrefs({ high_pain_alert: e.target.checked })
            }}
          />
          Alert me for high pain entries (≥ 8/10)
        </label>
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={appt}
            onChange={(e) => {
              setAppointments(e.target.checked)
              void savePrefs({ appointment_reminders: e.target.checked })
            }}
          />
          Appointment-day reminders (when you open the app)
        </label>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

      <h3>Browser notifications</h3>
      <p className="muted">
        Permission: <strong>{perm}</strong>
      </p>
      <p className="muted">
        When enabled, new in-app notifications also trigger a desktop/mobile banner if the app is open and Realtime is connected.
        True background push needs a service worker (not included in this scaffold).
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="button" className="btn btn-primary" onClick={requestBrowserPermission}>
          Enable browser permission
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setBrowserPush(false)
            void savePrefs({ browser_push_enabled: false })
          }}
        >
          Turn off browser banners
        </button>
      </div>

      <p className="muted" style={{ marginTop: 16, fontSize: '0.85rem' }}>
        Your user id is internal to Supabase; never share passwords or anon keys publicly.
      </p>
    </div>
  )
}
