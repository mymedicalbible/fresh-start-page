import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { VisitLogWizard } from '../components/VisitLogWizard'
import { ensureDoctorProfile } from '../lib/ensureDoctorProfile'

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
  status?: string | null
}

function todayISO () { return new Date().toISOString().slice(0, 10) }
function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

/** Match dashboard doctor name normalization for pending-visit filters */
function normDoctorName (name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/^dr\.?\s+/i, '')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
}

export function VisitsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const wizardNew = searchParams.get('new') === '1'
  const resumeId = searchParams.get('resume')
  const prefillDoctor = searchParams.get('doctor') ?? ''
  /** With `tab=pending`, restricts the list to this doctor (dashboard upcoming card). */
  const pendingDoctorFilter = prefillDoctor.trim()
  // FIX: read ?tab=pending from URL so dashboard badge works
  const tabParam = searchParams.get('tab')

  const [visits, setVisits] = useState<VisitRow[]>([])
  const [listTab, setListTab] = useState<'all' | 'pending'>(
    tabParam === 'pending' ? 'pending' : 'all'
  )
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [customDoctorName, setCustomDoctorName] = useState('')

  const [form, setForm] = useState({
    visit_date: todayISO(), visit_time: nowTime(),
    specialty: '', reason: '', findings: '',
    instructions: '', next_appt_date: '', next_appt_time: '', notes: '',
  })
  const [dvTests, setDvTests] = useState([{ test_name: '', reason: '' }])
  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string; action: 'keep' | 'remove' }[]>([])
  const [newMedEntry, setNewMedEntry] = useState({ medication: '', dose: '', frequency: '' })

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
    const prefix = `Prescribed by: ${doctorName}%`
    const { data } = await supabase.from('current_medications')
      .select('id, medication, dose').eq('user_id', user!.id)
      .ilike('notes', prefix)
    const meds = (data ?? []) as { id: string; medication: string; dose: string | null }[]
    setDvMeds(meds.map((m) => ({ medication: m.medication, dose: m.dose ?? '', action: 'keep' })))
  }

  function handleDoctorDropdownChange (value: string) {
    setSelectedDoctor(value)
    if (value === '__new__') {
      setCustomDoctorName('')
      setForm((prev) => ({ ...prev, specialty: '' }))
      setDvMeds([])
    } else if (value) {
      const doc = doctors.find((d) => d.name === value)
      setForm((prev) => ({ ...prev, specialty: doc?.specialty ?? '' }))
      loadDoctorMeds(value)
    } else {
      setForm((prev) => ({ ...prev, specialty: '' }))
      setDvMeds([])
    }
  }

  const effectiveDoctorName = selectedDoctor === '__new__' ? customDoctorName.trim() : selectedDoctor

  async function saveVisit () {
    if (!effectiveDoctorName) { setError('Please select or enter a doctor name.'); return }
    setBusy(true)
    const validTests = dvTests.filter((t) => t.test_name.trim())

    const { error: ve } = await supabase.from('doctor_visits').insert({
      user_id: user!.id,
      visit_date: form.visit_date,
      visit_time: form.visit_time || null,
      doctor: effectiveDoctorName,
      specialty: form.specialty || null,
      reason: form.reason || null,
      findings: form.findings || null,
      tests_ordered: validTests.map((t) => t.test_name).join(', ') || null,
      instructions: form.instructions || null,
      follow_up: form.next_appt_date || null,
      notes: form.notes || null,
      status: 'complete',
    })
    if (ve) { setError(ve.message); setBusy(false); return }

    if (validTests.length > 0) {
      const { error: te } = await supabase.from('tests_ordered').insert(
        validTests.map((t) => ({
          user_id: user!.id,
          test_date: form.visit_date,
          doctor: effectiveDoctorName,
          test_name: t.test_name.trim(),
          reason: t.reason || null,
          status: 'Pending',
        }))
      )
      if (te) console.warn('tests_ordered insert:', te.message)
    }

    if (form.next_appt_date) {
      const { error: ae } = await supabase.from('appointments').insert({
        user_id: user!.id,
        doctor: effectiveDoctorName,
        specialty: form.specialty || null,
        appointment_date: form.next_appt_date,
        appointment_time: form.next_appt_time || null,
      })
      if (ae) console.warn('appointments insert:', ae.message)
    }

    for (const m of dvMeds) {
      if (m.action === 'remove') {
        await supabase.from('current_medications')
          .delete().eq('user_id', user!.id).eq('medication', m.medication)
      }
    }

    if (newMedEntry.medication.trim()) {
      const { error: me } = await supabase.from('current_medications').upsert({
        user_id: user!.id,
        medication: newMedEntry.medication.trim(),
        dose: newMedEntry.dose || null,
        frequency: newMedEntry.frequency || null,
        notes: `Prescribed by: ${effectiveDoctorName}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,medication' })
      if (me) { setError(me.message); setBusy(false); return }
    }

    setBusy(false)
    void ensureDoctorProfile(user!.id, effectiveDoctorName, form.specialty || null)
    setBanner('Visit saved!')
    setShowForm(false)
    resetForm()
    loadVisits()
    setTimeout(() => setBanner(null), 4000)
  }

  function resetForm () {
    setSelectedDoctor('')
    setCustomDoctorName('')
    setForm({
      visit_date: todayISO(), visit_time: nowTime(),
      specialty: '', reason: '', findings: '',
      instructions: '', next_appt_date: '', next_appt_time: '', notes: '',
    })
    setDvTests([{ test_name: '', reason: '' }])
    setDvMeds([])
    setNewMedEntry({ medication: '', dose: '', frequency: '' })
  }

  if (!user) return null

  if (wizardNew || resumeId) {
    return (
      <div style={{ paddingBottom: 40 }}>
        <BackButton label="Visits" fallbackTo="/app/visits" />
        <VisitLogWizard
          resumeVisitId={resumeId}
          initialDoctorName={prefillDoctor}
          onCancel={() => navigate('/app/visits')}
          onDone={() => navigate('/app')}
        />
      </div>
    )
  }


  return (
    <div style={{ paddingBottom: 40 }}>
      <BackButton label="Back" />
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>🏥 Doctor visits</h2>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/app/visits?new=1')}>
            Log visit
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button"
            className={`btn ${listTab === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            onClick={() => setListTab('all')}>All</button>
          <button type="button"
            className={`btn ${listTab === 'pending' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            onClick={() => setListTab('pending')}>Pending</button>
          <span style={{ color: 'var(--border)', userSelect: 'none' }}>|</span>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem' }}
            onClick={() => { setShowForm((v) => !v); if (showForm) resetForm() }}>
            {showForm ? 'Cancel full form' : 'Full form…'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: '0.88rem', lineHeight: 1.45 }}>
          Use <strong>Log visit</strong> for the quick guided steps. <strong>Pending</strong> is for visits saved before adding tests or follow-up.
        </p>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>New visit</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={form.visit_time} onChange={(e) => setForm({ ...form, visit_time: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Doctor</label>
              <select value={selectedDoctor} onChange={(e) => handleDoctorDropdownChange(e.target.value)}>
                <option value="">— Select doctor —</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                <option value="__new__">+ New doctor not in list…</option>
              </select>
              {selectedDoctor === '__new__' && (
                <input style={{ marginTop: 8 }} placeholder="Type doctor's full name"
                  value={customDoctorName} onChange={(e) => setCustomDoctorName(e.target.value)} />
              )}
            </div>
            <div className="form-group">
              <label>Specialty</label>
              <input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Auto-filled or type here" />
            </div>
          </div>
          <div className="form-group">
            <label>Reason for visit</label>
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Findings</label>
            <textarea value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} />
          </div>
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Tests / orders</label>
            {dvTests.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <input style={{ flex: 2 }} value={t.test_name} placeholder="Test name"
                  onChange={(e) => setDvTests((prev) => prev.map((x, idx) => idx === i ? { ...x, test_name: e.target.value } : x))} />
                <input style={{ flex: 2 }} value={t.reason} placeholder="Reason (optional)"
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
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input style={{ flex: '2 1 130px' }} value={newMedEntry.medication} placeholder="New medication name"
                onChange={(e) => setNewMedEntry((prev) => ({ ...prev, medication: e.target.value }))} />
              <input style={{ flex: '1 1 80px' }} value={newMedEntry.dose} placeholder="Dose"
                onChange={(e) => setNewMedEntry((prev) => ({ ...prev, dose: e.target.value }))} />
              <input style={{ flex: '1 1 120px' }} value={newMedEntry.frequency} placeholder="How often (e.g. once daily)"
                onChange={(e) => setNewMedEntry((prev) => ({ ...prev, frequency: e.target.value }))} />
            </div>
          </div>
          <div className="form-group"><label>Instructions</label><textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="form-group">
            <label style={{ fontWeight: 600 }}>📅 Schedule next appointment</label>
            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.next_appt_date} onChange={(e) => setForm({ ...form, next_appt_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Time</label>
                <input type="time" value={form.next_appt_time} onChange={(e) => setForm({ ...form, next_appt_time: e.target.value })} />
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveVisit} disabled={busy}>Save visit</button>
        </div>
      )}

      {(() => {
        const listVisits = visits.filter((v) => {
          if (listTab === 'pending') {
            if ((v.status ?? 'complete') !== 'pending') return false
            if (pendingDoctorFilter) {
              const vn = normDoctorName(v.doctor ?? '')
              const fn = normDoctorName(pendingDoctorFilter)
              if (vn !== fn) return false
            }
            return true
          }
          return true
        })
        if (listVisits.length === 0 && !showForm) {
          return (
            <div className="card">
              <p className="muted">
                {listTab === 'pending'
                  ? (pendingDoctorFilter
                      ? `No pending visits for ${pendingDoctorFilter}.`
                      : 'No pending visits. All caught up!')
                  : 'No visits logged yet.'}
              </p>
            </div>
          )
        }
        return listVisits.map((v) => {
          const isOpen = expandedId === v.id
          const isPending = (v.status ?? 'complete') === 'pending'
          const doctorProfileId = v.doctor
            ? doctors.find((d) => d.name === v.doctor)?.id
            : undefined
          return (
            <div key={v.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => setExpandedId(isOpen ? null : v.id)}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {v.visit_date}{v.visit_time ? ` · ${v.visit_time}` : ''}
                    {isPending && (
                      <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#92400e', verticalAlign: 'middle' }}>
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {doctorProfileId
                      ? (
                        <Link
                          to={`/app/doctors/${doctorProfileId}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}
                        >
                          {v.doctor}
                        </Link>
                        )
                      : (v.doctor ?? '—')}
                    {v.specialty ? ` · ${v.specialty}` : ''}
                  </div>
                  {v.reason && <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{v.reason}</div>}
                  {isPending && (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem', marginTop: 8 }}
                      onClick={(e) => { e.stopPropagation(); navigate(`/app/visits?resume=${v.id}`) }}>
                      Continue visit
                    </button>
                  )}
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
        })
      })()}
    </div>
  )
}