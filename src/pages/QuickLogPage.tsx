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


const TAB_LABEL: Record<string, string> = {
  visit: 'Visit',
  pain: 'Pain',
  mcas: 'MCAS',
  questions: "Q's",
}


export function QuickLogPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [screen, setScreen] = useState<'visit' | 'pain' | 'mcas' | 'questions'>(() => {
    const t = searchParams.get('tab')
    if (t === 'visit' || t === 'pain' || t === 'mcas' || t === 'questions') return t
    return 'visit'
  })
  const [painStep, setPainStep] = useState(1)
  const [busy, setBusy] = useState(false)

  const [doctors, setDoctors] = useState<{ id: string; name: string }[]>([])
  const [suggestedTriggers, setSuggestedTriggers] = useState<string[]>([])

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
      const { data: docData } = await supabase.from('doctors').select('id, name').eq('user_id', user!.id).order('name')
      if (docData) setDoctors(docData)

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


  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'visit' || t === 'pain' || t === 'mcas' || t === 'questions') setScreen(t)
  }, [searchParams])


  useEffect(() => {
    if (screen !== 'pain' || painStep !== 1 || !scrollRef.current) return
    const el = scrollRef.current
    requestAnimationFrame(() => {
      el.scrollTop = form.intensity * 70
    })
  }, [screen, painStep, form.intensity])


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
      if (screen === 'pain') {
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
          user_id: user.id, date_created: form.date, doctor: form.doctor || null, question: form.question, priority: form.priority, status: 'Unanswered'
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

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['visit', 'pain', 'mcas', 'questions'] as const).map(t => (
          <button key={t} onClick={() => { setScreen(t); setPainStep(1); }}
            className={`btn ${screen === t ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1, fontSize: '0.72rem', padding: '8px 4px' }}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {screen === 'visit' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <p style={{ fontSize: '0.9rem', color: '#475569', marginTop: 0, lineHeight: 1.5 }}>
            Date → doctor → reason chips → questions → tests & meds. One flow everywhere.
          </p>
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 14 }}
            onClick={() => navigate('/app/visits?new=1')}>
            Start visit log
          </button>
        </div>
      )}

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

      {screen === 'questions' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3>❓ Ask</h3>
          <div className="form-group">
            <label>Doctor (optional)</label>
            <select value={form.doctor} onChange={e => setForm({ ...form, doctor: e.target.value })}>
              <option value="">—</option>
              {doctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <textarea placeholder="Question..." value={form.question} onChange={e => setForm({...form, question: e.target.value})} rows={5} />
          <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} disabled={busy}>Save Question</button>
        </div>
      )}
    </div>
  )
}
