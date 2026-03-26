import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parsePainAreas, parseSideEffectTokens, splitTestsIntoItems } from '../lib/parse'

type Tab = 'pain' | 'mcas' | 'visits' | 'questions' | 'diagnosis' | 'meds' | 'reactions'

type PainRow = {
  id: string
  entry_date: string
  entry_time: string | null
  location: string | null
  intensity: number | null
  pain_type: string | null
  triggers: string | null
  relief_methods: string | null
  medications_taken: string | null
  notes: string | null
}

type McasRow = {
  id: string
  episode_date: string
  episode_time: string | null
  trigger: string
  symptoms: string
  severity: string | null
  relief: string | null
  medications_taken: string | null
  notes: string | null
}

type VisitRow = {
  id: string
  visit_date: string
  visit_time: string | null
  doctor: string | null
  specialty: string | null
  reason: string | null
  findings: string | null
  tests_ordered: string | null
  new_meds: string | null
  med_changes: string | null
  instructions: string | null
  follow_up: string | null
  notes: string | null
}

type QuestionRow = {
  id: string
  date_created: string
  appointment_date: string | null
  doctor: string | null
  question: string
  priority: string | null
  category: string | null
  answer: string | null
  status: string | null
}

type DiagnosisRow = {
  id: string
  note_date: string
  doctor: string | null
  diagnoses_mentioned: string | null
  diagnoses_ruled_out: string | null
  notes: string | null
}

type MedRow = {
  id: string
  medication: string
  dose: string | null
  frequency: string | null
  start_date: string | null
  purpose: string | null
  effectiveness: string | null
  side_effects: string | null
  notes: string | null
}

type ReactionRow = {
  id: string
  reaction_date: string
  reaction_time: string | null
  medication: string
  dose: string | null
  reaction: string
  severity: string | null
  effect_score: number | null
  notes: string | null
}

