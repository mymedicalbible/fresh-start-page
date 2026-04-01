import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom' // Removed useNavigate
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
  // Removed: const navigate = useNavigate()
  const [upcoming, setUpcoming] = useState<UpcomingAppt[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({ track: true, doctors: false })

  function toggle (section: string) {
    setOpen((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  useEffect(() => {
    if (!user) return
    supabase.from('appointments')
      .select('id, doctor, specialty, appointment_date, appointment_time')
      .eq('user_id', user.id)
      .gte('appointment_date', new Date().toISOString().split('T')[0])
      .order('appointment_date', { ascending: true })
      .limit(3)
      .then(({ data }) => setUpcoming((data ?? []) as UpcomingAppt[]))
  }, [user])

  if (!user) return null

  return (
    <div style={{ paddingBottom: 60 }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800 }}>Medical Bible</h1>
        <p className="muted" style={{ margin: 0 }}>Welcome back, {user.email?.split('@')[0]}</p>
      </header>

      {/* QUICK ACTIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <Link to="/app/log" className="card" style={{ padding: '16px 12px', textAlign: 'center', textDecoration: 'none', background: 'var(--primary)', color: 'white', border: 'none' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>📝</div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Quick Log</div>
        </Link>
        <Link to="/app/visits" className="card" style={{ padding: '16px 12px', textAlign: 'center', textDecoration: 'none' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: 4 }}>🏥</div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Visits</div>
        </Link>
      </div>

      {/* UPCOMING */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>📅 Upcoming</h3>
          <Link to="/app/doctors" style={{ fontSize: '0.85rem', fontWeight: 600 }}>See all</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.9rem', margin: 0 }}>No upcoming appointments found.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {upcoming.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <div style={{ textAlign: 'center', minWidth: 45, padding: '4px', background: '#f0f0f0', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>{new Date(a.appointment_date).toLocaleString('default', { month: 'short' })}</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{new Date(a.appointment_date).getDate() + 1}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{a.doctor}</div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>{a.specialty || 'General'} • {a.appointment_time || 'TBD'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DIRECTORY TILES */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Link to="/app/questions" className="card" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>❓</div>
          <div style={{ fontWeight: 700 }}>Questions</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Archive & Drafts</div>
        </Link>
        <Link to="/app/meds" className="card" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>💊</div>
          <div style={{ fontWeight: 700 }}>Meds</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Current & Past</div>
        </Link>
        <Link to="/app/tests" className="card" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>🔬</div>
          <div style={{ fontWeight: 700 }}>Lab Orders</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Results & Files</div>
        </Link>
        <Link to="/app/records" className="card" style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: '1.2rem', marginBottom: 4 }}>📊</div>
          <div style={{ fontWeight: 700 }}>Health Logs</div>
          <div className="muted" style={{ fontSize: '0.75rem' }}>Pain & MCAS</div>
        </Link>
      </div>
    </div>
  )
}