
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({ track: true, doctors: false })


  function toggle (section: string) {
    setOpen((prev) => ({ ...prev, [section]: !prev[section] }))
  }


  useEffect(() => {
    if (!user) return
    async function load () {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('appointments')
        .select('id, doctor, specialty, appointment_date, appointment_time, visit_logged')
        .eq('user_id', user!.id)
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .limit(8)
      if (error) {
        console.warn('appointments load:', error.message)
        setUpcoming([])
        return
      }
      const rows = (data ?? []) as (UpcomingAppt & { visit_logged?: boolean | null })[]
      setUpcoming(
        rows.filter((r) => r.visit_logged !== true) as UpcomingAppt[]
      )
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


      {/* Quick actions — compact row */}
      <div className="card" style={{ padding: '12px 14px' }}>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.8rem' }}>Log</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          <Link to="/app/log?tab=pain" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>Pain</Link>
          <Link to="/app/log?tab=mcas" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>MCAS</Link>
          <Link to="/app/visits?new=1" className="btn btn-primary" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>Visit</Link>
          <Link to="/app/questions" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', fontSize: '0.78rem', padding: '8px 6px' }}>Qs</Link>
        </div>
      </div>


      {/* TRACK - Collapsible */}
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
            <Link to="/app/records" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>
              📄 Generate summary
            </Link>
            <p className="muted" style={{ fontSize: '0.78rem', margin: 0, lineHeight: 1.4 }}>
              Pain & MCAS log history (same data as before — just not a top-level “Records” tile).
            </p>
          </div>
        )}
      </div>


      {/* DOCTORS - Collapsible */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <button type="button" onClick={() => toggle('doctors')}
          style={{ width: '100%', background: 'none', border: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 700, fontSize: '1rem' }}>
          <span>👩‍⚕️ Doctors & diagnoses</span>
          <span>{open.doctors ? '▲' : '▼'}</span>
        </button>
        {open.doctors && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
            <Link to="/app/doctors" className="btn btn-primary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>👩‍⚕️ My doctors — profiles & history</Link>
            <Link to="/app/visits" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>🏥 Doctor visits</Link>
            <Link to="/app/diagnoses" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>📋 Diagnoses directory</Link>
            <Link to="/app/questions" className="btn btn-secondary btn-block" style={{ textDecoration: 'none', textAlign: 'left' }}>❓ Questions</Link>
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
