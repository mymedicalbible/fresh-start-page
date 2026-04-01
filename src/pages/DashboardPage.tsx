import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type UpcomingAppt = {
  id: string
  doctor: string
  specialty: string | null
  appointment_date: string
  appointment_time: string | null
}

export function DashboardPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({ track: true, doctors: false })

  function toggle (section: string) {
    setOpen((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  useEffect(() => {
    if (!user) return
    async function load () {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('appointments')
        .select('id, doctor, specialty, appointment_date, appointment_time')
        .eq('user_id', user!.id)
        .eq('visit_logged', false)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(5)
      setUpcoming((data ?? []) as UpcomingAppt[])
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
            {upcoming.map((u) => (
              <li key={u.id} className="muted">
                {u.appointment_date}
                {u.appointment_time ? ` · ${u.appointment_time}` : ''}
                {` · ${u.doctor}`}
                {u.specialty ? ` (${u.specialty})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* TRACK */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button type="button" onClick={() => toggle('track')}
          style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>
          <span>⚡ Track symptoms</span>
          <span>{open.track ? '▲' : '▼'}</span>
        </button>
        {open.track && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
            <Link to="/app/log?tab=pain" className="btn btn-primary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🩹 Log pain</Link>
            <Link to="/app/log?tab=mcas" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🔬 MCAS episode</Link>
            <Link to="/app/analytics" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>📈 Charts & trends</Link>
            <Link to="/app/records" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🗂️ View all records</Link>
          </div>
        )}
      </div>

      {/* DOCTORS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button type="button" onClick={() => toggle('doctors')}
          style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>
          <span>👩‍⚕️ Doctors & diagnoses</span>
          <span>{open.doctors ? '▲' : '▼'}</span>
        </button>
        {open.doctors && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
            <Link to="/app/doctors" className="btn btn-primary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>👩‍⚕️ My doctors — profiles & history</Link>
            <button type="button" className="btn btn-secondary btn-block" style={{ textAlign: 'left' }}
              onClick={() => navigate('/app/log?tab=visit')}>📝 Logs for doctor</button>
            <Link to="/app/diagnoses" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>📋 Diagnoses directory</Link>
            <Link to="/app/questions" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>❓ Questions archive</Link>
            <Link to="/app/tests" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🧪 Tests & orders</Link>
          </div>
        )}
      </div>

      {/* MEDICATIONS */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <Link to="/app/meds"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', textDecoration: 'none', color: 'inherit', fontWeight: 700, fontSize: '1rem' }}>
          <span>💊 Medications</span>
          <span>→</span>
        </Link>
      </div>

    </div>
  )
}