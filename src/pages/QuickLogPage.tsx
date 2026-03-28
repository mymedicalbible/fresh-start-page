import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  PAIN_AREA_LIST, MIDLINE_AREA_LIST,
  painSelectionsToString, type PainAreaSelection,
} from '../lib/parse'

type DoctorScreen = 'visit' | 'questions' | 'diagnosis'
type Screen = 'pain' | 'mcas' | DoctorScreen

const PAIN_TYPE_OPTIONS = [
  'Burning', 'Stabbing', 'Aching', 'Throbbing',
  'Sharp', 'Dull', 'Electric shocks', 'Cramping', 'Pressure', 'Tingling',
]

type Doctor = { id: string; name: string; specialty: string | null }
type MedRow = { id: string; medication: string; dose: string | null }

function todayISO () { return new Date().toISOString().slice(0, 10) }
function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

export function QuickLogPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') ?? 'visit') as Screen
  const [screen, setScreen] = useState<Screen>(initialTab)
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showNewDoctorPrompt, setShowNewDoctorPrompt] = useState(false)
  const [pendingDoctorName, setPendingDoctorName] = useState('')
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [, setDoctorMeds] = useState<MedRow[]>([])
  const defaults = useMemo(() => ({ date: todayISO(), time: nowTime() }), [])

  useEffect(() => {
    if (!user) return
    supabase.from('doctors').select('id, name, specialty')
      .eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors((data ?? []) as Doctor[]))
  }, [user])

  function showBanner (type: 'success' | 'error' | 'info', text: string) {
    setBanner({ type, text })
    setTimeout(() => setBanner((b) => (b?.text === text ? null : b)), 6500)
  }

  const isDoctorScreen = screen === 'visit' || screen === 'questions' || screen === 'diagnosis'
  const isPainScreen = screen === 'pain' || screen === 'mcas'

  // ===== Doctor visit =====
  const [dv, setDv] = useState({
    visit_date: defaults.date, visit_time: defaults.time,
    doctor: '', specialty: '', reason: '', findings: '',
    instructions: '', next_appt_date: '', next_appt_time: '', notes: '',
  })
  const [dvTests, setDvTests] = useState([{ test_name: '', reason: '' }])
  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string; action: 'keep' | 'remove' }[]>([])
  const [newMedEntry, setNewMedEntry] = useState({ medication: '', dose: '' })

  async function loadDoctorMeds (doctorName: string) {
    const { data } = await supabase.from('current_medications')
      .select('id, medication, dose').eq('user_id', user!.id)
      .ilike('notes', `%${doctorName}%`)
    const meds = (data ?? []) as MedRow[]
    setDoctorMeds(meds)
    setDvMeds(meds.map((m) => ({ medication: m.medication, dose: m.dose ?? '', action: 'keep' })))
  }

  function handleDoctorSelect (doctorName: string) {
    const doc = doctors.find((d) => d.name === doctorName)
    setDv((prev) => ({ ...prev, doctor: doctorName, specialty: doc?.specialty ?? prev.specialty }))
    if (doctorName) loadDoctorMeds(doctorName)
    else { setDoctorMeds([]); setDvMeds([]) }
  }

  async function saveDoctor () {
    if (!dv.doctor.trim()) { showBanner('error', 'Doctor name is required.'); return }
    setBusy(true)
    const { error: visitError } = await supabase.from('doctor_visits').insert({
      user_id: user!.id, visit_date: dv.visit_date, visit_time: dv.visit_time || null,
      doctor: dv.doctor, specialty: dv.specialty || null, reason: dv.reason || null,
      findings: dv.findings || null,
      tests_ordered: dvTests.filter((t) => t.test_name.trim()).map((t) => t.test_name).join(', ') || null,
      instructions: dv.instructions || null, follow_up: dv.next_appt_date || null, notes: dv.notes || null,
    })
    if (visitError) { setBusy(false); showBanner('error', visitError.message); return }

    const validTests = dvTests.filter((t) => t.test_name.trim())
    if (validTests.length > 0) {
      await supabase.from('tests_ordered').insert(
        validTests.map((t) => ({
          user_id: user!.id, test_date: dv.visit_date, doctor: dv.doctor,
          test_name: t.test_name.trim(), reason: t.reason || null, status: 'Pending',
        }))
      )
    }

    if (dv.next_appt_date) {
      await supabase.from('appointments').insert({
        user_id: user!.id, doctor: dv.doctor, specialty: dv.specialty || null,
        appointment_date: dv.next_appt_date, appointment_time: dv.next_appt_time || null,
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
        dose: newMedEntry.dose || null, notes: `Prescribed by: ${dv.doctor}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,medication' })
    }

    setBusy(false)
    const { data: existing } = await supabase.from('doctors')
      .select('id').eq('user_id', user!.id).ilike('name', dv.doctor.trim()).limit(1)
    if (!existing || existing.length === 0) {
      setPendingDoctorName(dv.doctor.trim())
      setShowNewDoctorPrompt(true)
    } else {
      showBanner('success', 'Visit saved!')
      navigate('/app')
    }
  }

  // ===== MCAS =====
  const [mx, setMx] = useState({
    episode_date: defaults.date, episode_time: defaults.time,
    trigger: '', symptoms: '', onset: '', severity: '', relief_and_meds: '', notes: '',
  })

  async function saveMcas () {
    if (!mx.trigger.trim() || !mx.symptoms.trim()) { showBanner('error', 'Trigger and symptoms are required.'); return }
    setBusy(true)
    const { error } = await supabase.from('mcas_episodes').insert({
      user_id: user!.id, episode_date: mx.episode_date, episode_time: mx.episode_time || null,
      trigger: mx.trigger, symptoms: mx.symptoms, onset: mx.onset || null,
      severity: mx.severity || null, relief: mx.relief_and_meds || null,
      medications_taken: null, notes: mx.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', 'MCAS episode saved.'); navigate('/app') }
  }

  // ===== Pain =====
  const [painSelections, setPainSelections] = useState<PainAreaSelection[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])
  const [pe, setPe] = useState({
    entry_date: defaults.date, entry_time: defaults.time,
    intensity: '' as string, triggers: '', relief_and_meds: '', notes: '',
  })

  function togglePainArea (area: string) {
    setPainSelections((prev) => {
      const existing = prev.find((s) => s.area === area)
      if (!existing) return [...prev, { area, side: 'left' }]
      if (existing.side === 'left') return prev.map((s) => s.area === area ? { ...s, side: 'right' } : s)
      if (existing.side === 'right') return prev.map((s) => s.area === area ? { ...s, side: 'both' } : s)
      return prev.filter((s) => s.area !== area)
    })
  }

  function getSideLabel (area: string) {
    const sel = painSelections.find((s) => s.area === area)
    if (!sel) return ''
    if (sel.side === 'left') return 'L'
    if (sel.side === 'right') return 'R'
    return 'L+R'
  }

  function togglePainType (name: string) {
    setPainTypePicks((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name])
  }

  async function savePain () {
    const loc = painSelectionsToString(painSelections)
    const inten = Number(pe.intensity)
    if (!loc || pe.intensity === '' || Number.isNaN(inten)) {
      showBanner('error', 'Select at least one area and an intensity.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('pain_entries').insert({
      user_id: user!.id, entry_date: pe.entry_date, entry_time: pe.entry_time || null,
      location: loc, intensity: inten,
      pain_type: painTypePicks.length > 0 ? painTypePicks.join(', ') : null,
      triggers: pe.triggers || null, relief_methods: pe.relief_and_meds || null,
      medications_taken: null, notes: pe.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', 'Pain entry saved.')
      setPainSelections([]); setPainTypePicks([])
      navigate('/app')
    }
  }

  // ===== Questions =====
  const [qDoctor, setQDoctor] = useState('')
  const [qApptDate, setQApptDate] = useState('')
  const [questions, setQuestions] = useState([{ text: '', priority: 'Medium' as 'High' | 'Medium' | 'Low' }])

  function addQuestion () { setQuestions((prev) => [...prev, { text: '', priority: 'Medium' }]) }
  function removeQuestion (i: number) { setQuestions((prev) => prev.filter((_, idx) => idx !== i)) }
  function updateQuestion (i: number, field: 'text' | 'priority', value: string) {
    setQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
  }
  function moveQuestion (i: number, dir: -1 | 1) {
    setQuestions((prev) => {
      const next = [...prev]
      const swap = i + dir
      if (swap < 0 || swap >= next.length) return prev;
      [next[i], next[swap]] = [next[swap], next[i]]
      return next
    })
  }

  async function saveQuestions () {
    const valid = questions.filter((q) => q.text.trim().length > 0)
    if (valid.length === 0) { showBanner('error', 'Enter at least one question.'); return }
    setBusy(true)
    const { error } = await supabase.from('doctor_questions').insert(
      valid.map((q) => ({
        user_id: user!.id, date_created: todayISO(),
        appointment_date: qApptDate || null, doctor: qDoctor || null,
        question: q.text.trim(), priority: q.priority,
        category: null, answer: null, status: 'Unanswered',
      }))
    )
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', `Saved ${valid.length} question(s).`); navigate('/app') }
  }

  // ===== Diagnosis =====
  const [dn, setDn] = useState({
    note_date: defaults.date, diagnoses_mentioned: '',
    diagnoses_ruled_out: '', doctor: '', notes: '',
  })

  async function saveDiagnosis () {
    setBusy(true)
    const { error } = await supabase.from('diagnosis_notes').insert({
      user_id: user!.id, note_date: dn.note_date,
      diagnoses_mentioned: dn.diagnoses_mentioned || null,
      diagnoses_ruled_out: dn.diagnoses_ruled_out || null,
      doctor: dn.doctor || null, notes: dn.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', 'Diagnosis note saved.'); navigate('/app') }
  }

  if (!user) return null

  if (showNewDoctorPrompt) {
    return (
      <div className="card">
        <h3>Add to doctors list?</h3>
        <p className="muted"><strong>{pendingDoctorName}</strong> is not in your doctors list yet. Add them?</p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" className="btn btn-primary"
            onClick={() => navigate(`/app/doctors?prefill=${encodeURIComponent(pendingDoctorName)}`)}>
            Yes, add doctor
          </button>
          <button type="button" className="btn btn-ghost"
            onClick={() => { setShowNewDoctorPrompt(false); navigate('/app') }}>
            No thanks
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 16px' }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
      </div>

      {/* DOCTOR LOG TABS — only show when on a doctor screen */}
      {isDoctorScreen && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 10 }}>
          {([
            ['visit', '🏥 Visit'],
            ['questions', '❓ Questions'],
            ['diagnosis', '📋 Diagnosis'],
          ] as [DoctorScreen, string][]).map(([id, label]) => (
            <button key={id} type="button"
              className={`btn ${screen === id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem' }}
              onClick={() => setScreen(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* PAIN TABS — only show when on a pain screen */}
      {isPainScreen && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 10 }}>
          {([
            ['pain', '🩹 Pain'],
            ['mcas', '🔬 MCAS'],
          ] as [Screen, string][]).map(([id, label]) => (
            <button key={id} type="button"
              className={`btn ${screen === id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem' }}
              onClick={() => setScreen(id)}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* DOCTOR VISIT */}
      {screen === 'visit' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Doctor visit</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={dv.visit_date} onChange={(e) => setDv({ ...dv, visit_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={dv.visit_time} onChange={(e) => setDv({ ...dv, visit_time: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Doctor</label>
              <select value={dv.doctor} onChange={(e) => handleDoctorSelect(e.target.value)}>
                <option value="">— Select doctor —</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                <option value="__new__">+ New doctor…</option>
              </select>
              {dv.doctor === '__new__' && (
                <input style={{ marginTop: 6 }} placeholder="Type doctor name"
                  onChange={(e) => handleDoctorSelect(e.target.value)} />
              )}
            </div>
            <div className="form-group">
              <label>Specialty</label>
              <input value={dv.specialty} onChange={(e) => setDv({ ...dv, specialty: e.target.value })} placeholder="Auto-filled from doctor list" />
            </div>
          </div>
          <div className="form-group"><label>Reason for visit</label><textarea value={dv.reason} onChange={(e) => setDv({ ...dv, reason: e.target.value })} /></div>
          <div className="form-group"><label>Findings</label><textarea value={dv.findings} onChange={(e) => setDv({ ...dv, findings: e.target.value })} /></div>

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

          <div className="form-group"><label>Instructions</label><textarea value={dv.instructions} onChange={(e) => setDv({ ...dv, instructions: e.target.value })} /></div>
          <div className="form-group"><label>Notes</label><textarea value={dv.notes} onChange={(e) => setDv({ ...dv, notes: e.target.value })} /></div>

          <div className="form-group">
            <label style={{ fontWeight: 600 }}>📅 Schedule next appointment</label>
            <div className="form-row">
              <div className="form-group"><label>Date</label><input type="date" value={dv.next_appt_date} onChange={(e) => setDv({ ...dv, next_appt_date: e.target.value })} /></div>
              <div className="form-group"><label>Time</label><input type="time" value={dv.next_appt_time} onChange={(e) => setDv({ ...dv, next_appt_time: e.target.value })} /></div>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={saveDoctor} disabled={busy}>Save visit</button>
        </div>
      )}

      {/* QUESTIONS */}
      {screen === 'questions' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Questions for doctor</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Doctor</label>
              <select value={qDoctor} onChange={(e) => setQDoctor(e.target.value)}>
                <option value="">— Select doctor —</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Appointment date</label>
              <input type="date" value={qApptDate} onChange={(e) => setQApptDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            {questions.map((q, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: '#fafafa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Question {i + 1}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => moveQuestion(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1}>↓</button>
                    {questions.length > 1 && <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', color: 'red' }} onClick={() => removeQuestion(i)}>✕</button>}
                  </div>
                </div>
                <textarea value={q.text} onChange={(e) => updateQuestion(i, 'text', e.target.value)} placeholder="Type your question…" style={{ marginBottom: 8 }} />
                <select value={q.priority} onChange={(e) => updateQuestion(i, 'priority', e.target.value)}>
                  <option value="High">🔴 High</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={addQuestion}>+ Add another question</button>
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={saveQuestions} disabled={busy}>
            Save {questions.filter((q) => q.text.trim()).length} question(s)
          </button>
        </div>
      )}

      {/* DIAGNOSIS */}
      {screen === 'diagnosis' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Diagnosis note</h3>
          <div className="form-group"><label>Date</label><input type="date" value={dn.note_date} onChange={(e) => setDn({ ...dn, note_date: e.target.value })} /></div>
          <div className="form-group">
            <label>Doctor</label>
            <select value={dn.doctor} onChange={(e) => setDn({ ...dn, doctor: e.target.value })}>
              <option value="">— Select doctor —</option>
              {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Diagnoses mentioned</label><textarea value={dn.diagnoses_mentioned} onChange={(e) => setDn({ ...dn, diagnoses_mentioned: e.target.value })} /></div>
          <div className="form-group"><label>Diagnoses ruled out</label><textarea value={dn.diagnoses_ruled_out} onChange={(e) => setDn({ ...dn, diagnoses_ruled_out: e.target.value })} /></div>
          <div className="form-group"><label>Notes</label><textarea value={dn.notes} onChange={(e) => setDn({ ...dn, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveDiagnosis} disabled={busy}>Save</button>
        </div>
      )}

      {/* PAIN */}
      {screen === 'pain' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pain log</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={pe.entry_date} onChange={(e) => setPe({ ...pe, entry_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={pe.entry_time} onChange={(e) => setPe({ ...pe, entry_time: e.target.value })} /></div>
          </div>
          <div className="form-group">
            <label>Area(s) — tap once = Left, twice = Right, three times = Both, four = deselect</label>
            <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>Bilateral (left/right)</p>
            <div className="pill-grid" style={{ marginBottom: 12 }}>
              {PAIN_AREA_LIST.map((area) => {
                const label = getSideLabel(area)
                const sel = painSelections.some((s) => s.area === area)
                return (
                  <button key={area} type="button" className={`pill ${sel ? 'on' : ''}`}
                    onClick={() => togglePainArea(area)}>
                    {area}{label ? ` (${label})` : ''}
                  </button>
                )
              })}
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>Midline</p>
            <div className="pill-grid">
              {MIDLINE_AREA_LIST.map((area) => {
                const sel = painSelections.some((s) => s.area === area)
                return (
                  <button key={area} type="button" className={`pill ${sel ? 'on' : ''}`}
                    onClick={() => togglePainArea(area)}>
                    {area}
                  </button>
                )
              })}
            </div>
            {painSelections.length > 0 && (
              <div className="muted" style={{ marginTop: 10, fontSize: '0.85rem' }}>
                Selected: {painSelectionsToString(painSelections)}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Intensity 0–10</label>
            <select value={pe.intensity} onChange={(e) => setPe({ ...pe, intensity: e.target.value })}>
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, i) => i).map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Pain type(s)</label>
            <div className="pill-grid">
              {PAIN_TYPE_OPTIONS.map((t) => (
                <button key={t} type="button" className={`pill ${painTypePicks.includes(t) ? 'on' : ''}`}
                  onClick={() => togglePainType(t)}>{t}</button>
              ))}
            </div>
          </div>
          <div className="form-group"><label>Triggers</label><input value={pe.triggers} onChange={(e) => setPe({ ...pe, triggers: e.target.value })} placeholder="Weather, activity, stress…" /></div>
          <div className="form-group"><label>Relief & medications taken</label><textarea value={pe.relief_and_meds} onChange={(e) => setPe({ ...pe, relief_and_meds: e.target.value })} /></div>
          <div className="form-group"><label>Notes</label><textarea value={pe.notes} onChange={(e) => setPe({ ...pe, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={savePain} disabled={busy}>Save</button>
        </div>
      )}

      {/* MCAS */}
      {screen === 'mcas' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>MCAS episode</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={mx.episode_date} onChange={(e) => setMx({ ...mx, episode_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={mx.episode_time} onChange={(e) => setMx({ ...mx, episode_time: e.target.value })} /></div>
          </div>
          <div className="form-group"><label>Trigger</label><input value={mx.trigger} onChange={(e) => setMx({ ...mx, trigger: e.target.value })} placeholder="Food, meds, stress, weather…" /></div>
          <div className="form-group"><label>Symptoms</label><textarea value={mx.symptoms} onChange={(e) => setMx({ ...mx, symptoms: e.target.value })} placeholder="Describe symptoms…" /></div>
          <div className="form-row">
            <div className="form-group"><label>Onset</label><input value={mx.onset} onChange={(e) => setMx({ ...mx, onset: e.target.value })} placeholder="How quickly?" /></div>
            <div className="form-group">
              <label>Severity</label>
              <select value={mx.severity} onChange={(e) => setMx({ ...mx, severity: e.target.value })}>
                <option value="">—</option>
                <option>Mild</option><option>Moderate</option><option>Severe</option>
              </select>
            </div>
          </div>
          <div className="form-group"><label>Relief & medications taken</label><textarea value={mx.relief_and_meds} onChange={(e) => setMx({ ...mx, relief_and_meds: e.target.value })} /></div>
          <div className="form-group"><label>Notes</label><textarea value={mx.notes} onChange={(e) => setMx({ ...mx, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveMcas} disabled={busy}>Save</button>
        </div>
      )}
    </div>
  )
}