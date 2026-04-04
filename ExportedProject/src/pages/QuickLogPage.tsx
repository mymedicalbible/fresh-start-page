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

function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

export function QuickLogPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)

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
    time: nowTime(),
    doctor: '',
    intensity: 5,
    notes: '',
    trigger: '',
    symptoms: '',
    mcas_severity: 'Moderate',
    relief: '',
    question: '',
    priority: 'Medium',
  })

  const [painSelections, setPainSelections] = useState<PainAreaSelection[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return
    async function loadInitialData () {
      const { data: docData } = await supabase.from('doctors').select('id, name').eq('user_id', user!.id).order('name')
      if (docData) setDoctors(docData)

      const { data: mcasData } = await supabase.from('mcas_episodes')
        .select('trigger').eq('user_id', user!.id)
        .order('episode_date', { ascending: false }).limit(40)
      if (mcasData) {
        const allTokens = mcasData.flatMap((d: any) => parseTriggerTokens(d.trigger))
        setSuggestedTriggers([...new Set(allTokens)].slice(0, 10))
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
    requestAnimationFrame(() => { el.scrollTop = form.intensity * 70 })
  }, [screen, painStep, form.intensity])

  const handleWheelScroll = () => {
    if (!scrollRef.current) return
    const index = Math.round(scrollRef.current.scrollTop / 70)
    if (index >= 0 && index <= 10 && index !== form.intensity) {
      setForm(prev => ({ ...prev, intensity: index }))
    }
  }

  async function handleSavePain () {
    if (!user) return
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.from('pain_entries').insert({
      user_id: user.id,
      entry_date: form.date,
      entry_time: form.time || null,
      intensity: form.intensity,
      location: painSelectionsToString(painSelections),
      pain_type: painTypePicks.join(', '),
      notes: form.notes || null,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    navigate('/app')
  }

  async function handleSaveMcas () {
    if (!user) return
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.from('mcas_episodes').insert({
      user_id: user.id,
      episode_date: form.date,
      episode_time: form.time || null,
      trigger: form.trigger,
      symptoms: form.symptoms,
      severity: form.mcas_severity,
      relief: form.relief || null,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    navigate('/app')
  }

  async function handleSaveQuestion () {
    if (!user) return
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.from('doctor_questions').insert({
      user_id: user.id,
      date_created: form.date,
      doctor: form.doctor || null,
      question: form.question,
      priority: form.priority,
      status: 'Unanswered',
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    navigate('/app')
  }

  return (
    <div style={{ padding: '16px', maxWidth: '450px', margin: '0 auto' }}>
      <button className="btn btn-ghost" onClick={() => navigate('/app')} style={{ marginBottom: 15 }}>← Back</button>

      {error && (
        <div className="banner error" style={{ marginBottom: 16 }} onClick={() => setError(null)}>
          {error} ✕
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['visit', 'pain', 'mcas', 'questions'] as const).map(t => (
          <button key={t} onClick={() => { setScreen(t); setPainStep(1) }}
            className={`btn ${screen === t ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, fontSize: '0.72rem', padding: '8px 4px' }}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {/* VISIT */}
      {screen === 'visit' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <p style={{ fontSize: '0.9rem', color: '#475569', marginTop: 0, lineHeight: 1.5 }}>
            Date → doctor → reason → questions → tests & meds. One guided flow.
          </p>
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 14 }}
            onClick={() => navigate('/app/visits?new=1')}>
            Start visit log
          </button>
        </div>
      )}

      {/* PAIN */}
      {screen === 'pain' && (
        <div className="card shadow" style={{ borderRadius: '24px' }}>
          {painStep === 1 && (
            <div className="fade-in" style={{ textAlign: 'center' }}>
              <p className="muted" style={{ marginTop: 0 }}>INTENSITY</p>
              <div style={{ position: 'relative', height: '210px', margin: '20px 0' }}>
                <div style={{ position: 'absolute', top: 70, left: 0, right: 0, height: 70, background: 'var(--accent)', opacity: 0.1, borderRadius: 12, pointerEvents: 'none' }} />
                <div ref={scrollRef} onScroll={handleWheelScroll}
                  style={{ height: 210, overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}>
                  <div style={{ height: 70 }} />
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                    <div key={n} style={{
                      height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: n === form.intensity ? '3rem' : '1.5rem', fontWeight: 'bold',
                      color: n === form.intensity ? 'var(--accent)' : '#ccc',
                      scrollSnapAlign: 'center', transition: '0.2s',
                    }}>{n}</div>
                  ))}
                  <div style={{ height: 70 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} style={{ flex: 2 }} />
                <input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} style={{ flex: 1 }} />
              </div>
              <button className="btn btn-primary btn-block" onClick={() => setPainStep(2)}>Next →</button>
            </div>
          )}
          {painStep === 2 && (
            <div className="fade-in">
              <p className="muted" style={{ marginTop: 0 }}>LOCATION</p>
              <div className="pill-grid" style={{ maxHeight: 260, overflowY: 'auto' }}>
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
                    }}>
                      {a}{sel && !MIDLINE_AREA_LIST.includes(a) ? ` (${sel.side === 'both' ? 'L+R' : sel.side[0].toUpperCase()})` : ''}
                    </button>
                  )
                })}
              </div>
              <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={() => setPainStep(3)}>Next →</button>
            </div>
          )}
          {painStep === 3 && (
            <div className="fade-in">
              <p className="muted" style={{ marginTop: 0 }}>TYPE & NOTES</p>
              <div className="pill-grid">
                {PAIN_TYPES.map(t => (
                  <button key={t} className={`pill ${painTypePicks.includes(t) ? 'on' : ''}`}
                    onClick={() => setPainTypePicks(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}>
                    {t}
                  </button>
                ))}
              </div>
              <textarea placeholder="Notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={3} style={{ marginTop: 15 }} />
              <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSavePain} disabled={busy}>
                {busy ? 'Saving…' : 'Finish ✓'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* MCAS - now includes time, severity, relief */}
      {screen === 'mcas' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3 style={{ marginTop: 0 }}>🔬 MCAS Episode</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} style={{ flex: 2 }} />
            <input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} style={{ flex: 1 }} />
          </div>
          <div className="form-group">
            <label>Trigger</label>
            <input value={form.trigger} onChange={e => setForm({...form, trigger: e.target.value})} placeholder="What caused it?" />
            {suggestedTriggers.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {suggestedTriggers.map(tag => (
                  <button key={tag} className="pill" style={{ fontSize: '0.72rem' }}
                    onClick={() => setForm({...form, trigger: tag})}>{tag}</button>
                ))}
              </div>
            )}
          </div>
          <div className="form-group">
            <label>Symptoms</label>
            <textarea placeholder="What did you experience?" value={form.symptoms} onChange={e => setForm({...form, symptoms: e.target.value})} rows={3} />
          </div>
          <div className="form-group">
            <label>Severity</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Mild', 'Moderate', 'Severe'].map(s => (
                <button key={s} type="button"
                  className={`btn ${form.mcas_severity === s ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.85rem' }}
                  onClick={() => setForm({...form, mcas_severity: s})}>{s}</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Relief & medications taken (optional)</label>
            <input value={form.relief} onChange={e => setForm({...form, relief: e.target.value})} placeholder="What helped?" />
          </div>
          <button className="btn btn-primary btn-block" onClick={handleSaveMcas} disabled={busy}>
            {busy ? 'Saving…' : 'Save Episode'}
          </button>
        </div>
      )}

      {/* QUESTIONS */}
      {screen === 'questions' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3 style={{ marginTop: 0 }}>❓ Question</h3>
          <div className="form-group">
            <label>Doctor (optional)</label>
            <select value={form.doctor} onChange={e => setForm({...form, doctor: e.target.value})}>
              <option value="">— Any / not set —</option>
              {doctors.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Priority</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['High', 'Medium', 'Low'].map(p => (
                <button key={p} type="button"
                  className={`btn ${form.priority === p ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.82rem' }}
                  onClick={() => setForm({...form, priority: p})}>
                  {p === 'High' ? '🔴' : p === 'Medium' ? '🟡' : '🟢'} {p}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Question</label>
            <textarea placeholder="What do you want to ask?" value={form.question} onChange={e => setForm({...form, question: e.target.value})} rows={4} />
          </div>
          <button className="btn btn-primary btn-block" onClick={handleSaveQuestion} disabled={busy}>
            {busy ? 'Saving…' : 'Save Question'}
          </button>
        </div>
      )}
    </div>
  )
}