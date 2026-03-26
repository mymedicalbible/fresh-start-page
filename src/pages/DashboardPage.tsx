import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function DashboardPage () {
  const { user } = useAuth()
  const [upcoming, setUpcoming] = useState<{ question: string; appointment_date: string | null; doctor: string | null }[]>([])

  useEffect(() => {
    if (!user) return

    async function load () {
      const today = new Date()
      const horizon = addDays(today, 2)
      const { data } = await supabase
        .from('doctor_questions')
        .select('question, appointment_date, doctor, status')
        .eq('user_id', user.id)
        .or('status.eq.Unanswered,status.is.null')
        .not('appointment_date', 'is', null)

      const rows = (data ?? []).filter((q) => {
        if (!q.appointment_date) return false
        const d = new Date(q.appointment_date + 'T12:00:00')
        return d >= today && d <= horizon
      })
      setUpcoming(rows.map((r) => ({ question: r.question, appointment_date: r.appointment_date, doctor: r.doctor })))
    }

    load()
  }, [user])

  return (
    <div>
      {upcoming.length > 0 && (
        <div className="banner info" style={{ marginBottom: 16 }}>
          <strong>Upcoming appointments</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {upcoming.map((u, i) => (
              <li key={i} className="muted">
                {u.appointment_date}
                {u.doctor ? ` · ${u.doctor}` : ''}
                {' — '}
                {u.question}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid-cards">
        <Link to="/app/log" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="emoji" aria-hidden>⚡</span>
          <span className="label">Quick log</span>
          <span className="hint">Visits, reactions, pain…</span>
        </Link>
        <Link to="/app/analytics" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="emoji" aria-hidden>📈</span>
          <span className="label">Charts</span>
          <span className="hint">Pain & medication trends</span>
        </Link>
        <Link to="/app/records" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="emoji" aria-hidden>🗂️</span>
          <span className="label">Records</span>
          <span className="hint">All logs and uploads</span>
        </Link>
        <Link to="/app/meds" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <span className="emoji" aria-hidden>💊</span>
          <span className="label">Medications</span>
          <span className="hint">Current list & edits</span>
        </Link>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Tips</h3>
        <ul className="muted" style={{ paddingLeft: 18, marginBottom: 0 }}>
          <li>Each account has isolated data (Row Level Security).</li>
          <li>Use Records for quick review of past logs and uploaded documents.</li>
          <li>Charts use your structured tags, so pain/MCAS trends stay readable.</li>
        </ul>
      </div>
    </div>
  )
}
