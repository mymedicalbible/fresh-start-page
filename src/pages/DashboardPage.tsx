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
      setUpcoming(rows.map((r) => ({ question: r.question, appointment_date: r.appointment_date, doctor: r.doctor })))
    }
    load()
  }, [user])

  if (!user) return <div>Loading...</div>

  return (
    <div style={{ display: 'grid', gap: 28, padding: '8px 0 40px' }}>

      {upcoming.length > 0 && (
        <div className="banner info">
          <strong>Upcoming appointments</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {upcoming.map((u, i) => (
              <li key={i} className="muted">
                {u.appointment_date}{u.doctor ? ` · ${u.doctor}` : ''} — {u.question}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* TRACKING */}
      <section>
        <p style={{ margin: '0 0 10px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--muted, #888)' }}>
          Track
        </p>
        <div className="grid-cards">
          <Link to="/app/log?tab=pain" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>🩹</span>
            <span className="label">Log pain</span>
            <span className="hint">Location, intensity, type</span>
          </Link>
          <Link to="/app/log?tab=mcas" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>🔬</span>
            <span className="label">MCAS episode</span>
            <span className="hint">Triggers & symptoms</span>
          </Link>
          <Link to="/app/analytics" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>📈</span>
            <span className="label">Charts</span>
            <span className="hint">Pain & medication trends</span>
          </Link>
          <Link to="/app/records" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>🗂️</span>
            <span className="label">Records</span>
            <span className="hint">All logs & uploads</span>
          </Link>
        </div>
      </section>

      {/* DOCTORS */}
      <section>
        <p style={{ margin: '0 0 10px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--muted, #888)' }}>
          Doctors
        </p>
        <div className="grid-cards">
          <Link to="/app/log?tab=visit" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>🏥</span>
            <span className="label">Doctor visit</span>
            <span className="hint">Log findings & tests</span>
          </Link>
          <Link to="/app/log?tab=questions" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>❓</span>
            <span className="label">Questions</span>
            <span className="hint">Add & prioritize questions</span>
          </Link>
          <Link to="/app/log?tab=diagnosis" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>📋</span>
            <span className="label">Diagnosis note</span>
            <span className="hint">What was mentioned</span>
          </Link>
        </div>
      </section>

      {/* MEDICATIONS */}
      <section>
        <p style={{ margin: '0 0 10px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--muted, #888)' }}>
          Medications
        </p>
        <div className="grid-cards">
          <Link to="/app/log?tab=medication" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>💊</span>
            <span className="label">Update med list</span>
            <span className="hint">Add or edit a medication</span>
          </Link>
          <Link to="/app/meds" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>📄</span>
            <span className="label">View all meds</span>
            <span className="hint">Your current medication list</span>
          </Link>
          <Link to="/app/log?tab=reaction" className="nav-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="emoji" aria-hidden>⚠️</span>
            <span className="label">Log reaction</span>
            <span className="hint">Side effects & responses</span>
          </Link>
        </div>
      </section>

    </div>
  )
}