import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  PAIN_AREA_LIST, MIDLINE_AREA_LIST,
  painSelectionsToString, type PainAreaSelection,
} from '../lib/parse'

type Screen = 'menu' | 'visit' | 'reaction' | 'mcas' | 'pain' | 'questions' | 'medication' | 'diagnosis'

const PAIN_TYPE_OPTIONS = [
  'Burning', 'Stabbing', 'Aching', 'Throbbing',
  'Sharp', 'Dull', 'Electric shocks', 'Cramping', 'Pressure', 'Tingling',
]

function todayISO () { return new Date().toISOString().slice(0, 10) }
function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

export function QuickLogPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') ?? 'menu') as Screen
  const [screen, setScreen] = useState<Screen>(initialTab)
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showNewDoctorPrompt, setShowNewDoctorPrompt] = useState(false)
  const [pendingDoctorName, setPendingDoctorName] = useState('')

  const defaults = useMemo(() => ({ date: todayISO(), time: nowTime() }), [])

  function showBanner (type: 'success' | 'error' | 'info', text: string) {
    setBanner({ type, text })
    setTimeout(() => setBanner((b) => (b?.text === text ? null : b)), 6500)
  }

  function goBack () {
    if (screen === 'menu') navigate('/app')
    else setScreen('menu')
  }

  // ===== Doctor visit =====
  const [dv, setDv] = useState({
    visit_date: defaults.date, visit_time: defaults.time,
    doctor: '', specialty: '', reason: '', findings: '',
    tests_ordered: '', new_meds: '', med_changes: '',
    instructions: '', follow_up: '', notes: '',
  })

  async function saveDoctor () {
    if (!dv.doctor.trim()) { showBanner('error', 'Doctor name is required.'); return }
    setBusy(true)
    const { error } = await supabase.from('doctor_visits').insert({
      user_id: user!.id,
      visit_date: dv.visit_date, visit_time: dv.visit_time || null,
      doctor: dv.doctor, specialty: dv.specialty || null,
      reason: dv.reason || null, findings: dv.findings || null,
      tests_ordered: dv.tests_ordered || null, new_meds: dv.new_meds || null,
      med_changes: dv.med_changes || null, instructions: dv.instructions || null,
      follow_up: dv.follow_up || null, notes: dv.notes || null,
    })
    setBusy(false)
    if (error) { showBanner('error', error.message); return }

    // check if doctor exists
    const { data: existing } = await supabase.from('doctors')
      .select('id').eq('user_id', user!.id).ilike('name', dv.doctor.trim()).limit(1)
    if (!existing || existing.length === 0) {
      setPendingDoctorName(dv.doctor.trim())
      setShowNewDoctorPrompt(true)
    } else {
      showBanner('success', 'Doctor visit saved.')
      setScreen('menu')
    }
  }

  // ===== MCAS =====
  const [mx, setMx] = useState({
    episode_date: defaults.date, episode_time: defaults.time,
    trigger: '', symptoms: '', onset: '', severity: '',
    relief_and_meds: '', notes: '',
  })

  async function saveMcas () {
    if (!mx.trigger.trim() || !mx.symptoms.trim()) { showBanner('error', 'Trigger and symptoms are required.'); return }
    setBusy(true)
    const { error } = await supabase.from('mcas_episodes').insert({
      user_id: user!.id,
      episode_date: mx.episode_date, episode_time: mx.episode_time || null,
      trigger: mx.trigger, symptoms: mx.symptoms,
      onset: mx.onset || null, severity: mx.severity || null,
      relief: mx.relief_and_meds || null,
      medications_taken: null,
      notes: mx.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', 'MCAS episode saved.'); setScreen('menu') }
  }

  // ===== Pain (left/right toggles) =====
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

  function getSideLabel (area: string): string {
    const sel = painSelections.find((s) => s.area === area)
    if (!sel) return ''
    if (sel.side === 'left') return 'L'
    if (sel.side === 'right') return 'R'
    return 'L+R'
  }

  function isSelected (area: string) {
    return painSelections.some((s) => s.area === area)
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
      user_id: user!.id,
      entry_date: pe.entry_date, entry_time: pe.entry_time || null,
      location: loc, intensity: inten,
      pain_type: painTypePicks.length > 0 ? painTypePicks.join(', ') : null,
      triggers: pe.triggers || null,
      relief_methods: pe.relief_and_meds || null,
      medications_taken: null,
      notes: pe.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', 'Pain entry saved.')
      setPainSelections([]); setPainTypePicks([])
      setScreen('menu')
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
    const inserts = valid.map((q) => ({
      user_id: user!.id, date_created: todayISO(),
      appointment_date: qApptDate || null, doctor: qDoctor || null,
      question: q.text.trim(), priority: q.priority,
      category: null, answer: null, status: 'Unanswered',
    }))
    const { error } = await supabase.from('doctor_questions').insert(inserts)
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', `Saved ${valid.length} question(s).`)
      setQuestions([{ text: '', priority: 'Medium' }])
      setQDoctor(''); setQApptDate('')
      setScreen('menu')
    }
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
    else { showBanner('success', 'Diagnosis note saved.'); setScreen('menu') }
  }

  if (!user) return null

  // ===== New doctor prompt =====
  if (showNewDoctorPrompt) {
    return (
      <div className="card">
        <h3>Add to doctors list?</h3>
        <p className="muted">
          <strong>{pendingDoctorName}</strong> isn't in your doctors list yet. Would you like to add them?
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setShowNewDoctorPrompt(false)
              navigate(`/app/doctors?prefill=${encodeURIComponent(pendingDoctorName)}`)
            }}
          >
            Yes, add doctor
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setShowNewDoctorPrompt(false)
              showBanner('success', 'Visit saved.')
              setScreen('menu')
            }}
          >
            No thanks
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

      {/* MENU */}
      {screen === 'menu' && (
        <div style={{ display: 'grid', gap: 20, padding: '8px 0 40px' }}>
          <button type="button" className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => navigate('/app')}>← Home</button>

          <section>
            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--muted,#888)' }}>Track</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" className="btn btn-primary btn-block" onClick={() => setScreen('pain')}>🩹 Log pain</button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('mcas')}>🔬 MCAS episode</button>
            </div>
          </section>

          <section>
            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--muted,#888)' }}>Doctors</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('visit')}>🏥 Doctor visit</button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('questions')}>❓ Questions for doctor</button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('diagnosis')}>📋 Diagnosis note</button>
            </div>
          </section>
        </div>
      )}

      {/* DOCTOR VISIT */}
      {screen === 'visit' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={goBack}>← Back</button>
          <h3>Doctor visit</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={dv.visit_date} onChange={(e) => setDv({ ...dv, visit_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={dv.visit_time} onChange={(e) => setDv({ ...dv, visit_time: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Doctor</label><input value={dv.doctor} onChange={(e) => setDv({ ...dv, doctor: e.target.value })} placeholder="Dr. Smith" /></div>
            <div className="form-group"><label>Specialty</label><input value={dv.specialty} onChange={(e) => setDv({ ...dv, specialty: e.target.value })} placeholder="Rheumatology" /></div>
          </div>
          {(['reason', 'findings', 'tests_ordered', 'new_meds', 'med_changes', 'instructions', 'follow_up', 'notes'] as const).map((k) => (
            <div className="form-group" key={k}>
              <label>{k.replace(/_/g, ' ')}</label>
              <textarea value={(dv as any)[k]} onChange={(e) => setDv({ ...dv, [k]: e.target.value })} />
            </div>
          ))}
          <button type="button" className="btn btn-primary btn-block" onClick={saveDoctor} disabled={busy}>Save visit</button>
        </div>
      )}

      {/* MCAS */}
      {screen === 'mcas' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={goBack}>← Back</button>
          <h3>MCAS episode</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={mx.episode_date} onChange={(e) => setMx({ ...mx, episode_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={mx.episode_time} onChange={(e) => setMx({ ...mx, episode_time: e.target.value })} /></div>
          </div>
          <div className="form-group">
            <label>Trigger</label>
            <input value={mx.trigger} onChange={(e) => setMx({ ...mx, trigger: e.target.value })} placeholder="Food, meds, stress, weather…" />
          </div>
          <div className="form-group">
            <label>Symptoms</label>
            <textarea value={mx.symptoms} onChange={(e) => setMx({ ...mx, symptoms: e.target.value })} placeholder="Describe symptoms…" />
          </div>
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
          <div className="form-group">
            <label>Relief & medications taken</label>
            <textarea value={mx.relief_and_meds} onChange={(e) => setMx({ ...mx, relief_and_meds: e.target.value })} placeholder="What helped? Any meds taken?" />
          </div>
          <div className="form-group"><label>Notes</label><textarea value={mx.notes} onChange={(e) => setMx({ ...mx, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveMcas} disabled={busy}>Save</button>
        </div>
      )}

      {/* PAIN */}
      {screen === 'pain' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={goBack}>← Back</button>
          <h3>Pain log</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={pe.entry_date} onChange={(e) => setPe({ ...pe, entry_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={pe.entry_time} onChange={(e) => setPe({ ...pe, entry_time: e.target.value })} /></div>
          </div>

          <div className="form-group">
            <label>Area(s) — tap once = Left, twice = Right, three times = Both, four times = deselect</label>
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 2, marginBottom: 8 }}>Bilateral (left/right)</p>
            <div className="pill-grid" style={{ marginBottom: 12 }}>
              {PAIN_AREA_LIST.map((area) => {
                const sel = isSelected(area)
                const label = getSideLabel(area)
                return (
                  <button
                    key={area}
                    type="button"
                    className={`pill ${sel ? 'on' : ''}`}
                    onClick={() => togglePainArea(area)}
                  >
                    {area}{label ? ` (${label})` : ''}
                  </button>
                )
              })}
            </div>
            <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>Midline (no left/right)</p>
            <div className="pill-grid">
              {MIDLINE_AREA_LIST.map((area) => {
                const sel = isSelected(area)
                return (
                  <button
                    key={area}
                    type="button"
                    className={`pill ${sel ? 'on' : ''}`}
                    onClick={() => togglePainArea(area)}
                  >
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
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <option key={n} value={String(n)}>{n}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Pain type(s) — select all that apply</label>
            <div className="pill-grid">
              {PAIN_TYPE_OPTIONS.map((t) => (
                <button key={t} type="button" className={`pill ${painTypePicks.includes(t) ? 'on' : ''}`} onClick={() => togglePainType(t)}>{t}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Triggers</label>
            <input value={pe.triggers} onChange={(e) => setPe({ ...pe, triggers: e.target.value })} placeholder="Weather, activity, stress…" />
          </div>
          <div className="form-group">
            <label>Relief & medications taken</label>
            <textarea value={pe.relief_and_meds} onChange={(e) => setPe({ ...pe, relief_and_meds: e.target.value })} placeholder="What helped? Any meds taken?" />
          </div>
          <div className="form-group"><label>Notes</label><textarea value={pe.notes} onChange={(e) => setPe({ ...pe, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={savePain} disabled={busy}>Save</button>
        </div>
      )}

      {/* QUESTIONS */}
      {screen === 'questions' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={goBack}>← Back</button>
          <h3>Questions for doctor</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Doctor</label>
              <input value={qDoctor} onChange={(e) => setQDoctor(e.target.value)} placeholder="Dr. Smith" />
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
                    {questions.length > 1 && (
                      <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', color: 'red' }} onClick={() => removeQuestion(i)}>✕</button>
                    )}
                  </div>
                </div>
                <textarea value={q.text} onChange={(e) => updateQuestion(i, 'text', e.target.value)} placeholder="Type your question here…" style={{ marginBottom: 8 }} />
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Priority</label>
                  <select value={q.priority} onChange={(e) => updateQuestion(i, 'priority', e.target.value)}>
                    <option value="High">🔴 High</option>
                    <option value="Medium">🟡 Medium</option>
                    <option value="Low">🟢 Low</option>
                  </select>
                </div>
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
          <button type="button" className="btn btn-ghost" onClick={goBack}>← Back</button>
          <h3>Diagnosis note</h3>
          <div className="form-group"><label>Date</label><input type="date" value={dn.note_date} onChange={(e) => setDn({ ...dn, note_date: e.target.value })} /></div>
          <div className="form-group"><label>Doctor</label><input value={dn.doctor} onChange={(e) => setDn({ ...dn, doctor: e.target.value })} placeholder="Dr. Smith" /></div>
          <div className="form-group"><label>Diagnoses mentioned</label><textarea value={dn.diagnoses_mentioned} onChange={(e) => setDn({ ...dn, diagnoses_mentioned: e.target.value })} /></div>
          <div className="form-group"><label>Diagnoses ruled out</label><textarea value={dn.diagnoses_ruled_out} onChange={(e) => setDn({ ...dn, diagnoses_ruled_out: e.target.value })} /></div>
          <div className="form-group"><label>Notes</label><textarea value={dn.notes} onChange={(e) => setDn({ ...dn, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveDiagnosis} disabled={busy}>Save</button>
        </div>
      )}
    </div>
  )
}