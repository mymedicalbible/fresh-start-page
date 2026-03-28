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

export function QuestionsArchivePage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [openDoctors, setOpenDoctors] = useState<Record<string, boolean>>({})
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    load()
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
    const { error: e } = await supabase.from('doctor_questions')
      .update({ answer, status: 'Answered' }).eq('id', q.id)
    if (e) { setError(e.message); return }
    setQuestions((prev) => prev.map((x) => x.id === q.id ? { ...x, answer, status: 'Answered' } : x))
  }

  // Group by doctor
  const grouped = questions.reduce<Record<string, QuestionRow[]>>((acc, q) => {
    const key = q.doctor ?? 'No doctor assigned'
    if (!acc[key]) acc[key] = []
    acc[key].push(q)
    return acc
  }, {})

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>

      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <h2 style={{ margin: 0 }}>❓ Questions archive</h2>
        <p className="muted" style={{ marginTop: 6 }}>All questions organized by doctor. Tap a doctor to expand.</p>
      </div>

      {Object.keys(grouped).length === 0 && (
        <div className="card"><p className="muted">No questions logged yet.</p></div>
      )}

      {Object.entries(grouped).map(([doctor, qs]) => {
        const isOpen = openDoctors[doctor] ?? false
        const unanswered = qs.filter((q) => !q.answer).length

        return (
          <div key={doctor} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setOpenDoctors((prev) => ({ ...prev, [doctor]: !isOpen }))}>
              <div>
                <div style={{ fontWeight: 700 }}>👩‍⚕️ {doctor}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {qs.length} question{qs.length !== 1 ? 's' : ''}{unanswered > 0 ? ` · ${unanswered} unanswered` : ' · all answered'}
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
                        <div className="muted" style={{ fontSize: '0.85rem', marginTop: 6 }}>
                          <strong>Answer:</strong> {q.answer}
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