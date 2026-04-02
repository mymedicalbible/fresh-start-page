import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { 
  PAIN_AREA_LIST, 
  MIDLINE_AREA_LIST,
  painSelectionsToString, 
  parseTriggerTokens,
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
  
  // Data States
  const [doctors, setDoctors] = useState<{id: string, name: string}[]>([])
  const [suggestedTriggers, setSuggestedTriggers] = useState<string[]>([])
  const [isAddingNewDoctor, setIsAddingNewDoctor] = useState(false)

  // Medication State (Visit Log)
  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string }[]>([])
  const [newMedName, setNewMedName] = useState('')
  const [newMedDose, setNewMedDose] = useState('')

  // Unified Form State
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    doctor: '',
    findings: '',
    intensity: 5,
    notes: '',
    trigger: '',
    symptoms: '',
    mcas_severity: 'Moderate',
    question: '',
    priority: 'Medium'
  })

  const [painSelections, setPainSelections] = useState<PainAreaSelection[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return

    async function loadInitialData() {
      // 1. Fetch Doctors
      const { data: docData } = await supabase.from('doctors').select('id, name').eq('user_id', user!.id).order('name')
      if (docData) setDoctors(docData)

      // 2. Fetch & Parse MCAS Triggers for Smart Tags
      const { data: mcasData } = await supabase.from('mcas_episodes')
        .select('trigger')
        .eq('user_id', user!.id)
        .order('episode_date', { ascending: false })
        .limit(40)
      
      if (mcasData) {
        const allTokens = mcasData.flatMap(d => parseTriggerTokens(d.trigger))
        const unique = Array.from(new Set(allTokens)).slice(0, 10)
        setSuggestedTriggers(unique)
      }
    }

    loadInitialData()
  }, [user])

  // Handle the Prize Wheel scroll logic
  const handleWheelScroll = () => {
    if (!scrollRef.current) return
    const index = Math.round(scrollRef.current.scrollTop / 70)
    if (index >= 0 && index <= 10 && index !== form.intensity) {
      setForm(prev => ({ ...prev, intensity: index }))
    }
  }

  const handleSave = async () => {
    if (!user) return
    setBusy(true)
    
    try {
      if (screen === 'visit') {
        const medsString = dvMeds.map(m => `${m.medication} (${m.dose})`).join(', ')
        await supabase.from('doctor_visits').insert({
          user_id: user.id, visit_date: form.date, doctor: form.doctor, findings: form.findings, new_meds: medsString
        })
      } else if (screen === 'pain') {
        await supabase.from('pain_entries').insert({
          user_id: user.id, entry_date: form.date, intensity: form.intensity,
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
      alert("Save Failed: " + e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '16px', maxWidth: '450px', margin: '0 auto' }}>
      <button className="btn btn-ghost" onClick={() => navigate('/app')} style={{ marginBottom: 15 }}>← Back</button>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['visit', 'pain', 'mcas', 'questions'].map(t => (
          <button key={t} onClick={() => { setScreen(t as any); setPainStep(1); }}
            className={`btn ${screen === t ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.7rem' }}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {/* VISIT CARD */}
      {screen === 'visit' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3>🏥 Visit</h3>
          <div className="form-group">
            <label>Doctor</label>
            {!isAddingNewDoctor ? (
              <select value={form.doctor} onChange={e => e.target.value === 'NEW' ? setIsAddingNewDoctor(true) : setForm({...form, doctor: e.target.value})}>
                <option value="">— Select —</option>
                {doctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                <option value="NEW">+ New Doctor...</option>
              </select>
            ) : (
              <input autoFocus value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})} placeholder="Doctor Name" />
            )}
          </div>
          <textarea placeholder="Findings..." value={form.findings} onChange={e => setForm({...form, findings: e.target.value})} rows={3} />
          
          <div style={{ marginTop: 15, padding: 12, background: '#f5f5f5', borderRadius: 12 }}>
            <label style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>ADD MEDICATION</label>
            <div style={{ display: 'flex', gap: 5, marginTop: 8 }}>
              <input placeholder="Name" value={newMedName} onChange={e => setNewMedName(e.target.value)} />
              <input placeholder="Dose" value={newMedDose} onChange={e => setNewMedDose(e.target.value)} style={{ width: 80 }} />
              <button className="btn btn-secondary" onClick={() => {
                if(newMedName) { setDvMeds([...dvMeds, { medication: newMedName, dose: newMedDose }]); setNewMedName(''); setNewMedDose(''); }
              }}>Add</button>
            </div>
            {dvMeds.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ fontSize: '0.9rem' }}>{m.medication} ({m.dose})</span>
                <button onClick={() => setDvMeds(dvMeds.filter((_, idx) => idx !== i))} style={{ color: 'red', background: 'none', border: 'none' }}>✕</button>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} disabled={busy}>Save Visit</button>
        </div>
      )}

      {/* PAIN WHEEL PROGRESSIVE */}
      {screen === 'pain' && (
        <div className="card shadow" style={{ borderRadius: '24px' }}>
          {painStep === 1 && (
            <div className="fade-in" style={{ textAlign: 'center' }}>
              <p className="muted">INTENSITY</p>
              <div style={{ position: 'relative', height: '210px', margin: '20px 0' }}>
                <div style={{ position: 'absolute', top: 70, left: 0, right: 0, height: 70, background: 'var(--primary)', opacity: 0.1, borderRadius: 12, pointerEvents: 'none' }} />
                <div ref={scrollRef} onScroll={handleWheelScroll} style={{ height: 210, overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}>
                  <div style={{ height: 70 }} />
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                    <div key={n} style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: n === form.intensity ? '3rem' : '1.5rem', fontWeight: 'bold', color: n === form.intensity ? 'var(--primary)' : '#ccc', scrollSnapAlign: 'center', transition: '0.2s' }}>{n}</div>
                  ))}
                  <div style={{ height: 70 }} />
                </div>
              </div>
              <button className="btn btn-primary btn-block" onClick={() => setPainStep(2)}>Next →</button>
            </div>
          )}
          {painStep === 2 && (
            <div className="fade-in">
              <p className="muted">LOCATION</p>
              <div className="pill-grid" style={{ maxHeight: 250, overflowY: 'auto' }}>
                {[...MIDLINE_AREA_LIST, ...PAIN_AREA_LIST].map(a => {
                  const sel = painSelections.find(s => s.area === a)
                  return (
                    <button key={a} className={`pill ${sel ? 'on' : ''}`} onClick={() => {
                      setPainSelections(prev => {
                        const exists = prev.find(s => s.area === a)
                        if (!exists) return [...prev, { area: a, side: 'left' }]
                        if (MIDLINE_AREA_LIST.includes(a)) return prev.filter(s => s.area !== a)
                        if (exists.side === 'left') return prev.map(s => s.area === a ? {...s, side: 'right'} : s)
                        if (exists.side === 'right') return prev.map(s => s.area === a ? {...s, side: 'both'} : s)
                        return prev.filter(s => s.area !== a)
                      })
                    }}>{a} {sel && !MIDLINE_AREA_LIST.includes(a) ? `(${sel.side === 'both' ? 'L+R' : sel.side[0].toUpperCase()})` : ''}</button>
                  )
                })}
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={() => setPainStep(3)}>Next →</button>
            </div>
          )}
          {painStep === 3 && (
            <div className="fade-in">
              <p className="muted">TYPE & NOTES</p>
              <div className="pill-grid">
                {PAIN_TYPES.map(t => (
                  <button key={t} className={`pill ${painTypePicks.includes(t) ? 'on' : ''}`} onClick={() => setPainTypePicks(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}>{t}</button>
                ))}
              </div>
              <textarea placeholder="Notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} style={{ marginTop: 15 }} />
              <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} disabled={busy}>Finish ✓</button>
            </div>
          )}
        </div>
      )}

      {/* MCAS SMART TAGS */}
      {screen === 'mcas' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3>🔬 MCAS</h3>
          <div className="form-group">
            <label>Trigger</label>
            <input value={form.trigger} onChange={e => setForm({...form, trigger: e.target.value})} placeholder="What caused it?" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {suggestedTriggers.map(tag => (
                <button key={tag} className="pill" style={{ fontSize: '0.7rem' }} onClick={() => setForm({...form, trigger: tag})}>{tag}</button>
              ))}
            </div>
          </div>
          <textarea placeholder="Symptoms..." value={form.symptoms} onChange={e => setForm({...form, symptoms: e.target.value})} rows={3} />
          <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} disabled={busy}>Save Episode</button>
        </div>
      )}

      {/* QUESTIONS */}
      {screen === 'questions' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3>❓ Ask</h3>
          <textarea placeholder="Question..." value={form.question} onChange={e => setForm({...form, question: e.target.value})} rows={5} />
          <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} disabled={busy}>Save Question</button>
        </div>
      )}
    </div>
  )
}