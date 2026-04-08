import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { DoctorPickOrNew } from '../components/DoctorPickOrNew'
import { ensureDoctorProfile } from '../lib/ensureDoctorProfile'
import { LeaveLaterDialog } from '../components/LeaveLaterDialog'
import {
  clearQuickLogDraft,
  loadQuickLogDraft,
  saveQuickLogDraft,
  type QuickLogDraftV1,
} from '../lib/quickLogDraft'
import {
  PAIN_AREA_LIST,
  MIDLINE_AREA_LIST,
  painSelectionsToString,
  type PainAreaSelection
} from '../lib/parse'
import { parseAppReturnPath, safeAppReturnPath } from '../lib/safeReturnPath'

const PAIN_TYPES = ['Burning', 'Stabbing', 'Aching', 'Throbbing', 'Sharp', 'Dull', 'Electric', 'Cramping', 'Pressure', 'Tingling']

function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

// Parse comma-separated symptom strings into unique tokens
function parseSymptomTokens (text: string): string[] {
  if (!text) return []
  return text.split(',').map(s => s.trim()).filter(Boolean)
}

function quickLogDraftMeaningful (d: QuickLogDraftV1): boolean {
  if (d.screen === 'visit') return false
  if (d.screen === 'pain') {
    return d.painStep > 1 || d.form.intensity !== 5 || d.painSelections.length > 0 || d.painTypePicks.length > 0 || d.form.notes.trim().length > 0
  }
  if (d.screen === 'symptoms') {
    return !!(d.form.activity.trim() || d.selectedSymptoms.length || d.newSymptomText.trim() || d.form.relief.trim() || d.form.severity !== 'Moderate')
  }
  if (d.screen === 'questions') {
    return !!(d.form.question.trim() || d.form.doctor.trim() || d.form.doctor_specialty.trim() || d.form.priority !== 'Medium')
  }
  return false
}

