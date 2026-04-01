import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type QuestionRow = {
  id: string
  date_created: string
  appointment_date: string | null
  doctor: string | null
  question: string
  priority: string | null
  answer: string | null
  status: string | null
}

type Doctor = { id: string; name: string }
type ViewMode = 'unanswered' | 'answered' | 'all'

function todayISO () { return new Date().toISOString().slice(0, 10) }

export function QuestionsArchivePage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('unanswered')
  const [openDoctors, setOpenDoctors] = useState<Record<string, boolean>>({})
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Add question form
  const [showAddForm, setShowAddForm] = useState(false)
  const [qDoctor, setQDoctor] = useState('')
  const [qApptDate, setQApptDate] = useState('')
  const [newQuestions, setNewQuestions] = useState([{ text: '', priority: 'Medium' as 'High' | 'Medium' | 'Low' }])

  useEffect(() => {
    if (!user) return
    load()
    supabase.from('doctors').select('id, name').eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors((data ?? []) as Doctor[]))
  }, [user])

  async function load () {
    const { data, error: e } = await supabase
      .from('doctor_questions').select('*')
      .eq('user_id', user!.id)
      .order('date_created', { ascending: false })
    if (e) setError(e.message)
    else setQuestions((data ?? []) as QuestionRow[])
  }

  async function saveAnswer (q: QuestionRow) {
    const answer = answerDraft[q.id] ?? ''
    if (!answer.trim()) return
    const { error: e } = await supabase.from('doctor_questions')
      .update({ answer, status: 'Answered' }).eq('id', q.id)
    if (e) { setError(e.message); return }
    setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, answer, status: 'Answered' } : x))
    setBanner('Answer saved!')
    setTimeout(() => setBanner(null), 3000)
  }

  function addNewQuestion () {
    setNewQuestions((prev) => [...prev, { text: '', priority: 'Medium' }])
  }

  function removeNewQuestion (i: number) {
    setNewQuestions((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateNewQuestion (i: number, field: 'text' | 'priority', value: string) {
    setNewQuestions((prev) => prev.map((q, idx) => idx === i ? { ...q, [field]: value } : q))
  }

  function moveNewQuestion (i: number, dir: -1 | 1) {
    setNewQuestions((prev) => {
      const next = [...prev]
      const swap = i + dir
      if (swap < 0 || swap >= next.length) return prev;
      [next[i], next[swap]] = [next[swap], next[i]]
      return next
    })
  }

  async function saveNewQuestions () {
    const valid = newQuestions.filter((q) => q.text.trim().length > 0)
    if (valid.length === 0) { setError('Enter at least one question.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('doctor_questions').insert(
      valid.map((q) => ({
        user_id: user!.id, date_created: todayISO(),
        appointment_date: qApptDate || null,
        doctor: qDoctor || null,
        question: q.text.trim(), priority: q.priority,
        category: null, answer: null, status: 'Unanswered',
      }))
    )
    setBusy(false)
    if (e) { setError(e.message); return }
    setBanner(`${valid.length} question(s) saved!`)
    setShowAddForm(false)
    setNewQuestions([{ text: '', priority: 'Medium' }])
    setQDoctor('')
    setQApptDate('')
    setTimeout(() => setBanner(null), 3000)
    load()
  }

  const filtered = questions.filter((q) => {
    if (viewMode === 'answered') return !!q.answer
    if (viewMode === 'unanswered') return !q.answer
    return true
  })

  const grouped = filtered.reduce<Record<string, QuestionRow[]>>((acc, q) => {
    const key = q.doctor ?? 'No doctor assigned'
    if (!acc[key]) acc[key] = []
    acc[key].push(q)
    return acc
  }, {})

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>❓ Questions</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Cancel' : '+ Add question'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['unanswered', 'answered', 'all'] as ViewMode[]).map((mode) => (
            <button key={mode} type="button"
              className={`btn ${viewMode === mode ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem' }}
              onClick={() => setViewMode(mode)}>
              {mode === 'unanswered' ? 'Unanswered' : mode === 'answered' ? 'Answered' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* ADD QUESTION FORM */}
      {showAddForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add questions</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Doctor</label>
              <select value={qDoctor} onChange={(e) => setQDoctor(e.target.value)}>
                <option value="">— Select doctor —</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Appointment date</label>
              <input type="date" value={qApptDate} onChange={(e) => setQApptDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
            {newQuestions.map((q, i) => (
              <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: '#fafafa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Question {i + 1}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => moveNewQuestion(i, -1)} disabled={i === 0}>↑</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px' }} onClick={() => moveNewQuestion(i, 1)} disabled={i === newQuestions.length - 1}>↓</button>
                    {newQuestions.length > 1 && (
                      <button type="button" className="btn btn-ghost" style={{ padding: '2px 8px', color: 'red' }} onClick={() => removeNewQuestion(i)}>✕</button>
                    )}
                  </div>
                </div>
                <textarea value={q.text} onChange={(e) => updateNewQuestion(i, 'text', e.target.value)} placeholder="Type your question…" style={{ marginBottom: 8 }} />
                <select value={q.priority} onChange={(e) => updateNewQuestion(i, 'priority', e.target.value)}>
                  <option value="High">🔴 High</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: 12 }} onClick={addNewQuestion}>+ Add another question</button>
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={saveNewQuestions} disabled={busy}>
            Save {newQuestions.filter((q) => q.text.trim()).length} question(s)
          </button>
        </div>
      )}

      {Object.keys(grouped).length === 0 && (
        <div className="card">
          <p className="muted">
            {viewMode === 'unanswered' ? 'No unanswered questions.' : viewMode === 'answered' ? 'No answered questions yet.' : 'No questions logged yet.'}
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([doctor, qs]) => {
        const isOpen = openDoctors[doctor] ?? true
        const answeredCount = qs.filter((q) => q.answer).length

        return (
          <div key={doctor} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setOpenDoctors((prev) => ({ ...prev, [doctor]: !isOpen }))}>
              <div>
                <div style={{ fontWeight: 700 }}>👩‍⚕️ {doctor}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {qs.length} question{qs.length !== 1 ? 's' : ''} · {answeredCount} answered
                </div>
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 10 }}>
                {qs.map((q) => (
                  <div key={q.id} className="list-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.9rem' }}>{q.question}</strong>
                      <span className="muted" style={{ fontSize: '0.8rem' }}>
                        {q.priority ?? ''}{q.appointment_date ? ` · Appt: ${q.appointment_date}` : ''}
                      </span>
                    </div>
                    {q.answer
                      ? (
                        <div style={{ marginTop: 6, padding: '8px 12px', background: '#f0fdf4', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a', marginBottom: 2 }}>ANSWER</div>
                          <div style={{ fontSize: '0.9rem' }}>{q.answer}</div>
                        </div>
                      )
                      : (
                        <div style={{ marginTop: 8 }}>
                          <textarea
                            placeholder="Write answer here…"
                            value={answerDraft[q.id] ?? ''}
                            onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            style={{ marginBottom: 6 }}
                          />
                          <button type="button" className="btn btn-secondary"
                            style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                            onClick={() => saveAnswer(q)}>
                            Save answer
                          </button>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}