import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Doctor = { id: string; name: string; specialty: string | null }

type VisitRow = {
  id: string
  visit_date: string
  visit_time: string | null
  doctor: string | null
  specialty: string | null
  reason: string | null
  findings: string | null
  tests_ordered: string | null
  new_meds: string | null
  instructions: string | null
  follow_up: string | null
  notes: string | null
}

function todayISO () { return new Date().toISOString().slice(0, 10) }
function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

export function VisitsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showNewDoctorPrompt, setShowNewDoctorPrompt] = useState(false)
  const [pendingDoctorName, setPendingDoctorName] = useState('')

  const [form, setForm] = useState({
    visit_date: todayISO(), visit_time: nowTime(),
    doctor: '', specialty: '', reason: '', findings: '',
    instructions: '', next_appt_date: '', next_appt_time: '', notes: '',
  })
  const [dvTests, setDvTests] = useState([{ test_name: '', reason: '' }])
  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string; action: 'keep' | 'remove' }[]>([])
  const [newMedEntry, setNewMedEntry] = useState({ medication: '', dose: '' })

  useEffect(() => {
    if (!user) return
    loadVisits()
    supabase.from('doctors').select('id, name, specialty')
      .eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors((data ?? []) as Doctor[]))
  }, [user])

  async function loadVisits () {
    const { data, error: e } = await supabase
      .from('doctor_visits').select('*')
      .eq('user_id', user!.id)
      .order('visit_date', { ascending: false })
      .limit(50)
    if (e) setError(e.message)
    else setVisits((data ?? []) as VisitRow[])
  }

  async function loadDoctorMeds (doctorName: string) {
    const { data } = await supabase.from('current_medications')
      .select('id, medication, dose').eq('user_id', user!.id)
      .ilike('notes', `%${doctorName}%`)
    const meds = (data ?? []) as { id: string; medication: string; dose: string | null }[]
    setDvMeds(meds.map((m) => ({ medication: m.medication, dose: m.dose ?? '', action: 'keep' })))
  }

  function handleDoctorSelect (doctorName: string) {
    const doc = doctors.find((d) => d.name === doctorName)
    setForm((prev) => ({
      ...prev,
      doctor: doctorName,
      specialty: doc?.specialty ?? prev.specialty,
    }))
    if (doctorName && doctorName !== '__new__') loadDoctorMeds(doctorName)
    else setDvMeds([])
  }

  async function saveVisit () {
    if (!form.doctor.trim() || form.doctor === '__new__') {
      setError('Please select or enter a doctor name.'); return
    }
    setBusy(true)
    const validTests = dvTests.filter((t) => t.test_name.trim())

    const { error: ve } = await supabase.from('doctor_visits').insert({
      user_id: user!.id,
      visit_date: form.visit_date, visit_time: form.visit_time || null,
      doctor: form.doctor, specialty: form.specialty || null,
      reason: form.reason || null, findings: form.findings || null,
      tests_ordered: validTests.map((t) => t.test_name).join(', ') || null,
      instructions: form.instructions || null,
      follow_up: form.next_appt_date || null,
      notes: form.notes || null,
    })
    if (ve) { setError(ve.message); setBusy(false); return }

    if (validTests.length > 0) {
      await supabase.from('tests_ordered').insert(
        validTests.map((t) => ({
          user_id: user!.id, test_date: form.visit_date,
          doctor: form.doctor, test_name: t.test_name.trim(),
          reason: t.reason || null, status: 'Pending',
        }))
      )
    }

    if (form.next_appt_date) {
      await supabase.from('appointments').insert({
        user_id: user!.id, doctor: form.doctor,
        specialty: form.specialty || null,
        appointment_date: form.next_appt_date,
        appointment_time: form.next_appt_time || null,
      })
    }

    for (const m of dvMeds) {
      if (m.action === 'remove') {
        await supabase.from('current_medications')
          .delete().eq('user_id', user!.id).eq('medication', m.medication)
      }
    }

    if (newMedEntry.medication.trim()) {
      await supabase.from('current_medications').upsert({
        user_id: user!.id, medication: newMedEntry.medication.trim(),
        dose: newMedEntry.dose || null,
        notes: `Prescribed by: ${form.doctor}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,medication' })
    }

    setBusy(false)

    const { data: existing } = await supabase.from('doctors')
      .select('id').eq('user_id', user!.id).ilike('name', form.doctor.trim()).limit(1)
    if (!existing || existing.length === 0) {
      setPendingDoctorName(form.doctor.trim())
      setShowNewDoctorPrompt(true)
    } else {
      setBanner('Visit saved!')
      setShowForm(false)
      resetForm()
      loadVisits()
      setTimeout(() => setBanner(null), 4000)
    }
  }

  function resetForm () {
    setForm({ visit_date: todayISO(), visit_time: nowTime(), doctor: '', specialty: '', reason: '', findings: '', instructions: '', next_appt_date: '', next_appt_time: '', notes: '' })
    setDvTests([{ test_name: '', reason: '' }])
    setDvMeds([])
    setNewMedEntry({ medication: '', dose: '' })
  }

  if (!user) return null

  if (showNewDoctorPrompt) {
    return (
      <div style={{ padding: '8px 0 40px' }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Add to doctors list?</h3>
          <p className="muted"><strong>{pendingDoctorName}</strong> isn't in your doctors list yet. Add them?</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" className="btn btn-primary"
              onClick={() => navigate(`/app/doctors?prefill=${encodeURIComponent(pendingDoctorName)}`)}>
              Yes, add doctor
            </button>
            <button type="button" className="btn btn-ghost"
              onClick={() => {
                setShowNewDoctorPrompt(false)
                setBanner('Visit saved!')
                setShowForm(false)
                resetForm()
                loadVisits()
                setTimeout(() => setBanner(null), 4000)
              }}>
              No thanks
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>🏥 Doctor visits</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => { setShowForm((v) => !v); resetForm() }}>
            {showForm ? 'Cancel' : '+ Log new visit'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>All visits across all doctors.</p>
      </div>

      {/* LOG VISIT FORM */}
      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>New visit</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={form.visit_time} onChange={(e) => setForm({ ...form, visit_time: e.target.value })} /></div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Doctor</label>
              <select value={form.doctor} onChange={(e) => handleDoctorSelect(e.target.value)}>
                <option value="">— Select doctor —</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                <option value="__new__">+ New doctor…</option>
              </select>
              {form.doctor === '__new__' && (
                <input style={{ marginTop: 6 }} placeholder="Type doctor name"
                  onChange={(e) => setForm({ ...form, doctor: e.target.value })} />
              )}
            </div>
            <div className="form-group">
              <label>Specialty</label>
              <input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Auto-filled from doctor list" />
            </div>
          </div>

          <div className="form-group"><label>Reason for visit</label><textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <div className="form-group"><label>Findings</label><textarea value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} /></div>

          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Tests / orders</label>
            {dvTests.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <input style={{ flex: 2 }} value={t.test_name} placeholder="Test name"
                  onChange={(e) => setDvTests((prev) => prev.map((x, idx) => idx === i ? { ...x, test_name: e.target.value } : x))} />
                <input style={{ flex: 2 }} value={t.reason} placeholder="Reason"
                  onChange={(e) => setDvTests((prev) => prev.map((x, idx) => idx === i ? { ...x, reason: e.target.value } : x))} />
                {dvTests.length > 1 && (
                  <button type="button" className="btn btn-ghost" style={{ color: 'red' }}
                    onClick={() => setDvTests((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                )}
              </div>
            ))}
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}
              onClick={() => setDvTests((prev) => [...prev, { test_name: '', reason: '' }])}>+ Add test</button>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Medications from this doctor</label>
            {dvMeds.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No medications linked to this doctor yet.</p>}
            {dvMeds.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.9rem' }}>{m.medication}{m.dose ? ` · ${m.dose}` : ''}</span>
                <button type="button"
                  className={`btn ${m.action === 'remove' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ fontSize: '0.75rem', padding: '2px 10px', color: m.action === 'remove' ? 'white' : 'red' }}
                  onClick={() => setDvMeds((prev) => prev.map((x, idx) => idx === i ? { ...x, action: x.action === 'remove' ? 'keep' : 'remove' } : x))}>
                  {m.action === 'remove' ? 'Undo' : 'Remove'}
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input style={{ flex: 2 }} value={newMedEntry.medication} placeholder="Add new medication"
                onChange={(e) => setNewMedEntry((prev) => ({ ...prev, medication: e.target.value }))} />
              <input style={{ flex: 1 }} value={newMedEntry.dose} placeholder="Dose"
                onChange={(e) => setNewMedEntry((prev) => ({ ...prev, dose: e.target.value }))} />
            </div>
          </div>

          <div className="form-group"><label>Instructions</label><textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

          <div className="form-group">
            <label style={{ fontWeight: 600 }}>📅 Schedule next appointment</label>
            <div className="form-row">
              <div className="form-group"><label>Date</label><input type="date" value={form.next_appt_date} onChange={(e) => setForm({ ...form, next_appt_date: e.target.value })} /></div>
              <div className="form-group"><label>Time</label><input type="time" value={form.next_appt_time} onChange={(e) => setForm({ ...form, next_appt_time: e.target.value })} /></div>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={saveVisit} disabled={busy}>Save visit</button>
        </div>
      )}

      {/* VISITS LIST */}
      {visits.length === 0 && !showForm && (
        <div className="card"><p className="muted">No visits logged yet.</p></div>
      )}

      {visits.map((v) => {
        const isOpen = expandedId === v.id
        return (
          <div key={v.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setExpandedId(isOpen ? null : v.id)}>
              <div>
                <div style={{ fontWeight: 700 }}>{v.visit_date}{v.visit_time ? ` · ${v.visit_time}` : ''}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {v.doctor ?? '—'}{v.specialty ? ` · ${v.specialty}` : ''}
                </div>
                {v.reason && <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{v.reason}</div>}
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 6 }}>
                {v.findings && <div className="muted" style={{ fontSize: '0.85rem' }}>Findings: {v.findings}</div>}
                {v.tests_ordered && <div className="muted" style={{ fontSize: '0.85rem' }}>Tests: {v.tests_ordered}</div>}
                {v.instructions && <div className="muted" style={{ fontSize: '0.85rem' }}>Instructions: {v.instructions}</div>}
                {v.follow_up && <div className="muted" style={{ fontSize: '0.85rem' }}>Next appt: {v.follow_up}</div>}
                {v.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>Notes: {v.notes}</div>}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}