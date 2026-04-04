import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { VisitLogWizard } from '../components/VisitLogWizard'
import {
  PAIN_AREA_LIST,
  MIDLINE_AREA_LIST,
  painSelectionsToString,
  parseTriggerTokens,
  type PainAreaSelection,
} from '../lib/parse'

const PAIN_TYPES = ['Burning', 'Stabbing', 'Aching', 'Throbbing', 'Sharp', 'Dull', 'Electric', 'Cramping', 'Pressure', 'Tingling']

const TAB_LABELS: Record<string, string> = {
  visit: 'Visit',
  pain: 'Pain',
  mcas: 'MCAS',
  questions: 'Qs',
}

function tabFromParams (raw: string | null): 'visit' | 'pain' | 'mcas' | 'questions' {
  const t = raw || 'pain'
  if (t === 'visit' || t === 'pain' || t === 'mcas' || t === 'questions') return t
  return 'pain'
}

export default function QuickLogPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab') ?? searchParams.get('type') ?? 'pain'
  const [screen, setScreen] = useState<'visit' | 'pain' | 'mcas' | 'questions'>(() => tabFromParams(tabParam))

  const [painStep, setPainStep] = useState(1)
  const [busy, setBusy] = useState(false)

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
    priority: 'Medium',
  })

  const [painSelections, setPainSelections] = useState<PainAreaSelection[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const doctorFromUrl = searchParams.get('doctor') ?? ''
  const specialtyFromUrl = searchParams.get('specialty') ?? ''
  const resumeVisitId = searchParams.get('resume')

  useEffect(() => {
    setScreen(tabFromParams(tabParam))
  }, [tabParam])

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: mcasData } = await supabase.from('mcas_episodes')
        .select('trigger')
        .eq('user_id', user.id)
        .order('episode_date', { ascending: false })
        .limit(40)
      if (mcasData) {
        const allTokens = mcasData.flatMap((d) => parseTriggerTokens(d.trigger))
        setSuggestedTriggers(Array.from(new Set(allTokens)).slice(0, 10))
      }
    })()
  }, [user])

  useLayoutEffect(() => {
    if (screen !== 'pain' || painStep !== 1) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = form.intensity * 70
  }, [screen, painStep, form.intensity])

  const handleWheelScroll = () => {
    if (!scrollRef.current) return
    const index = Math.round(scrollRef.current.scrollTop / 70)
    if (index >= 0 && index <= 10 && index !== form.intensity) {
      setForm((prev) => ({ ...prev, intensity: index }))
    }
  }

  const setTab = (t: 'visit' | 'pain' | 'mcas' | 'questions') => {
    setScreen(t)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', t)
      return next
    })
    setPainStep(1)
  }

  const handleSave = async () => {
    if (!user) return
    setBusy(true)
    try {
      if (screen === 'pain') {
        const { error } = await supabase.from('pain_entries').insert({
          user_id: user.id,
          entry_date: form.date,
          intensity: form.intensity,
          location: painSelectionsToString(painSelections),
          pain_type: painTypePicks.join(', '),
          notes: form.notes,
        })
        if (error) throw error
      } else if (screen === 'mcas') {
        const { error } = await supabase.from('mcas_episodes').insert({
          user_id: user.id,
          episode_date: form.date,
          trigger: form.trigger || '—',
          symptoms: form.symptoms || '—',
          severity: form.mcas_severity,
        })
        if (error) throw error
      } else if (screen === 'questions') {
        const { error } = await supabase.from('doctor_questions').insert({
          user_id: user.id,
          date_created: form.date,
          doctor: form.doctor || null,
          question: form.question,
          priority: form.priority,
          status: 'Unanswered',
        })
        if (error) throw error
      }
      navigate('/dashboard')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert(`Save failed: ${msg}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '16px', maxWidth: '450px', margin: '0 auto' }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')} style={{ marginBottom: 15 }}>
        ← Back
      </button>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['visit', 'pain', 'mcas', 'questions'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`btn ${screen === t ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, fontSize: '0.72rem', padding: '8px 4px', whiteSpace: 'nowrap' }}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {screen === 'visit' && (
        <VisitLogWizard
          resumeVisitId={resumeVisitId}
          initialDoctorName={doctorFromUrl}
          initialSpecialty={specialtyFromUrl}
          onDone={() => navigate('/dashboard')}
          onCancel={() => navigate('/dashboard')}
        />
      )}

      {screen === 'pain' && (
        <div className="card shadow" style={{ borderRadius: '24px' }}>
          <div style={{ padding: '8px 0 12px', textAlign: 'center' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => setTab('visit')}>
              Had a doctor visit? Log it →
            </button>
          </div>
          {painStep === 1 && (
            <div className="fade-in" style={{ textAlign: 'center' }}>
              <p className="muted">INTENSITY</p>
              <div style={{ position: 'relative', height: '210px', margin: '20px 0' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 70,
                    left: 0,
                    right: 0,
                    height: 70,
                    background: 'var(--primary)',
                    opacity: 0.1,
                    borderRadius: 12,
                    pointerEvents: 'none',
                  }}
                />
                <div
                  ref={scrollRef}
                  onScroll={handleWheelScroll}
                  style={{ height: 210, overflowY: 'scroll', scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
                >
                  <div style={{ height: 70 }} />
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <div
                      key={n}
                      style={{
                        height: 70,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: n === form.intensity ? '3rem' : '1.5rem',
                        fontWeight: 'bold',
                        color: n === form.intensity ? 'var(--primary)' : '#ccc',
                        scrollSnapAlign: 'center',
                        transition: '0.2s',
                      }}
                    >
                      {n}
                    </div>
                  ))}
                  <div style={{ height: 70 }} />
                </div>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={() => setPainStep(2)}>
                Next →
              </button>
            </div>
          )}
          {painStep === 2 && (
            <div className="fade-in">
              <p className="muted">LOCATION</p>
              <div className="pill-grid" style={{ maxHeight: 250, overflowY: 'auto' }}>
                {[...MIDLINE_AREA_LIST, ...PAIN_AREA_LIST].map((a) => {
                  const sel = painSelections.find((s) => s.area === a)
                  return (
                    <button
                      key={a}
                      type="button"
                      className={`pill ${sel ? 'on' : ''}`}
                      onClick={() => {
                        setPainSelections((prev) => {
                          const exists = prev.find((s) => s.area === a)
                          if (!exists) return [...prev, { area: a, side: 'left' }]
                          if (MIDLINE_AREA_LIST.includes(a)) return prev.filter((s) => s.area !== a)
                          if (exists.side === 'left') return prev.map((s) => (s.area === a ? { ...s, side: 'right' } : s))
                          if (exists.side === 'right') return prev.map((s) => (s.area === a ? { ...s, side: 'both' } : s))
                          return prev.filter((s) => s.area !== a)
                        })
                      }}
                    >
                      {a}{' '}
                      {sel && !MIDLINE_AREA_LIST.includes(a)
                        ? `(${sel.side === 'both' ? 'L+R' : sel.side[0].toUpperCase()})`
                        : ''}
                    </button>
                  )
                })}
              </div>
              <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={() => setPainStep(3)}>
                Next →
              </button>
            </div>
          )}
          {painStep === 3 && (
            <div className="fade-in">
              <p className="muted">TYPE & NOTES</p>
              <div className="pill-grid">
                {PAIN_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`pill ${painTypePicks.includes(t) ? 'on' : ''}`}
                    onClick={() => setPainTypePicks((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                placeholder="Notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                style={{ marginTop: 15 }}
              />
              <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} disabled={busy}>
                Finish ✓
              </button>
            </div>
          )}
        </div>
      )}

      {screen === 'mcas' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <div style={{ padding: '8px 0 12px', textAlign: 'center' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => setTab('visit')}>
              Had a doctor visit? Log it →
            </button>
          </div>
          <h3>MCAS</h3>
          <div className="form-group">
            <label>Trigger</label>
            <input value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} placeholder="What caused it?" />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {suggestedTriggers.map((tag) => (
                <button key={tag} type="button" className="pill" style={{ fontSize: '0.7rem' }} onClick={() => setForm({ ...form, trigger: tag })}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <textarea placeholder="Symptoms..." value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} rows={3} />
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} disabled={busy}>
            Save episode
          </button>
        </div>
      )}

      {screen === 'questions' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3>Ask</h3>
          <textarea placeholder="Question…" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} rows={5} />
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleSave} disabled={busy}>
            Save question
          </button>
        </div>
      )}
    </div>
  )
}
