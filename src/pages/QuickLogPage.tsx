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
  
  // UI State
  const [screen, setScreen] = useState<Screen>(initialTab)
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showNewDoctorPrompt, setShowNewDoctorPrompt] = useState(false)
  const [pendingDoctorName, setPendingDoctorName] = useState('')
  const [doctors, setDoctors] = useState<Doctor[]>([])
  
  // New States for Fixes
  const [isAddingNewDoctor, setIsAddingNewDoctor] = useState(false)
  const [painStep, setPainStep] = useState(1)

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

  // ===== Doctor visit State =====
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
    setDvMeds(meds.map((m) => ({ medication: m.medication, dose: m.dose ?? '', action: 'keep' })))
  }

  function handleDoctorSelect (doctorName: string) {
    if (doctorName === '__new__') {
      setIsAddingNewDoctor(true)
      setDv(prev => ({ ...prev, doctor: '', specialty: '' }))
      setDvMeds([])
      return
    }
    setIsAddingNewDoctor(false)
    const doc = doctors.find((d) => d.name === doctorName)
    setDv((prev) => ({ ...prev, doctor: doctorName, specialty: doc?.specialty ?? prev.specialty }))
    if (doctorName) loadDoctorMeds(doctorName)
    else { setDvMeds([]) }
  }

  async function saveDoctor () {
    if (!dv.doctor.trim()) { showBanner('error', 'Doctor name is required.'); return }
    setBusy(true)
    
    // 1. Save Visit
    const { error: visitError } = await supabase.from('doctor_visits').insert({
      user_id: user!.id, visit_date: dv.visit_date, visit_time: dv.visit_time || null,
      doctor: dv.doctor, specialty: dv.specialty || null, reason: dv.reason || null,
      findings: dv.findings || null,
      tests_ordered: dvTests.filter((t) => t.test_name.trim()).map((t) => t.test_name).join(', ') || null,
      instructions: dv.instructions || null, follow_up: dv.next_appt_date || null, notes: dv.notes || null,
    })
    if (visitError) { setBusy(false); showBanner('error', visitError.message); return }

    // 2. Save Tests
    const validTests = dvTests.filter((t) => t.test_name.trim())
    if (validTests.length > 0) {
      await supabase.from('tests_ordered').insert(
        validTests.map((t) => ({
          user_id: user!.id, test_date: dv.visit_date, doctor: dv.doctor,
          test_name: t.test_name.trim(), reason: t.reason || null, status: 'Pending',
        }))
      )
    }

    // 3. Save Appointment
    if (dv.next_appt_date) {
      await supabase.from('appointments').insert({
        user_id: user!.id, doctor: dv.doctor, specialty: dv.specialty || null,
        appointment_date: dv.next_appt_date, appointment_time: dv.next_appt_time || null,
      })
    }

    // 4. Update/Remove Meds
    for (const m of dvMeds) {
      if (m.action === 'remove') {
        await supabase.from('current_medications')
          .delete().eq('user_id', user!.id).eq('medication', m.medication)
      }
    }

    // 5. Add New Med
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

  // ===== MCAS State & Logic =====
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
      notes: mx.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', 'MCAS episode saved.'); navigate('/app') }
  }

  // ===== Pain State & Logic =====
  const [painSelections, setPainSelections] = useState<PainAreaSelection[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])
  const [pe, setPe] = useState({
    entry_date: defaults.date, entry_time: defaults.time,
    intensity: '5', triggers: '', relief_and_meds: '', notes: '',
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
      notes: pe.notes || null,
    })
    setBusy(false)
    if (error) showBanner('error', error.message)
    else {
      showBanner('success', 'Pain entry saved.')
      navigate('/app')
    }
  }

  // ===== Questions State & Logic =====
  const [qDoctor, setQDoctor] = useState('')
  const [qApptDate, setQApptDate] = useState('')
  const [questions, setQuestions] = useState([{ text: '', priority: 'Medium' as 'High' | 'Medium' | 'Low' }])

  function updateQuestion (i: number, field: 'text' | 'priority', value: string) {
    setQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
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
        status: 'Unanswered',
      }))
    )
    setBusy(false)
    if (error) showBanner('error', error.message)
    else { showBanner('success', `Saved ${valid.length} question(s).`); navigate('/app') }
  }

  // ===== Diagnosis State & Logic =====
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

  // Confirmation screen for adding new doctor to the master list
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
    <div style={{ paddingBottom: 60 }}>
      {banner && <div className={`banner ${banner.type}`}>{banner.text}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0 16px' }}>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '2px solid var(--border)', paddingBottom: 10, overflowX: 'auto' }}>
        {([
          ['visit', '🏥 Visit'],
          ['questions', '❓ Questions'],
          ['diagnosis', '📋 Diagnosis'],
          ['pain', '🩹 Pain'],
          ['mcas', '🔬 MCAS'],
        ] as [Screen, string][]).map(([id, label]) => (
          <button key={id} type="button"
            className={`btn ${screen === id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}
            onClick={() => { setScreen(id); setPainStep(1); }}>
            {label}
          </button>
        ))}
      </div>

      {/* 🏥 DOCTOR VISIT */}
      {screen === 'visit' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Doctor visit</h3>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" value={dv.visit_date} onChange={(e) => setDv({ ...dv, visit_date: e.target.value })} /></div>
            <div className="form-group"><label>Time</label><input type="time" value={dv.visit_time} onChange={(e) => setDv({ ...dv, visit_time: e.target.value })} /></div>
          </div>
          
          <div className="form-group">
            <label>Doctor</label>
            {!isAddingNewDoctor ? (
              <select value={dv.doctor} onChange={(e) => handleDoctorSelect(e.target.value)}>
                <option value="">— Select doctor —</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                <option value="__new__">+ New doctor…</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input 
                  autoFocus 
                  placeholder="Type doctor name..." 
                  value={dv.doctor} 
                  onChange={(e) => setDv({ ...dv, doctor: e.target.value })} 
                />
                <button type="button" className="btn btn-ghost" onClick={() => setIsAddingNewDoctor(false)}>✕</button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Specialty</label>
            <input value={dv.specialty} onChange={(e) => setDv({ ...dv, specialty: e.target.value })} placeholder="e.g. Cardiology" />
          </div>

          <div className="form-group"><label>Reason</label><textarea value={dv.reason} onChange={(e) => setDv({ ...dv, reason: e.target.value })} /></div>
          <div className="form-group"><label>Findings</label><textarea value={dv.findings} onChange={(e) => setDv({ ...dv, findings: e.target.value })} /></div>

          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Update Medications</label>
            {dvMeds.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.9rem', color: m.action === 'remove' ? '#ccc' : 'inherit' }}>
                  {m.medication} {m.dose}
                </span>
                <button type="button" className="btn btn-ghost" style={{ color: 'red', fontSize: '0.75rem' }}
                  onClick={() => setDvMeds(prev => prev.map((x, idx) => idx === i ? { ...x, action: x.action === 'remove' ? 'keep' : 'remove' } : x))}>
                  {m.action === 'remove' ? 'Undo' : 'Remove'}
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input style={{ flex: 2 }} value={newMedEntry.medication} placeholder="New med name"
                onChange={(e) => setNewMedEntry({ ...newMedEntry, medication: e.target.value })} />
              <input style={{ flex: 1 }} value={newMedEntry.dose} placeholder="Dose"
                onChange={(e) => setNewMedEntry({ ...newMedEntry, dose: e.target.value })} />
            </div>
          </div>

          <div className="form-group"><label>Notes</label><textarea value={dv.notes} onChange={(e) => setDv({ ...dv, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveDoctor} disabled={busy}>Save Visit</button>
        </div>
      )}

      {/* 🩹 PROGRESSIVE PAIN LOG */}
      {screen === 'pain' && (
        <div className="card">
          {painStep === 1 && (
            <div>
              <h3 style={{ textAlign: 'center' }}>How bad is the pain?</h3>
              <div style={{ padding: '40px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', fontWeight: 'bold', color: 'var(--primary)', marginBottom: 20 }}>{pe.intensity}</div>
                <input type="range" min="0" max="10" value={pe.intensity} 
                  onChange={(e) => setPe({ ...pe, intensity: e.target.value })}
                  style={{ width: '100%', height: '30px' }} 
                />
              </div>
              <button className="btn btn-primary btn-block" onClick={() => setPainStep(2)}>Next</button>
            </div>
          )}

          {painStep === 2 && (
            <div>
              <h3>Where is it?</h3>
              <div className="pill-grid" style={{ marginBottom: 20 }}>
                {PAIN_AREA_LIST.map((area) => (
                  <button key={area} type="button" className={`pill ${painSelections.some(s => s.area === area) ? 'on' : ''}`}
                    onClick={() => togglePainArea(area)}>
                    {area} {getSideLabel(area)}
                  </button>
                ))}
              </div>
              <div className="pill-grid" style={{ borderTop: '1px solid var(--border)', paddingTop: 15 }}>
                {MIDLINE_AREA_LIST.map((area) => (
                  <button key={area} type="button" className={`pill ${painSelections.some(s => s.area === area) ? 'on' : ''}`}
                    onClick={() => togglePainArea(area)}>{area}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button className="btn btn-secondary flex-1" onClick={() => setPainStep(1)}>Back</button>
                <button className="btn btn-primary flex-1" onClick={() => setPainStep(3)}>Next</button>
              </div>
            </div>
          )}

          {painStep === 3 && (
            <div>
              <h3>Type & Notes</h3>
              <div className="pill-grid" style={{ marginBottom: 15 }}>
                {PAIN_TYPE_OPTIONS.map((t) => (
                  <button key={t} type="button" className={`pill ${painTypePicks.includes(t) ? 'on' : ''}`}
                    onClick={() => setPainTypePicks(prev => prev.includes(t) ? prev.filter(p => p !== t) : [...prev, t])}>
                    {t}
                  </button>
                ))}
              </div>
              <textarea placeholder="Notes (Triggers, relief, etc.)" value={pe.notes} onChange={(e) => setPe({ ...pe, notes: e.target.value })} />
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button className="btn btn-secondary flex-1" onClick={() => setPainStep(2)}>Back</button>
                <button className="btn btn-primary flex-1" onClick={savePain} disabled={busy}>Save Log</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🔬 MCAS */}
      {screen === 'mcas' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>MCAS Episode</h3>
          <div className="form-group"><label>Trigger</label><input value={mx.trigger} onChange={(e) => setMx({ ...mx, trigger: e.target.value })} placeholder="Food, heat, stress..." /></div>
          <div className="form-group"><label>Symptoms</label><textarea value={mx.symptoms} onChange={(e) => setMx({ ...mx, symptoms: e.target.value })} /></div>
          <div className="form-group">
            <label>Severity</label>
            <select value={mx.severity} onChange={(e) => setMx({ ...mx, severity: e.target.value })}>
              <option value="">—</option>
              <option>Mild</option><option>Moderate</option><option>Severe</option>
            </select>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveMcas} disabled={busy}>Save MCAS Log</button>
        </div>
      )}

      {/* ❓ QUESTIONS */}
      {screen === 'questions' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Questions</h3>
          <select value={qDoctor} onChange={(e) => setQDoctor(e.target.value)}>
            <option value="">— Select doctor —</option>
            {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </select>
          <div style={{ marginTop: 15 }}>
            {questions.map((q, i) => (
              <div key={i} style={{ marginBottom: 15, padding: 10, background: '#f9f9f9', borderRadius: 8 }}>
                <textarea value={q.text} onChange={(e) => updateQuestion(i, 'text', e.target.value)} placeholder="Type question..." />
                <select value={q.priority} onChange={(e) => updateQuestion(i, 'priority', e.target.value as any)}>
                  <option value="High">🔴 High</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveQuestions} disabled={busy}>Save Questions</button>
        </div>
      )}

      {/* 📋 DIAGNOSIS */}
      {screen === 'diagnosis' && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Diagnosis Note</h3>
          <div className="form-group"><label>Doctor</label>
            <select value={dn.doctor} onChange={(e) => setDn({ ...dn, doctor: e.target.value })}>
              <option value="">— Select doctor —</option>
              {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Diagnoses Mentioned</label><textarea value={dn.diagnoses_mentioned} onChange={(e) => setDn({ ...dn, diagnoses_mentioned: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveDiagnosis} disabled={busy}>Save Note</button>
        </div>
      )}
    </div>
  )
}