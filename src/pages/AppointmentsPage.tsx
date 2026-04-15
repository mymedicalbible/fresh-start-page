import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
import { formatTime12h } from '../lib/formatTime12h'

type AppointmentRow = {
  id: string
  doctor: string | null
  specialty: string | null
  appointment_date: string
  appointment_time: string | null
  visit_logged: boolean | null
}

function todayISO () {
  return new Date().toISOString().slice(0, 10)
}

function appointmentStartMs (row: AppointmentRow): number {
  const rawTime = row.appointment_time?.trim()
  const time = rawTime
    ? (rawTime.length <= 5 ? `${rawTime}:00` : rawTime)
    : '12:00:00'
  return new Date(`${row.appointment_date}T${time}`).getTime()
}

export function AppointmentsPage () {
  const { user } = useAuth()
  const [rows, setRows] = useState<AppointmentRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formDoctor, setFormDoctor] = useState('')
  const [formSpecialty, setFormSpecialty] = useState('')
  const [formDate, setFormDate] = useState(todayISO())
  const [formTime, setFormTime] = useState('')
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')

  async function load () {
    if (!user) return
    const { data, error: e } = await supabase.from('appointments')
      .select('id, doctor, specialty, appointment_date, appointment_time, visit_logged')
      .eq('user_id', user.id)
      .order('appointment_date', { ascending: true })
    if (e) setError(e.message)
    else setRows((data ?? []) as AppointmentRow[])
  }

  useEffect(() => {
    if (!user) return
    void load()
  }, [user])

  const { upcoming, past } = useMemo(() => {
    const t = todayISO()
    const nowMs = Date.now()
    const up: AppointmentRow[] = []
    const pa: AppointmentRow[] = []
    for (const r of rows) {
      const hasTime = !!(r.appointment_time && r.appointment_time.trim())
      if (!hasTime) {
        if (r.appointment_date >= t) up.push(r)
        else pa.push(r)
        continue
      }
      if (appointmentStartMs(r) >= nowMs) up.push(r)
      else pa.push(r)
    }
    return { upcoming: up, past: pa.reverse() }
  }, [rows])

  async function saveNew () {
    if (!user) return
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.from('appointments').insert({
      user_id: user.id,
      doctor: formDoctor.trim() || null,
      specialty: formSpecialty.trim() || null,
      appointment_date: formDate,
      appointment_time: formTime.trim() || null,
    })
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    setShowForm(false)
    setFormDoctor('')
    setFormSpecialty('')
    setFormDate(todayISO())
    setFormTime('')
    await load()
  }

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      <BackButton />
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Appointments</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Add'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button
            type="button"
            className={`btn ${view === 'upcoming' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('upcoming')}
          >
            Upcoming
          </button>
          <button
            type="button"
            className={`btn ${view === 'past' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('past')}
          >
            Past
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>New appointment</h3>
          <div className="form-group">
            <label>Doctor</label>
            <input value={formDoctor} onChange={(e) => setFormDoctor(e.target.value)} placeholder="Name" />
          </div>
          <div className="form-group">
            <label>Specialty</label>
            <input value={formSpecialty} onChange={(e) => setFormSpecialty(e.target.value)} placeholder="Optional" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveNew} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{view === 'upcoming' ? 'Upcoming' : 'Past'}</h3>
        {(view === 'upcoming' ? upcoming : past).length === 0 ? (
          <p className="muted">{view === 'upcoming' ? 'No upcoming appointments.' : 'No past appointments.'}</p>
        ) : null}
        {(view === 'upcoming' ? upcoming : past).map((r) => (
          <div key={r.id} className="list-item">
            <div style={{ fontWeight: 700 }}>{r.doctor ?? '—'}</div>
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              {r.specialty ?? '—'}
            </div>
            <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
              {r.appointment_date}{r.appointment_time ? ` · ${formatTime12h(r.appointment_time)}` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
