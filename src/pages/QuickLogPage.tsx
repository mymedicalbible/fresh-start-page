import { useEffect, useState, useRef, useCallback } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { fetchWeatherSnapshot } from '../lib/weatherSnapshot'
import { useAuth } from '../contexts/AuthContext'
import { DoctorPickOrNew } from '../components/DoctorPickOrNew'
import { ensureDoctorProfile } from '../lib/ensureDoctorProfile'
import { LeaveLaterDialog } from '../components/LeaveLaterDialog'
import { LeaveHomeConfirmDialog } from '../components/LeaveHomeConfirmDialog'
import { SaveLogOptionsDialog } from '../components/SaveLogOptionsDialog'
import { AppConfirmDialog } from '../components/AppConfirmDialog'
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
import { normDoctorKey } from '../lib/doctorNameNorm'
import { EpisodeFeatureChip } from '../components/EpisodeFeatureChip'

type PickerDoctorQuestionRow = {
  id: string
  question: string
  priority: string | null
  status: string | null
  answer: string | null
  date_created: string
  doctor: string | null
}

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

function ScrapSticker ({
  to, title, sub, tone, navState,
}: { to: string; title: string; sub: string; tone: 'pink' | 'mint' | 'sky' | 'cream' | 'lavender'; navState?: { backTo: string } }) {
  return (
    <Link to={to} state={navState} className={`scrap-sticker scrap-sticker--${tone}`}>
      <span className="scrap-sticker-title">{title}</span>
      <span className="scrap-sticker-sub">{sub}</span>
    </Link>
  )
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

  const [screen, setScreen] = useState<'hub' | 'visit' | 'pain' | 'symptoms' | 'questions'>(() => {
    const t = searchParams.get('tab')
    // map old 'mcas' param to 'symptoms' for backwards compat
    if (t === 'symptoms' || t === 'mcas') return 'symptoms'
    if (t === 'visit' || t === 'pain' || t === 'questions') return t
    return 'hub'
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
  const [cancelLeaveOpen, setCancelLeaveOpen] = useState(false)
  const [saveDialogKind, setSaveDialogKind] = useState<null | 'pain' | 'symptoms' | 'questions'>(null)
  const [symptomRemoveReveal, setSymptomRemoveReveal] = useState<string | null>(null)
  const resumeCheckedRef = useRef(false)
  /** Questions already saved for the doctor selected in the picker (this screen is for logging new ones only). */
  const [pickerDoctorQuestions, setPickerDoctorQuestions] = useState<PickerDoctorQuestionRow[]>([])
  const [answerEditingId, setAnswerEditingId] = useState<string | null>(null)
  const [answerDraft, setAnswerDraft] = useState('')
  const [answerSaving, setAnswerSaving] = useState(false)
  const [incompleteKind, setIncompleteKind] = useState<null | 'pain' | 'symptoms' | 'questions'>(null)

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
    if (!user || screen === 'hub') return null
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

  const attemptLeave = useCallback(() => {
    if (screen === 'hub') {
      navigate(leaveBackPath)
      return
    }
    setCancelLeaveOpen(true)
  }, [leaveBackPath, navigate, screen])

  function confirmLeaveHome () {
    setCancelLeaveOpen(false)
    const d = snapshotDraft()
    if (d && quickLogDraftMeaningful(d)) saveQuickLogDraft(d)
    navigate('/app')
  }

  function logTabHref (tab: 'pain' | 'symptoms' | 'questions') {
    const q = new URLSearchParams(searchParams)
    q.set('tab', tab)
    return `/app/log?${q.toString()}`
  }

  function visitLogHref () {
    const ret = encodeURIComponent(`${pathname}${locSearch}`)
    return `/app/visits?new=1&returnTo=${ret}`
  }

  function saveDraftAndGoHome () {
    const d = snapshotDraft()
    if (d) saveQuickLogDraft(d)
    navigate('/app')
  }

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
    if (!user || screen === 'hub') return
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
    else setScreen('hub')
  }, [searchParams])

  const loadPickerDoctorQuestions = useCallback(async () => {
    if (!user || screen !== 'questions' || !form.doctor.trim()) {
      setPickerDoctorQuestions([])
      return
    }
    const doc = form.doctor.trim()
    const { data, error: e } = await supabase
      .from('doctor_questions')
      .select('id, question, priority, status, answer, date_created, doctor')
      .eq('user_id', user.id)
      .order('date_created', { ascending: false })
      .limit(120)
    if (e) return
    const key = normDoctorKey(doc)
    const filtered = (data ?? []).filter((row: { doctor: string | null }) =>
      !!row.doctor && normDoctorKey(row.doctor) === key,
    ) as PickerDoctorQuestionRow[]
    setPickerDoctorQuestions(filtered)
  }, [user, screen, form.doctor])

  useEffect(() => {
    void loadPickerDoctorQuestions()
  }, [loadPickerDoctorQuestions])

  useEffect(() => {
    setAnswerEditingId(null)
    setAnswerDraft('')
  }, [form.doctor])

  async function saveInlineAnswer (questionId: string) {
    if (!user) return
    const text = answerDraft.trim()
    if (!text) {
      setError('Type an answer first.')
      return
    }
    setAnswerSaving(true)
    setError(null)
    const { error: e } = await supabase
      .from('doctor_questions')
      .update({ answer: text, status: 'Answered' })
      .eq('id', questionId)
      .eq('user_id', user.id)
    setAnswerSaving(false)
    if (e) { setError(e.message); return }
    setAnswerEditingId(null)
    setAnswerDraft('')
    void loadPickerDoctorQuestions()
  }

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

  function painLogLooksIncomplete (): boolean {
    if (painSelections.length === 0) return true
    if (painTypePicks.length === 0 && !form.notes.trim()) return true
    return false
  }

  function symptomsLogLooksIncomplete (): boolean {
    if (!form.activity.trim()) return true
    if (selectedSymptoms.length === 0) return true
    return false
  }

  function questionsLogLooksIncomplete (): boolean {
    return !form.question.trim()
  }

  function requestSavePain () {
    if (painLogLooksIncomplete()) {
      setIncompleteKind('pain')
      return
    }
    void handleSavePain()
  }

  function requestSaveSymptoms () {
    if (symptomsLogLooksIncomplete()) {
      setIncompleteKind('symptoms')
      return
    }
    void handleSaveSymptoms()
  }

  function requestSaveQuestion () {
    if (!form.doctor.trim()) {
      setError('Choose a doctor for this question.')
      return
    }
    if (questionsLogLooksIncomplete()) {
      setIncompleteKind('questions')
      return
    }
    void handleSaveQuestion()
  }

  async function handleSavePain () {
    if (!user) return
    setBusy(true)
    setError(null)
    const weatherSnapshot = await fetchWeatherSnapshot()
    const { error: e } = await supabase.from('pain_entries').insert({
      user_id: user.id,
      entry_date: form.date,
      entry_time: form.time || null,
      intensity: form.intensity,
      location: painSelectionsToString(painSelections),
      pain_type: painTypePicks.join(', '),
      notes: form.notes || null,
      weather_snapshot: weatherSnapshot,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    clearQuickLogDraft()
    try {
      sessionStorage.setItem('mb-analytics-refresh', '1')
    } catch { /* ignore */ }
    setPostSave({ archive: '/app/records?tab=pain', title: 'Pain log archive' })
  }

  async function handleSaveSymptoms () {
    if (!user) return
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
    try {
      sessionStorage.setItem('mb-analytics-refresh', '1')
    } catch { /* ignore */ }
    setPostSave({ archive: '/app/records?tab=symptoms', title: 'Episode archive' })
  }

  async function handleSaveQuestion () {
    if (!user) return
    if (!form.doctor.trim()) {
      setError('Choose a doctor for this question.')
      return
    }
    setBusy(true)
    setError(null)
    const basePayload = {
      user_id: user.id,
      date_created: form.date,
      doctor: form.doctor.trim(),
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
    void ensureDoctorProfile(user.id, form.doctor.trim(), form.doctor_specialty || null)
    void loadPickerDoctorQuestions()
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
            if (d) {
              applyQuickLogDraft(d)
              if (d.screen !== 'visit') {
                const q = new URLSearchParams(searchParams)
                q.set('tab', d.screen === 'symptoms' ? 'symptoms' : d.screen === 'questions' ? 'questions' : 'pain')
                navigate({ pathname: '/app/log', search: q.toString() }, { replace: true })
              }
            }
            setResumePrompt(false)
          }}
          onFresh={() => {
            const before = user ? loadQuickLogDraft(user.id) : null
            const was = before?.screen
            clearQuickLogDraft()
            setResumePrompt(false)
            const p = new URLSearchParams()
            if (returnRaw) p.set('returnTo', returnRaw)
            if (was === 'symptoms') p.set('tab', 'symptoms')
            else if (was === 'questions') p.set('tab', 'questions')
            else if (was === 'pain') p.set('tab', 'pain')
            else if (was === 'visit') p.set('tab', 'visit')
            navigate({ pathname: '/app/log', search: p.toString() }, { replace: true })
            if (was === 'symptoms') setScreen('symptoms')
            else if (was === 'questions') setScreen('questions')
            else if (was === 'pain') setScreen('pain')
            else if (was === 'visit') setScreen('visit')
            else setScreen('hub')
          }}
        />
      )}
      {cancelLeaveOpen && (
        <LeaveHomeConfirmDialog
          onConfirmLeave={confirmLeaveHome}
          onStay={() => setCancelLeaveOpen(false)}
        />
      )}

      {saveDialogKind === 'pain' && (
        <SaveLogOptionsDialog
          title="Save pain log"
          onSaveComplete={() => {
            setSaveDialogKind(null)
            requestSavePain()
          }}
          onSaveForLater={() => {
            setSaveDialogKind(null)
            saveDraftAndGoHome()
          }}
          onKeepEditing={() => setSaveDialogKind(null)}
        />
      )}
      {saveDialogKind === 'symptoms' && (
        <SaveLogOptionsDialog
          title="Save episode"
          onSaveComplete={() => {
            setSaveDialogKind(null)
            requestSaveSymptoms()
          }}
          onSaveForLater={() => {
            setSaveDialogKind(null)
            saveDraftAndGoHome()
          }}
          onKeepEditing={() => setSaveDialogKind(null)}
        />
      )}
      {saveDialogKind === 'questions' && (
        <SaveLogOptionsDialog
          title="Save question"
          onSaveComplete={() => {
            setSaveDialogKind(null)
            requestSaveQuestion()
          }}
          onSaveForLater={() => {
            setSaveDialogKind(null)
            saveDraftAndGoHome()
          }}
          onKeepEditing={() => setSaveDialogKind(null)}
        />
      )}

      {postSave && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(30,77,52,0.2)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 360, width: '100%', borderRadius: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 16, color: 'var(--mint-ink)' }}>Saved</div>
            <div style={{ display: 'grid', gap: 10 }}>
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
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {incompleteKind && (
        <AppConfirmDialog
          title="Are you sure?"
          message="Some fields were left unanswered. Save anyway?"
          confirmLabel="Save anyway"
          cancelLabel="Keep editing"
          onConfirm={() => {
            const k = incompleteKind
            setIncompleteKind(null)
            if (k === 'pain') void handleSavePain()
            else if (k === 'symptoms') void handleSaveSymptoms()
            else if (k === 'questions') void handleSaveQuestion()
          }}
          onCancel={() => setIncompleteKind(null)}
        />
      )}
      {error && (
        <div className="banner error" style={{ marginBottom: 16 }} onClick={() => setError(null)}>
          {error} ✕
        </div>
      )}

      {/* HUB — quick log menu (same flows as dashboard tiles) */}
      {screen === 'hub' && (
        <div>
          <BackButton fallbackTo="/app" />
          <div className="scrap-sticker-grid">
            <ScrapSticker to={logTabHref('pain')} title="Pain" sub="Log a pain entry" tone="pink" navState={{ backTo: '/app' }} />
            <ScrapSticker to={logTabHref('symptoms')} title="Episodes" sub="Log an episode" tone="mint" navState={{ backTo: '/app' }} />
            <ScrapSticker to={logTabHref('questions')} title="Questions" sub="Add for your doctor" tone="sky" navState={{ backTo: '/app' }} />
            <ScrapSticker to={visitLogHref()} title="Visit log" sub="Record a visit" tone="cream" navState={{ backTo: '/app' }} />
          </div>
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
                <button type="button" className="btn btn-primary" style={{ flex: '1 1 160px' }} onClick={() => setSaveDialogKind('pain')} disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
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
            {selectedSymptoms.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div className="muted" style={{ fontSize: '0.72rem', fontWeight: 600, marginBottom: 6 }}>
                  Selected — long-press a chip to remove
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {selectedSymptoms.map((sym) => (
                    <EpisodeFeatureChip
                      key={sym}
                      label={sym}
                      showRemove={symptomRemoveReveal === sym}
                      onReveal={() => setSymptomRemoveReveal(sym)}
                      onRemove={() => {
                        setSelectedSymptoms((prev) => prev.filter((s) => s !== sym))
                        setSymptomRemoveReveal(null)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            {pastSymptoms.filter((s) => !selectedSymptoms.includes(s)).length > 0 && (
              <div className="pill-grid" style={{ marginBottom: 10 }}>
                {pastSymptoms.filter((s) => !selectedSymptoms.includes(s)).map(sym => (
                  <button
                    key={sym}
                    type="button"
                    className="pill"
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
            <button type="button" className="btn btn-primary" style={{ flex: '1 1 180px' }} onClick={() => setSaveDialogKind('symptoms')} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
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
            onChange={(v) => setForm((f) => ({ ...f, doctor: v }))}
            specialty={form.doctor_specialty}
            onSpecialtyChange={(v) => setForm((f) => ({ ...f, doctor_specialty: v }))}
            showSpecialtyForNew
            doctorRequired
            label="Doctor"
            id="quicklog-q-doctor"
          />
          <div className="form-group">
            <label>Priority</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['High', 'Medium', 'Low'].map(p => (
                <button key={p} type="button"
                  className={`btn ${form.priority === p ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1, fontSize: '0.82rem' }}
                  onClick={() => setForm((f) => ({ ...f, priority: p }))}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Question</label>
            <textarea
              className="doctor-note-lined"
              placeholder="What do you want to ask?"
              value={form.question}
              onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
              rows={6}
            />
          </div>
          <div
            style={{
              marginBottom: 14,
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '10px 12px',
              background: 'var(--surface-alt, #f8fafc)',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 8 }}>
              Saved questions for this doctor
              {form.doctor.trim() && pickerDoctorQuestions.length > 0 ? ` (${pickerDoctorQuestions.length})` : ''}
            </div>
            {!form.doctor.trim() ? (
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0, lineHeight: 1.45 }}>
                Choose or type a doctor above to see questions you already saved for them.
              </p>
            ) : pickerDoctorQuestions.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.85rem', margin: 0, lineHeight: 1.45 }}>
                No saved questions for this doctor yet. Add one above first.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {pickerDoctorQuestions.map((q) => {
                  const unanswered = !q.answer?.trim() && (q.status === 'Unanswered' || !q.status)
                  return (
                    <div
                      key={q.id}
                      style={{
                        padding: '10px 12px',
                        background: 'var(--surface, #fff)',
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.88rem',
                          lineHeight: 1.45,
                          ...(unanswered && answerEditingId !== q.id
                            ? { cursor: 'pointer' as const }
                            : {}),
                        }}
                        onClick={() => {
                          if (unanswered && answerEditingId !== q.id) {
                            setAnswerEditingId(q.id)
                            setAnswerDraft('')
                          }
                        }}
                        onKeyDown={(e) => {
                          if (!unanswered || answerEditingId === q.id) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setAnswerEditingId(q.id)
                            setAnswerDraft('')
                          }
                        }}
                        role={unanswered && answerEditingId !== q.id ? 'button' : undefined}
                        tabIndex={unanswered && answerEditingId !== q.id ? 0 : undefined}
                      >
                        {q.question}
                      </div>
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                        {q.priority ?? '—'} · {unanswered ? 'Open' : 'Answered'}
                        {q.date_created ? ` · ${new Date(q.date_created).toLocaleDateString()}` : ''}
                      </div>
                      {!unanswered && q.answer?.trim() && (
                        <div style={{ fontSize: '0.84rem', marginTop: 8, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                          <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 600 }}>Answer: </span>
                          {q.answer}
                        </div>
                      )}
                      {unanswered && (
                        <div style={{ marginTop: 10 }}>
                          {answerEditingId === q.id ? (
                            <>
                              <textarea
                                className="doctor-note-lined"
                                placeholder="Your answer…"
                                value={answerDraft}
                                onChange={(e) => setAnswerDraft(e.target.value)}
                                rows={5}
                                disabled={answerSaving}
                              />
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  style={{ fontSize: '0.82rem' }}
                                  disabled={answerSaving}
                                  onClick={() => void saveInlineAnswer(q.id)}
                                >
                                  {answerSaving ? 'Saving…' : 'Save answer'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  style={{ fontSize: '0.82rem' }}
                                  disabled={answerSaving}
                                  onClick={() => {
                                    setAnswerEditingId(null)
                                    setAnswerDraft('')
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem', padding: '8px 12px' }} onClick={() => attemptLeave()}>Cancel</button>
            <button type="button" className="btn btn-primary" style={{ flex: '1 1 200px' }} onClick={() => setSaveDialogKind('questions')} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}