export function QuickLogPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname, search: locSearch } = useLocation()
  const [searchParams] = useSearchParams()
  const returnRaw = searchParams.get('returnTo')
  const leaveBackPath = safeAppReturnPath(returnRaw, '/app')
  const [error, setError] = useState<string | null>(null)
  const [postSave, setPostSave] = useState<{ archive: string; title: string } | null>(null)

  const [screen, setScreen] = useState<'visit' | 'pain' | 'symptoms' | 'questions'>(() => {
    const t = searchParams.get('tab')
    // map old 'mcas' param to 'symptoms' for backwards compat
    if (t === 'symptoms' || t === 'mcas') return 'symptoms'
    if (t === 'visit' || t === 'pain' || t === 'questions') return t
    return 'visit'
  })
  const [painStep, setPainStep] = useState(1)
  const [busy, setBusy] = useState(false)

  const [doctors, setDoctors] = useState<{ id: string; name: string; specialty: string | null }[]>([])

  // Symptom suggestions — learned from past logs
  const [pastSymptoms, setPastSymptoms] = useState<string[]>([])
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([])
  const [newSymptomText, setNewSymptomText] = useState('')

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: nowTime(),
    doctor: '',
    doctor_specialty: '',
    intensity: 5,
    notes: '',
    activity: '',        // what were you doing in the last 4 hours
    severity: 'Moderate',
    relief: '',
    question: '',
    priority: 'Medium',
  })

  const [painSelections, setPainSelections] = useState<PainAreaSelection[]>([])
  const [painTypePicks, setPainTypePicks] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [resumePrompt, setResumePrompt] = useState(false)
  const [leavePrompt, setLeavePrompt] = useState(false)
  const resumeCheckedRef = useRef(false)

  const applyQuickLogDraft = useCallback((d: QuickLogDraftV1) => {
    setScreen(d.screen)
    setPainStep(d.painStep)
    setForm(d.form)
    setSelectedSymptoms(d.selectedSymptoms)
    setNewSymptomText(d.newSymptomText)
    setPainSelections(d.painSelections.map((p) => ({ ...p })))
    setPainTypePicks([...d.painTypePicks])
  }, [])

  const snapshotDraft = useCallback((): QuickLogDraftV1 | null => {
    if (!user) return null
    return {
      v: 1,
      userId: user.id,
      screen,
      painStep,
      form: { ...form },
      selectedSymptoms: [...selectedSymptoms],
      newSymptomText,
      painSelections: painSelections.map((p) => ({ ...p })),
      painTypePicks: [...painTypePicks],
    }
  }, [user, screen, painStep, form, selectedSymptoms, newSymptomText, painSelections, painTypePicks])

  const isQuickLogDirty = useCallback(() => {
    const d = snapshotDraft()
    return !!(d && quickLogDraftMeaningful(d))
  }, [snapshotDraft])

  const commitLeaveNavigation = useCallback(() => {
    navigate(leaveBackPath)
  }, [leaveBackPath, navigate])

  const attemptLeave = useCallback(() => {
    if (!isQuickLogDirty()) {
      clearQuickLogDraft()
      navigate(leaveBackPath)
      return
    }
    setLeavePrompt(true)
  }, [isQuickLogDirty, leaveBackPath, navigate])

  useEffect(() => {
    if (!user) return
    async function loadInitialData () {
      const { data: docData } = await supabase.from('doctors').select('id, name, specialty').eq('user_id', user!.id).order('name')
      if (docData) setDoctors(docData)

      // Load past symptoms to build suggestions
      const { data: symData } = await supabase.from('mcas_episodes')
        .select('symptoms')
        .eq('user_id', user!.id)
        .not('symptoms', 'is', null)
        .order('episode_date', { ascending: false })
        .limit(60)

      if (symData) {
        const allTokens = symData.flatMap((d: any) => parseSymptomTokens(d.symptoms ?? ''))
        const counts = new Map<string, number>()
        allTokens.forEach(t => counts.set(t, (counts.get(t) ?? 0) + 1))
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
        setPastSymptoms(sorted.slice(0, 20))
      }
    }
    loadInitialData()
  }, [user])

  useEffect(() => {
    if (!user || resumeCheckedRef.current) return
    resumeCheckedRef.current = true
    const d = loadQuickLogDraft(user.id)
    if (d && quickLogDraftMeaningful(d)) setResumePrompt(true)
  }, [user])

  useEffect(() => {
    if (!user) return
    const draft: QuickLogDraftV1 = {
      v: 1,
      userId: user.id,
      screen,
      painStep,
      form: { ...form },
      selectedSymptoms: [...selectedSymptoms],
      newSymptomText,
      painSelections: painSelections.map((p) => ({ ...p })),
      painTypePicks: [...painTypePicks],
    }
    if (!quickLogDraftMeaningful(draft)) return
    const t = window.setTimeout(() => saveQuickLogDraft(draft), 450)
    return () => window.clearTimeout(t)
  }, [user, screen, painStep, form, selectedSymptoms, newSymptomText, painSelections, painTypePicks])

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t === 'symptoms' || t === 'mcas') setScreen('symptoms')
    else if (t === 'visit' || t === 'pain' || t === 'questions') setScreen(t)
  }, [searchParams])

  useEffect(() => {
    if (screen !== 'pain' || painStep !== 1 || !scrollRef.current) return
    const el = scrollRef.current
    requestAnimationFrame(() => { el.scrollTop = form.intensity * 70 })
  }, [screen, painStep])

  const handleWheelScroll = () => {
    if (!scrollRef.current) return
    const index = Math.round(scrollRef.current.scrollTop / 70)
    if (index >= 0 && index <= 10 && index !== form.intensity) {
      setForm(prev => ({ ...prev, intensity: index }))
    }
  }

  function toggleSymptom (sym: string) {
    setSelectedSymptoms(prev =>
      prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]
    )
  }

  function addCustomSymptom () {
    const trimmed = newSymptomText.trim()
    if (!trimmed) return
    if (!selectedSymptoms.includes(trimmed)) {
      setSelectedSymptoms(prev => [...prev, trimmed])
    }
    // also add to suggestions if not already there
    if (!pastSymptoms.includes(trimmed)) {
      setPastSymptoms(prev => [trimmed, ...prev])
    }
    setNewSymptomText('')
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
    clearQuickLogDraft()
    setPostSave({ archive: '/app/records?tab=pain', title: 'Pain log archive' })
  }

  async function handleSaveSymptoms () {
    if (!user) return
    if (selectedSymptoms.length === 0) { setError('Please add at least one feature for this episode.'); return }
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.from('mcas_episodes').insert({
      user_id: user.id,
      episode_date: form.date,
      episode_time: form.time || null,
      trigger: '',  // kept for schema compat, not used
      activity: form.activity || null,
      symptoms: selectedSymptoms.join(', '),
      severity: form.severity,
      relief: form.relief || null,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    clearQuickLogDraft()
    setPostSave({ archive: '/app/records?tab=symptoms', title: 'Episode archive' })
  }

  async function handleSaveQuestion () {
    if (!user) return
    setBusy(true)
    setError(null)
    const basePayload = {
      user_id: user.id,
      date_created: form.date,
      doctor: form.doctor.trim() || null,
      question: form.question,
      priority: form.priority,
      status: 'Unanswered',
    }
    let { error: e } = await supabase.from('doctor_questions').insert({
      ...basePayload,
      doctor_specialty: form.doctor_specialty.trim() || null,
    })
    if (e?.message?.toLowerCase().includes('doctor_specialty')) {
      // Column not yet migrated — insert without it
      const res2 = await supabase.from('doctor_questions').insert(basePayload)
      e = res2.error
    }
    setBusy(false)
    if (e) { setError(e.message); return }
    if (form.doctor.trim()) void ensureDoctorProfile(user.id, form.doctor, form.doctor_specialty || null)
    clearQuickLogDraft()
    setPostSave({ archive: '/app/questions', title: 'Questions archive' })
  }

  return (
    <div style={{ padding: '16px', maxWidth: '450px', margin: '0 auto' }}>
      {resumePrompt && user && (
        <LeaveLaterDialog
          variant="resume"
          onResume={() => {
            const d = loadQuickLogDraft(user.id)
            if (d) applyQuickLogDraft(d)
            setResumePrompt(false)
          }}
          onFresh={() => {
            clearQuickLogDraft()
            setResumePrompt(false)
          }}
        />
      )}
      {leavePrompt && (
        <LeaveLaterDialog
          variant="saveForLater"
          onYes={() => {
            const d = snapshotDraft()
            if (d) saveQuickLogDraft(d)
            setLeavePrompt(false)
            commitLeaveNavigation()
          }}
          onNo={() => {
            clearQuickLogDraft()
            setLeavePrompt(false)
            commitLeaveNavigation()
          }}
          onStay={() => setLeavePrompt(false)}
        />
      )}

      {postSave && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(30,77,52,0.2)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 360, width: '100%', borderRadius: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--mint-ink)' }}>Saved</div>
            <p className="muted" style={{ fontSize: '0.88rem', marginTop: 0 }}>
              Open the archive for this list, tap <strong>Done</strong> to exit quick log and return where you started, or <strong>Stay here</strong> to log something else.
            </p>
            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <button type="button" className="btn btn-mint btn-block"
                onClick={() => { navigate(postSave.archive); setPostSave(null) }}>
                Open {postSave.title}
              </button>
              <button type="button" className="btn btn-primary btn-block"
                onClick={() => { navigate(leaveBackPath); setPostSave(null) }}>
                Done
              </button>
              <button type="button" className="btn btn-ghost btn-block"
                onClick={() => setPostSave(null)}>
                Stay here
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="banner error" style={{ marginBottom: 16 }} onClick={() => setError(null)}>
          {error} ✕
        </div>
      )}

      {/* VISIT */}
      {screen === 'visit' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 12px' }} onClick={() => attemptLeave()}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: '1 1 180px' }}
              onClick={() => {
                const origin = parseAppReturnPath(searchParams.get('returnTo'))
                const visitReturn = origin ?? `${pathname}${locSearch}`
                navigate(`/app/visits?new=1&returnTo=${encodeURIComponent(visitReturn)}`)
              }}
            >
              Start visit log
            </button>
          </div>
        </div>
      )}

      {/* PAIN — 3-step wheel */}
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 12px' }} onClick={() => attemptLeave()}>Cancel</button>
                <button type="button" className="btn btn-primary" style={{ flex: '1 1 140px' }} onClick={() => setPainStep(2)}>Next →</button>
              </div>
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 20, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 12px' }} onClick={() => attemptLeave()}>Cancel</button>
                <button type="button" className="btn btn-primary" style={{ flex: '1 1 140px' }} onClick={() => setPainStep(3)}>Next →</button>
              </div>
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
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 20, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 12px' }} onClick={() => attemptLeave()}>Cancel</button>
                <button type="button" className="btn btn-primary" style={{ flex: '1 1 160px' }} onClick={handleSavePain} disabled={busy}>
                  {busy ? 'Saving…' : 'Finish ✓'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SYMPTOMS — replaces MCAS */}
      {screen === 'symptoms' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3 style={{ marginTop: 0 }}>Log an episode</h3>

          {/* Date + time */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} style={{ flex: 2 }} />
            <input type="time" value={form.time} onChange={e => setForm({...form, time: e.target.value})} style={{ flex: 1 }} />
          </div>

          {/* What were you doing */}
          <div className="form-group">
            <label>What were you doing in the last 4 hours?</label>
            <input
              value={form.activity}
              onChange={e => setForm({...form, activity: e.target.value})}
              placeholder="e.g. Eating, exercising, sleeping, working…"
            />
          </div>

          {/* Symptom picker */}
          <div className="form-group">
            <label>Episode features</label>
            {pastSymptoms.length > 0 && (
              <div className="pill-grid" style={{ marginBottom: 10 }}>
                {pastSymptoms.map(sym => (
                  <button
                    key={sym}
                    className={`pill ${selectedSymptoms.includes(sym) ? 'on' : ''}`}
                    onClick={() => toggleSymptom(sym)}
                    style={{ fontSize: '0.78rem' }}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}
            {/* Add custom symptom */}
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={newSymptomText}
                onChange={e => setNewSymptomText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCustomSymptom()}
                placeholder="Type a feature and tap Add…"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-secondary"
                style={{ flexShrink: 0, fontSize: '0.82rem', padding: '8px 12px' }}
                onClick={addCustomSymptom}>
                Add
              </button>
            </div>
          </div>

          {/* Severity */}
          <div className="form-group">
            <label>Severity</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Mild', 'Moderate', 'Severe'].map(s => (
                <button key={s} type="button"
                  className={`btn ${form.severity === s ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.85rem' }}
                  onClick={() => setForm({...form, severity: s})}>{s}</button>
              ))}
            </div>
          </div>

          {/* Relief */}
          <div className="form-group">
            <label>Relief & medications taken (optional)</label>
            <input
              value={form.relief}
              onChange={e => setForm({...form, relief: e.target.value})}
              placeholder="What helped?"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 12px' }} onClick={() => attemptLeave()}>Cancel</button>
            <button type="button" className="btn btn-primary" style={{ flex: '1 1 180px' }} onClick={handleSaveSymptoms} disabled={busy}>
              {busy ? 'Saving…' : 'Save episode'}
            </button>
          </div>
        </div>
      )}

      {/* QUESTIONS */}
      {screen === 'questions' && (
        <div className="card shadow" style={{ borderRadius: '16px' }}>
          <h3 style={{ marginTop: 0 }}>Question</h3>
          <DoctorPickOrNew
            doctors={doctors}
            value={form.doctor}
            onChange={(v) => setForm({ ...form, doctor: v })}
            specialty={form.doctor_specialty}
            onSpecialtyChange={(v) => setForm({ ...form, doctor_specialty: v })}
            showSpecialtyForNew
            label="Doctor (optional)"
            id="quicklog-q-doctor"
          />
          <div className="form-group">
            <label>Priority</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['High', 'Medium', 'Low'].map(p => (
                <button key={p} type="button"
                  className={`btn ${form.priority === p ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.82rem' }}
                  onClick={() => setForm({...form, priority: p})}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Question</label>
            <textarea placeholder="What do you want to ask?" value={form.question} onChange={e => setForm({...form, question: e.target.value})} rows={4} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 12px' }} onClick={() => attemptLeave()}>Cancel</button>
            <button type="button" className="btn btn-primary" style={{ flex: '1 1 200px' }} onClick={handleSaveQuestion} disabled={busy}>
              {busy ? 'Saving…' : 'Save Question'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}