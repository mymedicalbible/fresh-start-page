import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { 
  PAIN_AREA_LIST, 
  painSelectionsToString, 
  type PainAreaSelection 
} from '../lib/parse'

const PAIN_TYPES = ['Burning', 'Stabbing', 'Aching', 'Throbbing', 'Sharp', 'Dull', 'Electric', 'Cramping', 'Pressure', 'Tingling']

export function QuickLogPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  
  const [screen, setScreen] = useState<'visit' | 'pain' | 'mcas' | 'questions'>((searchParams.get('tab') as any) || 'visit')
  const [painStep, setPainStep] = useState(1)
  const [busy, setBusy] = useState(false)
  
  const [doctors, setDoctors] = useState<{id: string, name: string}[]>([])
  const [isAddingNewDoctor, setIsAddingNewDoctor] = useState(false)

  // Visit Medications State
  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string }[]>([])
  const [newMed, setNewMed] = useState({ medication: '', dose: '' })

  // Unified Form State
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
    priority: 'Medium'
  })

  const [painSelections, setPainSelections] = useState<PainAreaSelection[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])

  useEffect(() => {
    if (!user) return
    supabase.from('doctors').select('id, name').eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors(data || []))
  }, [user])

  const handleSave = async () => {
    if (!user) return
    setBusy(true)
    try {
      if (screen === 'visit') {
        const medsString = dvMeds.map(m => `${m.medication} (${m.dose})`).join(', ')
        await supabase.from('doctor_visits').insert({
          user_id: user.id, visit_date: form.date, doctor: form.doctor, 
          findings: form.findings, new_meds: medsString
        })
      } else if (screen === 'pain') {
        await supabase.from('pain_entries').insert({
          user_id: user.id, entry_date: form.date, intensity: Number(form.intensity),
          location: painSelectionsToString(painSelections), pain_type: painTypePicks.join(', '), notes: form.notes
        })
      } else if (screen === 'mcas') {
        await supabase.from('mcas_episodes').insert({
          user_id: user.id, episode_date: form.date, trigger: form.trigger, symptoms: form.symptoms, severity: form.mcas_severity
        })
      } else if (screen === 'questions') {
        await supabase.from('doctor_questions').insert({
          user_id: user.id, date_created: form.date, doctor: form.doctor, question: form.question, priority: form.priority, status: 'Unanswered'
        })
      }
      navigate('/app')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!user) return null

  return (
    <div style={{ padding: '16px', maxWidth: '500px', margin: '0 auto', minHeight: '100vh' }}>
      <button className="btn btn-ghost" onClick={() => navigate('/app')} style={{ marginBottom: 15 }}>← Back</button>

      {/* Main Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 25, overflowX: 'auto' }}>
        {['visit', 'pain', 'mcas', 'questions'].map(t => (
          <button key={t} onClick={() => { setScreen(t as any); setPainStep(1); }}
            className={`btn ${screen === t ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.75rem' }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* VISIT CARD */}
      {screen === 'visit' && (
        <div className="card shadow" style={{ borderRadius: '16px', padding: '20px' }}>
          <h3 style={{ marginTop: 0 }}>🏥 Doctor Visit</h3>
          <div className="form-group">
            <label>Doctor</label>
            {!isAddingNewDoctor ? (
              <select value={form.doctor} onChange={(e) => e.target.value === 'NEW' ? setIsAddingNewDoctor(true) : setForm({...form, doctor: e.target.value})}>
                <option value="">— Select —</option>
                {doctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                <option value="NEW">+ New Doctor...</option>
              </select>
            ) : (
              <input autoFocus placeholder="Name..." value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})} />
            )}
          </div>
          
          <label>Findings</label>
          <textarea value={form.findings} onChange={e => setForm({...form, findings: e.target.value})} rows={3} style={{ marginBottom: '15px' }} />

          <div style={{ background: '#f9f9f9', padding: '12px', borderRadius: '12px', marginBottom: '15px' }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>NEW MEDICATIONS</label>
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              <input placeholder="Med" value={newMed.medication} onChange={e => setNewMed({...newMed, medication: e.target.value})} />
              <input placeholder="Dose" style={{ width: '80px' }} value={newMed.dose} onChange={e => setNewMed({...newMed, dose: e.target.value})} />
              <button className="btn btn-secondary" onClick={() => {
                if(newMed.medication) { setDvMeds([...dvMeds, newMed]); setNewMed({medication:'', dose:''}); }
              }}>Add</button>
            </div>
            {dvMeds.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '0.9rem' }}>
                <span>{m.medication} {m.dose}</span>
                <button onClick={() => setDvMeds(dvMeds.filter((_, idx) => idx !== i))} style={{ color: 'red', border: 'none', background: 'none' }}>✕</button>
              </div>
            ))}
          </div>

          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={busy}>Save Visit</button>
        </div>
      )}

      {/* PROGRESSIVE PAIN LOG CARDS */}
      {screen === 'pain' && (
        <div style={{ position: 'relative', height: '400px' }}>
          {/* STEP 1: INTENSITY */}
          {painStep === 1 && (
            <div className="card shadow fade-in" style={{ borderRadius: '20px', textAlign: 'center', padding: '30px' }}>
              <p className="muted">HOW BAD IS IT?</p>
              <h1 style={{ fontSize: '5rem', margin: '20px 0', color: 'var(--primary)' }}>{form.intensity}</h1>
              <input type="range" min="0" max="10" value={form.intensity} onChange={e => setForm({...form, intensity: e.target.value})} style={{ width: '100%', marginBottom: '30px' }} />
              <button className="btn btn-primary btn-block" onClick={() => setPainStep(2)}>Next →</button>
            </div>
          )}

          {/* STEP 2: LOCATION */}
          {painStep === 2 && (
            <div className="card shadow fade-in" style={{ borderRadius: '20px', padding: '20px' }}>
              <p className="muted">WHERE DOES IT HURT?</p>
              <div className="pill-grid" style={{ maxHeight: '250px', overflowY: 'auto', marginBottom: '15px' }}>
                {(PAIN_AREA_LIST || []).map(a => {
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
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary flex-1" onClick={() => setPainStep(1)}>Back</button>
                <button className="btn btn-primary flex-1" onClick={() => setPainStep(3)}>Next →</button>
              </div>
            </div>
          )}

          {/* STEP 3: TYPE */}
          {painStep === 3 && (
            <div className="card shadow fade-in" style={{ borderRadius: '20px', padding: '20px' }}>
              <p className="muted">DESCRIBE THE PAIN</p>
              <div className="pill-grid" style={{ marginBottom: '15px' }}>
                {PAIN_TYPES.map(t => (
                  <button key={t} className={`pill ${painTypePicks.includes(t) ? 'on' : ''}`} onClick={() => setPainTypePicks(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}>
                    {t}
                  </button>
                ))}
              </div>
              <textarea placeholder="Any notes or triggers?" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} style={{ marginBottom: '15px' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary flex-1" onClick={() => setPainStep(2)}>Back</button>
                <button className="btn btn-primary flex-1" onClick={handleSave} disabled={busy}>Finish ✓</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MCAS CARD */}
      {screen === 'mcas' && (
        <div className="card shadow" style={{ borderRadius: '16px', padding: '20px' }}>
          <h3>🔬 MCAS Log</h3>
          <div className="form-group"><label>Trigger</label><input value={form.trigger} onChange={e => setForm({...form, trigger: e.target.value})} placeholder="What caused it?" /></div>
          <div className="form-group"><label>Symptoms</label><textarea value={form.symptoms} onChange={e => setForm({...form, symptoms: e.target.value})} rows={3} /></div>
          <div className="form-group">
            <label>Severity</label>
            <select value={form.mcas_severity} onChange={e => setForm({...form, mcas_severity: e.target.value})}>
              <option>Mild</option><option>Moderate</option><option>Severe</option>
            </select>
          </div>
          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={busy}>Save Episode</button>
        </div>
      )}

      {/* QUESTIONS CARD */}
      {screen === 'questions' && (
        <div className="card shadow" style={{ borderRadius: '16px', padding: '20px' }}>
          <h3>❓ Quick Question</h3>
          <div className="form-group">
            <label>Priority</label>
            <select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </div>
          <textarea placeholder="What do you need to ask?" value={form.question} onChange={e => setForm({...form, question: e.target.value})} rows={5} />
          <button className="btn btn-primary btn-block" style={{ marginTop: 15 }} onClick={handleSave} disabled={busy}>Save Question</button>
        </div>
      )}
    </div>
  )
}