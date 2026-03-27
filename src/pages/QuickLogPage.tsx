import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parsePainAreas } from '../lib/parse'

type Screen = 'menu' | 'visit' | 'reaction' | 'mcas' | 'pain' | 'questions' | 'medication' | 'diagnosis'

const PAIN_AREA_PRESETS = ['Knees', 'Back', 'Neck', 'Head', 'Hands', 'Feet', 'Shoulders', 'Hips', 'Thighs', 'Chest', 'Abdomen', 'Arms']
const PAIN_TYPE_OPTIONS = ['Burning', 'Stabbing', 'Aching', 'Throbbing', 'Sharp', 'Dull', 'Electric shocks', 'Cramping', 'Pressure', 'Tingling']

function todayISO () { return new Date().toISOString().slice(0, 10) }
function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

export function QuickLogPage () {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') ?? 'menu') as Screen

  const [screen, setScreen] = useState<Screen>(initialTab)
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const defaults = useMemo(() => ({ date: todayISO(), time: nowTime() }), [])

  function showBanner (type: 'success' | 'error' | 'info', text: string) {
    setBanner({ type, text })
    setTimeout(() => setBanner((b) => (b?.text === text ? null : b)), 6500)
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
    if (error) showBanner('error', error.message)
    else { showBanner('success', 'Doctor visit saved.'); setScreen('menu') }
  }

  // ===== Medication reaction (reworked per #7) =====
  const [mr, setMr] = useState({
    reaction_date: defaults.date, reaction_time: defaults.time,
    medication: '', prescribed_by: '', prescribed_date: '',
    dose: '', reason_taking: '', positive_effects: '',
    side_effects_noticed: '', severity: '', effect_score: '' as string,
    notes: '',
  })

  async function saveMedReaction () {
    if (!mr.medication.trim()) { showBanner('error', 'Medication name is required.'); return }
    setBusy(true)
    const effect = mr.effect_score === '' ? 5 : Number(mr.effect_score)
    const { error } = await supabase.from('med_reactions').insert({
      user_id: user!.id,
      reaction_date: mr.reaction_date,
      reaction_time: mr.reaction_time || null,
      medication: mr.medication,
      dose: mr.dose || null,
      reaction: mr.side_effects_noticed || '',
      severity: mr.severity || null,
      effect_score: effect,
      notes: [
        mr.prescribed_by ? `Prescribed by: ${mr.prescribed_by}` : '',
        mr.prescribed_date ? `Prescribed on: ${mr.prescribed_date}` : '',
        mr.reason_taking ? `Reason: ${mr.reason_taking}` : '',
        mr.positive_effects ? `Positive effects: ${mr.positive_effects}` : '',
        mr.notes ? mr.notes : '',
      ].filter(Boolean).join('\n') || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', 'Medication log saved.'); setScreen('menu') }
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

  // ===== Pain (multi-type) =====
  const [painPicks, setPainPicks] = useState<string[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])
  const [pe, setPe] = useState({
    entry_date: defaults.date, entry_time: defaults.time,
    location: '', intensity: '' as string,
    triggers: '', relief_and_meds: '', notes: '',
  })

  function togglePainArea (name: string) {
    setPainPicks((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name])
  }

  function togglePainType (name: string) {
    setPainTypePicks((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name])
  }

  const parsedPainAreas = useMemo(() => {
    const loc = pe.location.trim() || painPicks.join(', ')
    return parsePainAreas(loc)
  }, [pe.location, painPicks])

  async function savePain () {
    const loc = pe.location.trim() || painPicks.join(', ')
    const inten = Number(pe.intensity)
    if (!loc || pe.intensity === '' || Number.isNaN(inten)) {
      showBanner('error', 'Location and intensity are required.')
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
      setPainPicks([]); setPainTypePicks([])
      setScreen('menu')
    }
  }

  // ===== Questions (add multiple, prioritize) =====
  const [qDoctor, setQDoctor] = useState('')
  const [qApptDate, setQApptDate] = useState('')
  const [questions, setQuestions] = useState([{ text: '', priority: 'Medium' as 'High' | 'Medium' | 'Low' }])

  function addQuestion () {
    setQuestions((prev) => [...prev, { text: '', priority: 'Medium' }])
  }

  function removeQuestion (i: number) {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i))
  }

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
      user_id: user!.id,
      date_created: todayISO(),
      appointment_date: qApptDate || null,
      doctor: qDoctor || null,
      question: q.text.trim(),
      priority: q.priority,
      category: null,
      answer: null,
      status: 'Unanswered',
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

  // ===== Current medication =====
  const [cm, setCm] = useState({
    medication: '', dose: '', frequency: '',
    start_date: todayISO(), purpose: '',
    prescribed_by: '', effectiveness: '',
    side_effects: '', notes: '',
  })

  async function upsertMed () {
    if (!cm.medication.trim()) { showBanner('error', 'Medication name is required.'); return }
    setBusy(true)
    const { error } = await supabase.from('current_medications').upsert(
      {
        user_id: user!.id,
        medication: cm.medication.trim(),
        dose: cm.dose || null, frequency: cm.frequency || null,
        start_date: cm.start_date || null,
        purpose: cm.purpose || null,
        effectiveness: cm.effectiveness || null,
        side_effects: cm.side_effects || null,
        notes: [
          cm.prescribed_by ? `Prescribed by: ${cm.prescribed_by}` : '',
          cm.notes,
        ].filter(Boolean).join('\n') || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,medication' },
    )
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', 'Medication list updated.'); setScreen('menu') }
  }

  // ===== Diagnosis =====
  const [dn, setDn] = useState({
    note_date: defaults.date, diagnoses_mentioned: '',
    diagnoses_ruled_out: '', doctor: '', notes: '',
  })

  async function saveDiagnosis () {
    setBusy(true)
    const { error } = await supabase.from('diagnosis_notes').insert({
      user_id: user!.id,
      note_date: dn.note_date,
      diagnoses_mentioned: dn.diagnoses_mentioned || null,
      diagnoses_ruled_out: dn.diagnoses_ruled_out || null,
      doctor: dn.doctor || null,
      notes: dn.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', 'Diagnosis note saved.'); setScreen('menu') }
  }

  if (!user) return null

  return (
    <div>
      {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

      {/* MENU */}
      {screen === 'menu' && (
        <div style={{ display: 'grid', gap: 20, padding: '8px 0 40px' }}>
          <section>
            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--muted, #888)' }}>Track</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" className="btn btn-primary btn-block" onClick={() => setScreen('pain')}>🩹 Log pain</button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('mcas')}>🔬 MCAS episode</button>
            </div>
          </section>

          <section>
            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--muted, #888)' }}>Doctors</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('visit')}>🏥 Doctor visit</button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('questions')}>❓ Questions for doctor</button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('diagnosis')}>📋 Diagnosis note</button>
            </div>
          </section>

          <section>
            <p style={{ margin: '0 0 10px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, color: 'var(--muted, #888)' }}>Medications</p>
            <div style={{ display: 'grid', gap: 10 }}>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('medication')}>💊 Update medication list</button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('reaction')}>⚠️ Log medication effects</button>
            </div>
          </section>
        </div>
      )}

      {/* DOCTOR VISIT */}
      {screen === 'visit' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
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

      {/* MEDICATION EFFECTS (reworked #7) */}
      {screen === 'reaction' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Log medication effects</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={mr.reaction_date} onChange={(e) => setMr({ ...mr, reaction_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={mr.reaction_time} onChange={(e) => setMr({ ...mr, reaction_time: e.target.value })} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Medication</label><input value={mr.medication} onChange={(e) => setMr({ ...mr, medication: e.target.value })} placeholder="Medication name" /></div>
            <div className="form-group"><label>Dose</label><input value={mr.dose} onChange={(e) => setMr({ ...mr, dose: e.target.value })} placeholder="50mg" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Prescribed by</label><input value={mr.prescribed_by} onChange={(e) => setMr({ ...mr, prescribed_by: e.target.value })} placeholder="Dr. Smith" /></div>
            <div className="form-group"><label>Prescribed date</label><input type="date" value={mr.prescribed_date} onChange={(e) => setMr({ ...mr, prescribed_date: e.target.value })} /></div>
          </div>
          <div className="form-group">
            <label>Reason for taking</label>
            <input value={mr.reason_taking} onChange={(e) => setMr({ ...mr, reason_taking: e.target.value })} placeholder="Pain, inflammation, anxiety…" />
          </div>
          <div className="form-group">
            <label>Positive effects noticed</label>
            <textarea value={mr.positive_effects} onChange={(e) => setMr({ ...mr, positive_effects: e.target.value })} placeholder="What has improved?" />
          </div>
          <div className="form-group">
            <label>Side effects noticed</label>
            <textarea value={mr.side_effects_noticed} onChange={(e) => setMr({ ...mr, side_effects_noticed: e.target.value })} placeholder="Any negative effects?" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Severity of side effects</label>
              <select value={mr.severity} onChange={(e) => setMr({ ...mr, severity: e.target.value })}>
                <option value="">—</option>
                <option>None</option>
                <option>Mild</option>
                <option>Moderate</option>
                <option>Severe</option>
              </select>
            </div>
            <div className="form-group">
              <label>Overall effect score 1–10</label>
              <select value={mr.effect_score} onChange={(e) => setMr({ ...mr, effect_score: e.target.value })}>
                <option value="">Default 5</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={mr.notes} onChange={(e) => setMr({ ...mr, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveMedReaction} disabled={busy}>Save</button>
        </div>
      )}

      {/* MCAS */}
      {screen === 'mcas' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
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

      {/* PAIN (multi-type fix) */}
      {screen === 'pain' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Pain log</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={pe.entry_date} onChange={(e) => setPe({ ...pe, entry_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={pe.entry_time} onChange={(e) => setPe({ ...pe, entry_time: e.target.value })} /></div>
          </div>

          <div className="form-group">
            <label>Area(s) — tap to select, or type below</label>
            <div className="pill-grid" style={{ marginBottom: 8 }}>
              {PAIN_AREA_PRESETS.map((p) => (
                <button key={p} type="button" className={`pill ${painPicks.includes(p) ? 'on' : ''}`} onClick={() => togglePainArea(p)}>{p}</button>
              ))}
            </div>
            <input
              placeholder='Or type freely: "left knee and lower back"'
              value={pe.location}
              onChange={(e) => { setPe({ ...pe, location: e.target.value }); if (e.target.value.trim()) setPainPicks([]) }}
            />
            {parsedPainAreas.length > 0 && (
              <div className="muted" style={{ marginTop: 6, fontSize: '0.85rem' }}>
                Chart will show: {parsedPainAreas.join(', ')}
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

      {/* QUESTIONS (add multiple, prioritize, reorder) */}
      {screen === 'questions' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
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
                <textarea
                  value={q.text}
                  onChange={(e) => updateQuestion(i, 'text', e.target.value)}
                  placeholder="Type your question here…"
                  style={{ marginBottom: 8 }}
                />
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

          <button
            type="button"
            className="btn btn-secondary btn-block"
            style={{ marginTop: 12 }}
            onClick={addQuestion}
          >
            + Add another question
          </button>

          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={saveQuestions} disabled={busy}>
            Save {questions.filter((q) => q.text.trim()).length} question(s)
          </button>
        </div>
      )}

      {/* MEDICATION */}
      {screen === 'medication' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Update medication list</h3>
          <div className="form-group">
            <label>Medication name</label>
            <input value={cm.medication} onChange={(e) => setCm({ ...cm, medication: e.target.value })} placeholder="Medication name" />
          </div>
          <div className="form-row">
            <div className="form-group"><label>Dose</label><input value={cm.dose} onChange={(e) => setCm({ ...cm, dose: e.target.value })} placeholder="50mg" /></div>
            <div className="form-group"><label>Frequency</label><input value={cm.frequency} onChange={(e) => setCm({ ...cm, frequency: e.target.value })} placeholder="Twice daily" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Start date</label><input type="date" value={cm.start_date} onChange={(e) => setCm({ ...cm, start_date: e.target.value })} /></div>
            <div className="form-group"><label>Prescribed by</label><input value={cm.prescribed_by} onChange={(e) => setCm({ ...cm, prescribed_by: e.target.value })} placeholder="Dr. Smith" /></div>
          </div>
          <div className="form-group">
            <label>Purpose / reason for taking</label>
            <input value={cm.purpose} onChange={(e) => setCm({ ...cm, purpose: e.target.value })} placeholder="Pain, inflammation…" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Effectiveness</label>
              <select value={cm.effectiveness} onChange={(e) => setCm({ ...cm, effectiveness: e.target.value })}>
                <option value="">—</option>
                <option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option><option>Unknown</option>
              </select>
            </div>
            <div className="form-group"><label>Side effects</label><input value={cm.side_effects} onChange={(e) => setCm({ ...cm, side_effects: e.target.value })} placeholder="Comma-separated" /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={cm.notes} onChange={(e) => setCm({ ...cm, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={upsertMed} disabled={busy}>Save</button>
        </div>
      )}

      {/* DIAGNOSIS */}
      {screen === 'diagnosis' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
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