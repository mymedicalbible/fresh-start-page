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
        .eq('user_id', user!.id)
        .or('status.eq.Unanswered,status.is.null')
        .not('appointment_date', 'is', null)

      const rows = (data ?? []).filter((q) => {
        if (!q.appointment_date) return false
        const d = new Date(q.appointment_date + 'T12:00:00')
        return d >= today && d <= horizon
      })

      setUpcoming(
        rows.map((r) => ({
          question: r.question,
          appointment_date: r.appointment_date,
          doctor: r.doctor
        }))
      )
    }

    load()
  }, [user])

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div style={{ display: 'grid', gap: 24, padding: '8px 0' }}>

      {/* Upcoming appointments banner */}
      {upcoming.length > 0 && (
        <div className="banner info">
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

      {/* --- Main tools --- */}
      <div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Main</p>
        <div className="grid-cards">
          <Link to="/app/log" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>⚡</span>
            <span className="label">Quick log</span>
            <span className="hint">Pain & MCAS episodes</span>
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
        </div>
      </div>

      {/* --- Doctor-related --- */}
      <div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Doctors</p>
        <div className="grid-cards">
          <Link to="/app/log?tab=visit" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>🏥</span>
            <span className="label">Doctor visit</span>
            <span className="hint">Log a visit & findings</span>
          </Link>

          <Link to="/app/log?tab=questions" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>❓</span>
            <span className="label">Questions</span>
            <span className="hint">Questions for your doctor</span>
          </Link>

          <Link to="/app/log?tab=diagnosis" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>📋</span>
            <span className="label">Diagnosis note</span>
            <span className="hint">Track what's been said</span>
          </Link>
        </div>
      </div>

      {/* --- Medications --- */}
      <div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Medications</p>
        <div className="grid-cards">
          <Link to="/app/meds" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>💊</span>
            <span className="label">Medication list</span>
            <span className="hint">View & update current meds</span>
          </Link>

          <Link to="/app/log?tab=reaction" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>⚠️</span>
            <span className="label">Log reaction</span>
            <span className="hint">Side effects & responses</span>
          </Link>
        </div>
      </div>

    </div>
  )
}