export function RecordsPage () {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('pain')
  const [q, setQ] = useState('')

  const [pain, setPain] = useState<PainRow[]>([])
  const [mcas, setMcas] = useState<McasRow[]>([])
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [diagnosis, setDiagnosis] = useState<DiagnosisRow[]>([])
  const [meds, setMeds] = useState<MedRow[]>([])
  const [reactions, setReactions] = useState<ReactionRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [uploadingVisitId, setUploadingVisitId] = useState<string | null>(null)
  const [docMap, setDocMap] = useState<Record<string, { name: string; signedUrl: string }[]>>({})

  useEffect(() => {
    if (!user) return
    setError(null)

    async function load () {
      const limit = 80
      const [p, mm, v, qq, d, m, r] = await Promise.all([
        supabase.from('pain_entries').select('*').eq('user_id', user!.id).order('entry_date', { ascending: false }).limit(limit),
        supabase.from('mcas_episodes').select('*').eq('user_id', user!.id).order('episode_date', { ascending: false }).limit(limit),
        supabase.from('doctor_visits').select('*').eq('user_id', user!.id).order('visit_date', { ascending: false }).limit(limit),
        supabase.from('doctor_questions').select('*').eq('user_id', user!.id).order('date_created', { ascending: false }).limit(limit),
        supabase.from('diagnosis_notes').select('*').eq('user_id', user!.id).order('note_date', { ascending: false }).limit(limit),
        supabase.from('current_medications').select('*').eq('user_id', user!.id).order('medication', { ascending: true }),
        supabase.from('med_reactions').select('*').eq('user_id', user!.id).order('reaction_date', { ascending: false }).limit(limit),
      ])

      if (p.error) setError(p.error.message)
      else setPain((p.data ?? []) as PainRow[])
      if (mm.error) setError(mm.error.message)
      else setMcas((mm.data ?? []) as McasRow[])
      if (v.error) setError(v.error.message)
      else setVisits((v.data ?? []) as VisitRow[])
      if (qq.error) setError(qq.error.message)
      else setQuestions((qq.data ?? []) as QuestionRow[])
      if (d.error) setError(d.error.message)
      else setDiagnosis((d.data ?? []) as DiagnosisRow[])
      if (m.error) setError(m.error.message)
      else setMeds((m.data ?? []) as MedRow[])
      if (r.error) setError(r.error.message)
      else setReactions((r.data ?? []) as ReactionRow[])
    }

    load().catch((e) => setError(String(e)))
  }, [user])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const hasTerm = term.length > 0
    if (!hasTerm) {
      return { pain, mcas, visits, questions, diagnosis, meds, reactions }
    }

    function f (s: string | null) {
      return (s ?? '').toLowerCase().includes(term)
    }

    return {
      pain: pain.filter((r) => f(r.location) || f(String(r.intensity ?? '')) || f(r.pain_type) || f(r.notes)),
      mcas: mcas.filter((r) => f(r.trigger) || f(r.symptoms) || f(r.notes)),
      visits: visits.filter((r) => f(r.doctor) || f(r.tests_ordered) || f(r.notes) || f(r.findings)),
      questions: questions.filter((r) => f(r.doctor) || f(r.question) || f(r.answer) || f(r.status)),
      diagnosis: diagnosis.filter((r) => f(r.doctor) || f(r.diagnoses_mentioned) || f(r.notes)),
      meds: meds.filter((r) => f(r.medication) || f(r.side_effects) || f(r.notes)),
      reactions: reactions.filter((r) => f(r.medication) || f(r.reaction) || f(r.notes)),
    }
  }, [q, pain, mcas, visits, questions, diagnosis, meds, reactions])

  async function loadDocsForVisit (visitId: string) {
    if (!user) return
    const folder = `${user.id}/${visitId}`
    const { data, error: listError } = await supabase.storage.from('visit-docs').list(folder, { limit: 50 })
    if (listError) return
    const files = data ?? []

    const signed = await Promise.all(files.map(async (f) => {
      const path = `${folder}/${f.name}`
      const { data: signedData } = await supabase.storage.from('visit-docs').createSignedUrl(path, 60 * 60)
      return { name: f.name, signedUrl: signedData?.signedUrl ?? '' }
    }))

    setDocMap((prev) => ({ ...prev, [visitId]: signed }))
  }

  async function uploadVisitDoc (visitId: string, file: File) {
    if (!user) return
    setUploadingVisitId(visitId)
    try {
      const folder = `${user.id}/${visitId}`
      const safeName = `${Date.now()}-${file.name}`.replace(/\s+/g, '-')
      const path = `${folder}/${safeName}`
      const { error: upError } = await supabase.storage.from('visit-docs').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })
      if (upError) throw upError
      await loadDocsForVisit(visitId)
    } catch (e: any) {
      setError(e?.message ?? String(e))
    } finally {
      setUploadingVisitId(null)
    }
  }

  if (!user) return null

  return (
    <div>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Records</h2>
        <p className="muted">Your past logs + doctor visit documents. Use search to quickly find something.</p>

        <div className="tabs">
          {([
            ['pain', 'Pain'],
            ['mcas', 'MCAS'],
            ['visits', 'Doctor visits'],
            ['questions', 'Questions'],
            ['diagnosis', 'Diagnosis'],
            ['reactions', 'Med reactions'],
            ['meds', 'Current meds'],
          ] as [Tab, string][]).map(([id, label]) => (
            <button key={id} type="button" className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="form-group" style={{ marginBottom: 6 }}>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try: knees, ultrasound, ibuprofen, brain fog…" />
        </div>
      </div>

      {tab === 'pain' && (
        <div className="card">
          <h3>Pain log</h3>
          {filtered.pain.length === 0 ? <p className="muted">No pain entries yet.</p> : null}
          <div style={{ marginTop: 10 }}>
            {filtered.pain.map((r) => (
              <div key={r.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{r.entry_date}{r.entry_time ? ` · ${r.entry_time}` : ''}</strong>
                  <span className="muted">Intensity: {r.intensity ?? '—'}</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Areas: {parsePainAreas(r.location ?? '').join(', ')}
                  {r.pain_type ? ` · ${r.pain_type}` : ''}
                </div>
                {r.triggers ? <div className="muted" style={{ marginTop: 6 }}>Triggers: {r.triggers}</div> : null}
                {r.notes ? <div className="muted" style={{ marginTop: 6 }}>Notes: {r.notes}</div> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'mcas' && (
        <div className="card">
          <h3>MCAS episodes</h3>
          {filtered.mcas.length === 0 ? <p className="muted">No MCAS episodes yet.</p> : null}
          <div style={{ marginTop: 10 }}>
            {filtered.mcas.map((r) => (
              <div key={r.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{r.episode_date}{r.episode_time ? ` · ${r.episode_time}` : ''}</strong>
                  <span className="muted">{r.severity ? `Severity: ${r.severity}` : ''}</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  Triggers: {r.trigger}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>Symptoms: {r.symptoms}</div>
                {r.relief ? <div className="muted" style={{ marginTop: 6 }}>Relief: {r.relief}</div> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'visits' && (
        <div className="card">
          <h3>Doctor visits</h3>
          {filtered.visits.length === 0 ? <p className="muted">No visits yet.</p> : null}

          <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
            {filtered.visits.map((v) => (
              <div key={v.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{v.visit_date}{v.visit_time ? ` · ${v.visit_time}` : ''}</strong>
                  <span className="muted">{v.doctor ? v.doctor : ''}</span>
                </div>

                {v.tests_ordered ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Tests / orders</div>
                    <div className="pill-grid">
                      {splitTestsIntoItems(v.tests_ordered).slice(0, 12).map((t) => (
                        <span key={t} className="pill" style={{ cursor: 'default' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="muted" style={{ marginTop: 10 }}>
                  {v.findings ? `Findings: ${v.findings}` : null}
                  {v.notes ? ` · Notes: ${v.notes}` : null}
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Uploads</div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      await uploadVisitDoc(v.id, file)
                      e.target.value = ''
                    }}
                    disabled={uploadingVisitId === v.id}
                  />

                  <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: 'fit-content' }}
                      onClick={() => loadDocsForVisit(v.id)}
                      disabled={uploadingVisitId === v.id}
                    >
                      {docMap[v.id] ? 'Refresh docs' : 'Load docs'}
                    </button>

                    {(docMap[v.id] ?? []).length === 0 ? (
                      <div className="muted" style={{ fontSize: '0.85rem' }}>No documents loaded yet.</div>
                    ) : (
                      (docMap[v.id] ?? []).map((d) => (
                        <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <span className="muted" style={{ fontSize: '0.9rem' }}>{d.name}</span>
                          {d.signedUrl ? (
                            <a className="btn btn-secondary" style={{ padding: '6px 10px' }} href={d.signedUrl} target="_blank" rel="noreferrer">
                              Download
                            </a>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'questions' && (
        <div className="card">
          <h3>Doctor questions</h3>
          {filtered.questions.length === 0 ? <p className="muted">No questions yet.</p> : null}
          <div style={{ marginTop: 10 }}>
            {filtered.questions.map((r) => (
              <div key={r.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{r.appointment_date ? `Appt: ${r.appointment_date}` : 'No appointment date'}</strong>
                  <span className="muted">{r.status ?? '—'}</span>
                </div>
                <div style={{ marginTop: 6 }}><strong>Q:</strong> <span className="muted">{r.question}</span></div>
                {r.answer ? <div className="muted" style={{ marginTop: 6 }}><strong>Answer:</strong> {r.answer}</div> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'diagnosis' && (
        <div className="card">
          <h3>Diagnosis notes</h3>
          {filtered.diagnosis.length === 0 ? <p className="muted">No diagnosis notes yet.</p> : null}
          <div style={{ marginTop: 10 }}>
            {filtered.diagnosis.map((r) => (
              <div key={r.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{r.note_date}</strong>
                  <span className="muted">{r.doctor ?? ''}</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>Mentioned: {r.diagnoses_mentioned ?? '—'}</div>
                <div className="muted" style={{ marginTop: 6 }}>Ruled out: {r.diagnoses_ruled_out ?? '—'}</div>
                {r.notes ? <div className="muted" style={{ marginTop: 6 }}>Notes: {r.notes}</div> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'reactions' && (
        <div className="card">
          <h3>Medication reactions</h3>
          {filtered.reactions.length === 0 ? <p className="muted">No medication reactions yet.</p> : null}
          <div style={{ marginTop: 10 }}>
            {filtered.reactions.map((r) => (
              <div key={r.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{r.reaction_date}{r.reaction_time ? ` · ${r.reaction_time}` : ''}</strong>
                  <span className="muted">{r.medication}</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {r.dose ? `Dose: ${r.dose} · ` : ''}{r.severity ? `Severity: ${r.severity} · ` : ''}{r.effect_score !== null ? `Effect score: ${r.effect_score}/10` : ''}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>Reaction: {r.reaction}</div>
                {r.notes ? <div className="muted" style={{ marginTop: 6 }}>Notes: {r.notes}</div> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'meds' && (
        <div className="card">
          <h3>Current medications</h3>
          {filtered.meds.length === 0 ? <p className="muted">No meds yet.</p> : null}
          <div style={{ marginTop: 10, display: 'grid', gap: 12 }}>
            {filtered.meds.map((m) => (
              <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 14, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <strong>{m.medication}</strong>
                  <span className="muted">{m.start_date ? `Start: ${m.start_date}` : ''}</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {[m.dose, m.frequency].filter(Boolean).join(' · ') || '—'}
                  {m.purpose ? ` · Purpose: ${m.purpose}` : ''}
                </div>
                {m.effectiveness ? <div className="muted" style={{ marginTop: 6 }}>Effectiveness: {m.effectiveness}</div> : null}
                {m.side_effects ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Side effects</div>
                    <div className="pill-grid">
                      {parseSideEffectTokens(m.side_effects).slice(0, 12).map((t) => (
                        <span key={t} className="pill" style={{ cursor: 'default' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}