import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { 
  PAIN_AREA_LIST, 
  painSelectionsToString, 
  type PainAreaSelection 
} from '../lib/parse'

// Fallback if the lib import fails or is empty
const SAFE_AREAS = (PAIN_AREA_LIST && PAIN_AREA_LIST.length > 0) 
  ? PAIN_AREA_LIST 
  : ['Head', 'Neck', 'Shoulder', 'Arm', 'Back', 'Hip', 'Knee', 'Foot']

const PAIN_TYPES = ['Burning', 'Stabbing', 'Aching', 'Throbbing', 'Sharp', 'Dull', 'Electric', 'Cramping', 'Pressure', 'Tingling']

export function QuickLogPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  // UI Control
  const [screen, setScreen] = useState<'visit' | 'pain' | 'mcas' | 'questions'>((searchParams.get('tab') as any) || 'visit')
  const [painStep, setPainStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  
  // Doctor State
  const [doctors, setDoctors] = useState<{id: string, name: string}[]>([])
  const [isAddingNewDoctor, setIsAddingNewDoctor] = useState(false)

  // Unified Form State (Prevents input focus loss)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    doctor: '',
    findings: '',
    intensity: '5',
    notes: '',
    trigger: '',
    symptoms: '',
    mcas_severity: 'Moderate',
    question: '',
    q_priority: 'Medium'
  })

  const [painSelections, setPainSelections] = useState<PainAreaSelection[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])

  useEffect(() => {
    if (!user) return
    supabase.from('doctors').select('id, name').eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors(data || []))
  }, [user])

  const showMsg = (type: 'success' | 'error', text: string) => {
    setBanner({ type, text }); setTimeout(() => setBanner(null), 4000)
  }

  const handleSave = async () => {
    if (!user) return
    setBusy(true)
    let error;

    try {
      if (screen === 'visit') {
        const { error: err } = await supabase.from('doctor_visits').insert({
          user_id: user.id, visit_date: form.date, doctor: form.doctor, findings: form.findings, notes: form.notes
        })
        error = err
      } else if (screen === 'pain') {
        const { error: err } = await supabase.from('pain_entries').insert({
          user_id: user.id, entry_date: form.date, intensity: Number(form.intensity),
          location: painSelectionsToString(painSelections), pain_type: painTypePicks.join(', '), notes: form.notes
        })
        error = err
      } else if (screen === 'mcas') {
        const { error: err } = await supabase.from('mcas_episodes').insert({
          user_id: user.id, episode_date: form.date, trigger: form.trigger, symptoms: form.symptoms, severity: form.mcas_severity
        })
        error = err
      } else if (screen === 'questions') {
        const { error: err } = await supabase.from('doctor_questions').insert({
          user_id: user.id, date_created: form.date, doctor: form.doctor, question: form.question, priority: form.q_priority, status: 'Unanswered'
        })
        error = err
      }

      if (error) throw error
      navigate('/app')
    } catch (e: any) {
      showMsg('error', e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null

  return (
    <div className="page-container" style={{ padding: '16px', maxWidth: '500px', margin: '0 auto', paddingBottom: '100px' }}>
      {banner && <div className={`banner ${banner.type}`} style={{ position: 'fixed', top: 10, left: 10, right: 10, zIndex: 1000 }}>{banner.text}</div>}

      <button className="btn btn-ghost" onClick={() => navigate('/app')} style={{ marginBottom: 15 }}>← Back</button>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto' }}>
        {['visit', 'pain', 'mcas', 'questions'].map(t => (
          <button key={t} onClick={() => { setScreen(t as any); setPainStep(1); }}
            className={`btn ${screen === t ? 'btn-primary' : 'btn-secondary'}`} style={{ flexShrink: 0 }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* VISIT SCREEN */}
      {screen === 'visit' && (
        <div className="card fade-in">
          <h3>🏥 Doctor Visit</h3>
          <div className="form-group">
            <label>Doctor</label>
            {!isAddingNewDoctor ? (
              <select value={form.doctor} onChange={(e) => e.target.value === 'NEW' ? setIsAddingNewDoctor(true) : setForm({...form, doctor: e.target.value})}>
                <option value="">— Select —</option>
                {doctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                <option value="NEW">+ New Doctor...</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 5 }}>
                <input autoFocus placeholder="Name..." value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})} />
                <button className="btn btn-ghost" onClick={() => { setIsAddingNewDoctor(false); setForm({...form, doctor: ''}); }}>✕</button>
              </div>
            )}
          </div>
          <textarea placeholder="Findings..." value={form.findings} onChange={e => setForm({...form, findings: e.target.value})} rows={4} style={{ marginTop: '10px' }} />
          <button className="btn btn-primary btn-block" style={{ marginTop: 15 }} onClick={handleSave} disabled={busy || !form.doctor}>Save Visit</button>
        </div>
      )}

      {/* PAIN SCREEN */}
      {screen === 'pain' && (
        <div className="card fade-in">
          {painStep === 1 && (
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ fontSize: '4rem', color: 'var(--primary)', margin: '15px 0' }}>{form.intensity}</h1>
              <input type="range" min="0" max="10" value={form.intensity} onChange={e => setForm({...form, intensity: e.target.value})} style={{ width: '100%', height: '40px' }} />
              <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={() => setPainStep(2)}>Next: Location</button>
            </div>
          )}
          {painStep === 2 && (
            <div>
              <h3>Where is it?</h3>
              <div className="pill-grid">
                {SAFE_AREAS.map(a => {
                  const sel = painSelections.find(s => s.area === a)
                  return (
                    <button key={a} className={`pill ${sel ? 'on' : ''}`} onClick={() => {
                      setPainSelections(prev => {
                        const exists = prev.find(s => s.area === a)
                        if (!exists) return [...prev, { area: a, side: 'left' }]
                        if (exists.side === 'left') return prev.map(s => s.area === a ? {...s, side: 'right'} : s)
                        if (exists.side === 'right') return prev.map(s => s.area === a ? {...s, side: 'both'} : s)
                        return prev.filter(s => s.area !== a)
                      })
                    }}>
                      {a} {sel?.side === 'left' ? '(L)' : sel?.side === 'right' ? '(R)' : sel?.side === 'both' ? '(L+R)' : ''}
                    </button>
                  )
                })}
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={() => setPainStep(3)}>Next: Details</button>
            </div>
          )}
          {painStep === 3 && (
            <div>
              <div className="pill-grid" style={{ marginBottom: 15 }}>
                {PAIN_TYPES.map(t => (
                  <button key={t} className={`pill ${painTypePicks.includes(t) ? 'on' : ''}`} onClick={() => setPainTypePicks(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}>{t}</button>
                ))}
              </div>
              <textarea placeholder="Notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} />
              <button className="btn btn-primary btn-block" style={{ marginTop: 15 }} onClick={handleSave} disabled={busy}>Save Pain Log</button>
            </div>
          )}
        </div>
      )}

      {/* MCAS SCREEN */}
      {screen === 'mcas' && (
        <div className="card fade-in">
          <h3>🔬 MCAS Log</h3>
          <div className="form-group"><label>Trigger</label><input value={form.trigger} onChange={e => setForm({...form, trigger: e.target.value})} placeholder="Food, heat, stress..." /></div>
          <div className="form-group"><label>Symptoms</label><textarea value={form.symptoms} onChange={e => setForm({...form, symptoms: e.target.value})} rows={3} /></div>
          <div className="form-group">
            <label>Severity</label>
            <select value={form.mcas_severity} onChange={e => setForm({...form, mcas_severity: e.target.value})}>
              <option>Mild</option><option>Moderate</option><option>Severe</option>
            </select>
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 15 }} onClick={handleSave} disabled={busy || !form.trigger}>Save Episode</button>
        </div>
      )}

      {/* QUESTIONS SCREEN */}
      {screen === 'questions' && (
        <div className="card fade-in">
          <h3>❓ Ask a Doctor</h3>
          <div className="form-group">
            <label>For Doctor</label>
            <select value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})}>
              <option value="">General / Any</option>
              {doctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <textarea placeholder="Your question..." value={form.question} onChange={e => setForm({...form, question: e.target.value})} rows={5} />
          <button className="btn btn-primary btn-block" style={{ marginTop: 15 }} onClick={handleSave} disabled={busy || !form.question}>Save Question</button>
        </div>
      )}
    </div>
  )
}