import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parsePainAreas, splitQuestionsIntoRows } from '../lib/parse'

type Screen = 'menu' | 'doctor' | 'medReaction' | 'mcas' | 'pain' | 'question' | 'medication' | 'diagnosis'

const PAIN_PRESETS = ['Knees', 'Back', 'Neck', 'Head', 'Hands', 'Feet', 'Shoulders', 'Hips']

function todayISO () {
  return new Date().toISOString().slice(0, 10)
}

function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

export function QuickLogPage () {
  const { user } = useAuth()
  const [screen, setScreen] = useState<Screen>('menu')
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const defaults = useMemo(() => ({ date: todayISO(), time: nowTime() }), [screen])

  const [painPicks, setPainPicks] = useState<string[]>([])

  function showBanner (type: 'success' | 'error' | 'info', text: string) {
    setBanner({ type, text })
    setTimeout(() => setBanner((b) => (b?.text === text ? null : b)), 6500)
  }

  // ===== Doctor visit =====
  const [dv, setDv] = useState({
    visit_date: defaults.date,
    visit_time: defaults.time,
    doctor: '',
    specialty: '',
    reason: '',
    findings: '',
    tests_ordered: '',
    new_meds: '',
    med_changes: '',
    instructions: '',
    follow_up: '',
    notes: '',
  })

  async function saveDoctor () {
    if (!dv.doctor.trim()) {
      showBanner('error', 'Doctor name is required.')
      return
    }
    setBusy(true)
    const payload = {
      user_id: user!.id,
      visit_date: dv.visit_date,
      visit_time: dv.visit_time || null,
      doctor: dv.doctor,
      specialty: dv.specialty || null,
      reason: dv.reason || null,
      findings: dv.findings || null,
      tests_ordered: dv.tests_ordered || null,
      new_meds: dv.new_meds || null,
      med_changes: dv.med_changes || null,
      instructions: dv.instructions || null,
      follow_up: dv.follow_up || null,
      notes: dv.notes || null,
    }
    const { error } = await supabase.from('doctor_visits').insert(payload)
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', 'Doctor visit saved.')
      setScreen('menu')
    }
  }

  // ===== Medication reaction =====
  const [mr, setMr] = useState({
    reaction_date: defaults.date,
    reaction_time: defaults.time,
    medication: '',
    dose: '',
    reaction: '',
    severity: '',
    duration: '',
    helped_harmed: '',
    effect_score: '' as string,
    notes: '',
  })

  async function saveMedReaction () {
    if (!mr.medication.trim() || !mr.reaction.trim()) {
      showBanner('error', 'Medication and reaction are required.')
      return
    }
    setBusy(true)
    const effect = mr.effect_score === '' ? 5 : Number(mr.effect_score)
    const { error } = await supabase.from('med_reactions').insert({
      user_id: user!.id,
      reaction_date: mr.reaction_date,
      reaction_time: mr.reaction_time || null,
      medication: mr.medication,
      dose: mr.dose || null,
      reaction: mr.reaction,
      severity: mr.severity || null,
      duration: mr.duration || null,
      helped_harmed: mr.helped_harmed || null,
      effect_score: effect,
      notes: mr.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', 'Medication reaction saved.')
      setScreen('menu')
    }
  }

  // ===== MCAS =====
  const [mx, setMx] = useState({
    episode_date: defaults.date,
    episode_time: defaults.time,
    trigger: '',
    symptoms: '',
    onset: '',
    severity: '',
    relief: '',
    medications_taken: '',
    notes: '',
  })

  async function saveMcas () {
    if (!mx.trigger.trim() || !mx.symptoms.trim()) {
      showBanner('error', 'Trigger and symptoms are required.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('mcas_episodes').insert({
      user_id: user!.id,
      episode_date: mx.episode_date,
      episode_time: mx.episode_time || null,
      trigger: mx.trigger,
      symptoms: mx.symptoms,
      onset: mx.onset || null,
      severity: mx.severity || null,
      relief: mx.relief || null,
      medications_taken: mx.medications_taken || null,
      notes: mx.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', 'MCAS episode saved.')
      setScreen('menu')
    }
  }

  // ===== Pain =====
  const [pe, setPe] = useState({
    entry_date: defaults.date,
    entry_time: defaults.time,
    location: '',
    intensity: '' as string,
    pain_type: '',
    triggers: '',
    relief_methods: '',
    medications_taken: '',
    notes: '',
  })

  function togglePainPreset (name: string) {
    setPainPicks((prev) => (prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]))
  }

  const parsedPainAreas = useMemo(() => parsePainAreas(pe.location), [pe.location])

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
      entry_date: pe.entry_date,
      entry_time: pe.entry_time || null,
      location: loc,
      intensity: inten,
      pain_type: pe.pain_type || null,
      triggers: pe.triggers || null,
      relief_methods: pe.relief_methods || null,
      medications_taken: pe.medications_taken || null,
      notes: pe.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', 'Pain entry saved.')
      setPainPicks([])
      setScreen('menu')
    }
  }

  // ===== Questions =====
  const [dq, setDq] = useState({
    appointment_date: '',
    doctor: '',
    question: '',
    priority: 'Medium',
    category: '',
  })

  async function saveQuestion () {
    const rows = splitQuestionsIntoRows(dq.question)
    if (rows.length === 0) {
      showBanner('error', 'Please enter at least one question.')
      return
    }
    setBusy(true)
    // Insert each question as its own row so you can track/update later.
    const inserts = rows.map((q) => ({
      user_id: user!.id,
      date_created: todayISO(),
      appointment_date: dq.appointment_date || null,
      doctor: dq.doctor || null,
      question: q,
      priority: dq.priority,
      category: dq.category || null,
      answer: null,
      status: 'Unanswered',
    }))

    const { error } = await supabase.from('doctor_questions').insert(inserts)
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', `Saved ${rows.length} question(s).`)
      setScreen('menu')
    }
  }

  // ===== Current medication =====
  const [cm, setCm] = useState({
    medication: '',
    dose: '',
    frequency: '',
    start_date: todayISO(),
    purpose: '',
    effectiveness: '',
    side_effects: '',
    notes: '',
  })

  async function upsertMed () {
    if (!cm.medication.trim()) {
      showBanner('error', 'Medication name is required.')
      return
    }
    setBusy(true)
    const medName = cm.medication.trim()
    const { error } = await supabase.from('current_medications').upsert(
      {
        user_id: user!.id,
        medication: medName,
        dose: cm.dose || null,
        frequency: cm.frequency || null,
        start_date: cm.start_date || null,
        purpose: cm.purpose || null,
        effectiveness: cm.effectiveness || null,
        side_effects: cm.side_effects || null,
        notes: cm.notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,medication' },
    )
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', 'Medication list updated.')
      setScreen('menu')
    }
  }

  // ===== Diagnosis =====
  const [dn, setDn] = useState({
    note_date: defaults.date,
    diagnoses_mentioned: '',
    diagnoses_ruled_out: '',
    doctor: '',
    notes: '',
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
    else {
      showBanner('success', 'Diagnosis note saved.')
      setScreen('menu')
    }
  }

  if (!user) return null

  return (
    <div>
      {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

      {screen === 'menu' && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Quick log</h2>
          <p className="muted">Fast entry, saved to your private account.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <button type="button" className="btn btn-primary btn-block" onClick={() => setScreen('doctor')}>🩺 Doctor visit</button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('medReaction')}>💊 Medication reaction</button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('mcas')}>🔬 MCAS episode</button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('pain')}>🩹 Pain</button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('question')}>❓ Question for doctor</button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('medication')}>💊 Update medication list</button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => setScreen('diagnosis')}>📋 Diagnosis note</button>
          </div>
        </div>
      )}

      {screen === 'doctor' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Doctor visit</h3>

          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={dv.visit_date} onChange={(e) => setDv({ ...dv, visit_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={dv.visit_time} onChange={(e) => setDv({ ...dv, visit_time: e.target.value })} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Doctor</label>
              <input value={dv.doctor} onChange={(e) => setDv({ ...dv, doctor: e.target.value })} placeholder="Dr…" />
            </div>
            <div className="form-group">
              <label>Specialty</label>
              <input value={dv.specialty} onChange={(e) => setDv({ ...dv, specialty: e.target.value })} placeholder="Cardiology" />
            </div>
          </div>

          {(['reason', 'findings', 'tests_ordered', 'new_meds', 'med_changes', 'instructions', 'follow_up', 'notes'] as const).map((k) => (
            <div className="form-group" key={k}>
              <label>{k.replace(/_/g, ' ')}</label>
              <textarea value={(dv as any)[k]} onChange={(e) => setDv({ ...dv, [k]: e.target.value })} />
            </div>
          ))}

          <button type="button" className="btn btn-primary btn-block" onClick={saveDoctor} disabled={busy}>Save</button>
        </div>
      )}

      {screen === 'medReaction' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Medication reaction</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={mr.reaction_date} onChange={(e) => setMr({ ...mr, reaction_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={mr.reaction_time} onChange={(e) => setMr({ ...mr, reaction_time: e.target.value })} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Medication</label>
              <input value={mr.medication} onChange={(e) => setMr({ ...mr, medication: e.target.value })} placeholder="Medication name" />
            </div>
            <div className="form-group">
              <label>Dose</label>
              <input value={mr.dose} onChange={(e) => setMr({ ...mr, dose: e.target.value })} placeholder="50mg" />
            </div>
          </div>
          <div className="form-group">
            <label>Reaction / symptoms</label>
            <textarea value={mr.reaction} onChange={(e) => setMr({ ...mr, reaction: e.target.value })} placeholder="What happened?" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Severity</label>
              <select value={mr.severity} onChange={(e) => setMr({ ...mr, severity: e.target.value })}>
                <option value="">—</option>
                <option>Mild</option>
                <option>Moderate</option>
                <option>Severe</option>
              </select>
            </div>
            <div className="form-group">
              <label>Duration</label>
              <input value={mr.duration} onChange={(e) => setMr({ ...mr, duration: e.target.value })} placeholder="2 hours" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Helped / harmed</label>
              <select value={mr.helped_harmed} onChange={(e) => setMr({ ...mr, helped_harmed: e.target.value })}>
                <option value="">—</option>
                <option>Helped</option>
                <option>Harmed</option>
                <option>Mixed</option>
                <option>Neutral</option>
              </select>
            </div>
            <div className="form-group">
              <label>Effect score 1–10</label>
              <select value={mr.effect_score} onChange={(e) => setMr({ ...mr, effect_score: e.target.value })}>
                <option value="">Default 5</option>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={mr.notes} onChange={(e) => setMr({ ...mr, notes: e.target.value })} />
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveMedReaction} disabled={busy}>Save</button>
        </div>
      )}

      {screen === 'mcas' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>MCAS episode</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={mx.episode_date} onChange={(e) => setMx({ ...mx, episode_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={mx.episode_time} onChange={(e) => setMx({ ...mx, episode_time: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Trigger</label>
            <input value={mx.trigger} onChange={(e) => setMx({ ...mx, trigger: e.target.value })} placeholder="Food, meds, stress…" />
          </div>
          <div className="form-group">
            <label>Symptoms</label>
            <textarea value={mx.symptoms} onChange={(e) => setMx({ ...mx, symptoms: e.target.value })} placeholder="Describe symptoms…" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Onset</label>
              <input value={mx.onset} onChange={(e) => setMx({ ...mx, onset: e.target.value })} placeholder="How quickly?" />
            </div>
            <div className="form-group">
              <label>Severity</label>
              <select value={mx.severity} onChange={(e) => setMx({ ...mx, severity: e.target.value })}>
                <option value="">—</option>
                <option>Mild</option>
                <option>Moderate</option>
                <option>Severe</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Relief</label>
            <textarea value={mx.relief} onChange={(e) => setMx({ ...mx, relief: e.target.value })} placeholder="What helped?" />
          </div>
          <div className="form-group">
            <label>Medications taken</label>
            <input value={mx.medications_taken} onChange={(e) => setMx({ ...mx, medications_taken: e.target.value })} placeholder="If any…" />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={mx.notes} onChange={(e) => setMx({ ...mx, notes: e.target.value })} />
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveMcas} disabled={busy}>Save</button>
        </div>
      )}

      {screen === 'pain' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Pain</h3>

          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={pe.entry_date} onChange={(e) => setPe({ ...pe, entry_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={pe.entry_time} onChange={(e) => setPe({ ...pe, entry_time: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label>Location(s)</label>
            <div className="pill-grid" style={{ marginBottom: 8 }}>
              {PAIN_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`pill ${painPicks.includes(p) ? 'on' : ''}`}
                  onClick={() => togglePainPreset(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <input
              placeholder="Or type a short sentence, like “my knees and lower back…”"
              value={pe.location}
              onChange={(e) => {
                setPe({ ...pe, location: e.target.value })
                if (e.target.value.trim()) setPainPicks([])
              }}
            />

            <div className="muted" style={{ marginTop: 8 }}>
              Parsed for charts: {parsedPainAreas.join(', ')}
            </div>
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

          <div className="form-row">
            <div className="form-group">
              <label>Type</label>
              <select value={pe.pain_type} onChange={(e) => setPe({ ...pe, pain_type: e.target.value })}>
                <option value="">—</option>
                <option>Burning</option>
                <option>Stabbing</option>
                <option>Aching</option>
                <option>Throbbing</option>
                <option>Sharp</option>
                <option>Dull</option>
                <option>Electric shocks</option>
              </select>
            </div>
            <div className="form-group">
              <label>Triggers</label>
              <input value={pe.triggers} onChange={(e) => setPe({ ...pe, triggers: e.target.value })} placeholder="Weather, activity, stress…" />
            </div>
          </div>

          <div className="form-group">
            <label>Relief methods</label>
            <textarea value={pe.relief_methods} onChange={(e) => setPe({ ...pe, relief_methods: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Medications taken</label>
            <input value={pe.medications_taken} onChange={(e) => setPe({ ...pe, medications_taken: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={pe.notes} onChange={(e) => setPe({ ...pe, notes: e.target.value })} />
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={savePain} disabled={busy}>Save</button>
        </div>
      )}

      {screen === 'question' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Question for doctor</h3>

          <div className="form-row">
            <div className="form-group">
              <label>Appointment date</label>
              <input type="date" value={dq.appointment_date} onChange={(e) => setDq({ ...dq, appointment_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Doctor</label>
              <input value={dq.doctor} onChange={(e) => setDq({ ...dq, doctor: e.target.value })} placeholder="Dr. Smith" />
            </div>
          </div>

          <div className="form-group">
            <label>Questions (paste multiple lines if you want)</label>
            <textarea
              value={dq.question}
              onChange={(e) => setDq({ ...dq, question: e.target.value })}
              placeholder="Example:
1) Should I get ultrasound of my…?
2) What can I do for brain fog…?"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Priority</label>
              <select value={dq.priority} onChange={(e) => setDq({ ...dq, priority: e.target.value })}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div className="form-group">
              <label>Category</label>
              <select value={dq.category} onChange={(e) => setDq({ ...dq, category: e.target.value })}>
                <option value="">—</option>
                <option>Medication</option>
                <option>Symptoms</option>
                <option>Test Results</option>
                <option>Treatment</option>
                <option>Diagnosis</option>
                <option>Referral</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={saveQuestion} disabled={busy}>Save</button>
        </div>
      )}

      {screen === 'medication' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Update medication list</h3>
          <div className="form-group">
            <label>Medication name</label>
            <input value={cm.medication} onChange={(e) => setCm({ ...cm, medication: e.target.value })} placeholder="Medication name" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Dose</label>
              <input value={cm.dose} onChange={(e) => setCm({ ...cm, dose: e.target.value })} placeholder="50mg" />
            </div>
            <div className="form-group">
              <label>Frequency</label>
              <input value={cm.frequency} onChange={(e) => setCm({ ...cm, frequency: e.target.value })} placeholder="Twice daily" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start date</label>
              <input type="date" value={cm.start_date} onChange={(e) => setCm({ ...cm, start_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Purpose</label>
              <input value={cm.purpose} onChange={(e) => setCm({ ...cm, purpose: e.target.value })} placeholder="Pain, inflammation…" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Effectiveness</label>
              <select value={cm.effectiveness} onChange={(e) => setCm({ ...cm, effectiveness: e.target.value })}>
                <option value="">—</option>
                <option>Excellent</option>
                <option>Good</option>
                <option>Fair</option>
                <option>Poor</option>
                <option>Unknown</option>
              </select>
            </div>
            <div className="form-group">
              <label>Side effects</label>
              <input value={cm.side_effects} onChange={(e) => setCm({ ...cm, side_effects: e.target.value })} placeholder="Comma-separated if possible" />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={cm.notes} onChange={(e) => setCm({ ...cm, notes: e.target.value })} />
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={upsertMed} disabled={busy}>Save</button>
        </div>
      )}

      {screen === 'diagnosis' && (
        <div className="card">
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>← Back</button>
          <h3>Diagnosis note</h3>
          <div className="form-group">
            <label>Date</label>
            <input type="date" value={dn.note_date} onChange={(e) => setDn({ ...dn, note_date: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Diagnoses mentioned</label>
            <textarea value={dn.diagnoses_mentioned} onChange={(e) => setDn({ ...dn, diagnoses_mentioned: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Diagnoses ruled out</label>
            <textarea value={dn.diagnoses_ruled_out} onChange={(e) => setDn({ ...dn, diagnoses_ruled_out: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Doctor</label>
            <input value={dn.doctor} onChange={(e) => setDn({ ...dn, doctor: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={dn.notes} onChange={(e) => setDn({ ...dn, notes: e.target.value })} />
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveDiagnosis} disabled={busy}>Save</button>
        </div>
      )}
    </div>
  )
}

