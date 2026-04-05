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


type Doctor = { id: string; name: string; specialty: string | null }


function todayISO () { return new Date().toISOString().slice(0, 10) }


export function QuestionsArchivePage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [viewMode, setViewMode] = useState<'all' | 'unanswered' | 'answered'>('all')
  const [showForm, setShowForm] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({})

  const [selectedDoctor, setSelectedDoctor] = useState('')
  const [customDoctorName, setCustomDoctorName] = useState('')

  const [form, setForm] = useState({
    date_created: todayISO(),
    appointment_date: '',
    question: '',
    priority: 'Medium',
  })


  useEffect(() => {
    if (!user) return
    loadQuestions()
    supabase.from('doctors').select('id, name, specialty')
      .eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors((data ?? []) as Doctor[]))
  }, [user])


  async function loadQuestions () {
    const { data, error: e } = await supabase.from('doctor_questions')
      .select('*')
      .eq('user_id', user!.id)
      .order('date_created', { ascending: false })
    if (e) setError(e.message)
    else setQuestions((data ?? []) as QuestionRow[])
  }


  const effectiveDoctor = selectedDoctor === '__new__'
    ? customDoctorName.trim()
    : selectedDoctor


  async function saveNewQuestions () {
    if (!form.question.trim()) {
      setError('Enter a question.')
      return
    }
    setBusy(true)
    const { error: e } = await supabase.from('doctor_questions').insert({
      user_id: user!.id,
      date_created: form.date_created,
      appointment_date: form.appointment_date || null,
      doctor: effectiveDoctor || null,
      question: form.question.trim(),
      priority: form.priority,
      status: 'Unanswered',
      answer: null,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    setBanner('Question saved.')
    setShowForm(false)
    setForm({ date_created: todayISO(), appointment_date: '', question: '', priority: 'Medium' })
    setSelectedDoctor('')
    setCustomDoctorName('')
    setTimeout(() => setBanner(null), 4000)
    loadQuestions()
  }


  async function saveAnswer (id: string) {
    const answer = answerDraft[id] ?? ''
    if (!answer.trim()) return
    const { error: e } = await supabase.from('doctor_questions')
      .update({ answer: answer.trim(), status: 'Answered' })
      .eq('id', id)
      .eq('user_id', user!.id)
    if (e) { setError(e.message); return }
    setQuestions((prev) => prev.map((q) => q.id === id
      ? { ...q, answer: answer.trim(), status: 'Answered' }
      : q))
    setAnswerDraft((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }


  const filtered = questions.filter((q) => {
    const unanswered = !q.answer?.trim() && (q.status === 'Unanswered' || !q.status)
    if (viewMode === 'unanswered') return unanswered
    if (viewMode === 'answered') return !!q.answer?.trim() || q.status === 'Answered'
    return true
  })


  if (!user) return null


  return (
    <div style={{ paddingBottom: 40 }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}

      {/* ADD QUESTION FORM — visible at top by default */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showForm ? 16 : 0 }}>
          <h2 style={{ margin: 0 }}>❓ Add Question</h2>
          <button type="button" className="btn btn-ghost"
            style={{ fontSize: '0.82rem' }}
            onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Hide ▲' : 'Show ▼'}
          </button>
        </div>

      {showForm && (
        <>
          <h3 style={{ marginTop: 0, display: 'none' }}>Add question</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Date logged</label>
              <input type="date" value={form.date_created}
                onChange={(e) => setForm({ ...form, date_created: e.target.value })} />
            </div>
            <div className="form-group">
              <label>For appointment (optional)</label>
              <input type="date" value={form.appointment_date}
                onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} />
            </div>
          </div>
          <div className="form-group">
            <label>Doctor (optional)</label>
            <select value={selectedDoctor} onChange={(e) => {
              setSelectedDoctor(e.target.value)
              if (e.target.value !== '__new__') setCustomDoctorName('')
            }}>
              <option value="">— Any / not set —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
              <option value="__new__">+ Other…</option>
            </select>
            {selectedDoctor === '__new__' && (
              <input
                style={{ marginTop: 8 }}
                placeholder="Doctor name"
                value={customDoctorName}
                onChange={(e) => setCustomDoctorName(e.target.value)}
              />
            )}
          </div>
          <div className="form-group">
            <label>Priority</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="High">🔴 High</option>
              <option value="Medium">🟡 Medium</option>
              <option value="Low">🟢 Low</option>
            </select>
          </div>
          <div className="form-group">
            <label>Question</label>
            <textarea value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              rows={4}
              placeholder="What do you want to ask?" />
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveNewQuestions} disabled={busy}>
            Save question
          </button>
        </>
      )}
      </div>

      {/* ARCHIVE — filter tabs + list */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <h3 style={{ margin: '0 0 10px' }}>❓ All Questions</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button"
            className={`btn ${viewMode === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('all')}>All</button>
          <button type="button"
            className={`btn ${viewMode === 'unanswered' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('unanswered')}>Open</button>
          <button type="button"
            className={`btn ${viewMode === 'answered' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setViewMode('answered')}>Answered</button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="card">
          <p className="muted">
            {viewMode === 'unanswered' ? 'No unanswered questions.'
              : viewMode === 'answered' ? 'No answered questions yet.'
                : 'No questions logged yet.'}
          </p>
        </div>
      )}

      {filtered.map((q) => {
        const isOpen = expandedId === q.id
        const open = !q.answer?.trim() && (q.status === 'Unanswered' || !q.status)
        return (
          <div key={q.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
              onClick={() => setExpandedId(isOpen ? null : q.id)}>
              <div>
                <div style={{ fontWeight: 700 }}>{q.question}</div>
                <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                  {q.date_created}
                  {q.doctor ? ` · ${q.doctor}` : ''}
                  {q.priority ? ` · ${q.priority}` : ''}
                </div>
                {q.appointment_date && (
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>Appt: {q.appointment_date}</div>
                )}
                <span style={{
                  fontSize: '0.75rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, marginTop: 6, display: 'inline-block',
                  ...(open
                    ? { background: '#fef3c7', color: '#92400e' }
                    : { background: '#d1fae5', color: '#065f46' }),
                }}>{open ? 'Open' : 'Answered'}</span>
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 10 }}>
                {q.answer && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Answer</div>
                    <div className="muted" style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{q.answer}</div>
                  </div>
                )}
                {open && (
                  <div>
                    <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Your answer</label>
                    <textarea
                      placeholder="Write answer…"
                      value={answerDraft[q.id] ?? ''}
                      onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                      style={{ width: '100%', minHeight: 80 }}
                    />
                    <button type="button" className="btn btn-secondary" style={{ marginTop: 8 }}
                      onClick={() => saveAnswer(q.id)}>Save answer</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
