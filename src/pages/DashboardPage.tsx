import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export function DashboardPage () {
  const { user } = useAuth()
  const [upcoming, setUpcoming] = useState<{ question: string; appointment_date: string | null; doctor: string | null }[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({ track: true, doctors: false, medications: false })

  function toggle (section: string) {
    setOpen((prev) => ({ ...prev, [section]: !prev[section] }))
  }

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
    <div style={{ display: 'grid', gap: 12, padding: '8px 0 40px' }}>

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

      {/* TRACK */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => toggle('track')}
          style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}
        >
          <span>⚡ Track symptoms</span>
          <span>{open.track ? '▲' : '▼'}</span>
        </button>
        {open.track && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
            <Link to="/app/log?tab=pain" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🩹 Log pain</Link>
            <Link to="/app/log?tab=mcas" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🔬 MCAS episode</Link>
            <Link to="/app/analytics" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>📈 Charts & trends</Link>
            <Link to="/app/records" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🗂️ View all records</Link>
          </div>
        )}
      </div>

      {/* DOCTORS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => toggle('doctors')}
          style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}
        >
          <span>👩‍⚕️ Doctors</span>
          <span>{open.doctors ? '▲' : '▼'}</span>
        </button>
        {open.doctors && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
            <Link to="/app/doctors" className="btn btn-primary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>👩‍⚕️ My doctors — profiles & history</Link>
            <Link to="/app/log?tab=visit" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🏥 Log a doctor visit</Link>
            <Link to="/app/log?tab=questions" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>❓ Add questions for doctor</Link>
            <Link to="/app/log?tab=diagnosis" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>📋 Add diagnosis note</Link>
          </div>
        )}
      </div>

      {/* MEDICATIONS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => toggle('medications')}
          style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}
        >
          <span>💊 Medications</span>
          <span>{open.medications ? '▲' : '▼'}</span>
        </button>
        {open.medications && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
            <Link to="/app/log?tab=medication" className="btn btn-primary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>💊 Update medication list</Link>
            <Link to="/app/meds" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>📄 View all medications</Link>
            <Link to="/app/log?tab=reaction" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>⚠️ Log medication effects</Link>
          </div>
        )}
      </div>

    </div>
  )
}