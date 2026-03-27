import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Doctor = {
  id: string
  name: string
  specialty: string | null
  clinic: string | null
  phone: string | null
  address: string | null
  notes: string | null
}

type VisitRow = {
  id: string
  visit_date: string
  reason: string | null
  findings: string | null
  tests_ordered: string | null
  notes: string | null
}

type QuestionRow = {
  id: string
  date_created: string
  appointment_date: string | null
  question: string
  priority: string | null
  answer: string | null
  status: string | null
}

type DiagnosisRow = {
  id: string
  note_date: string
  diagnoses_mentioned: string | null
  diagnoses_ruled_out: string | null
  notes: string | null
}

type MedRow = {
  id: string
  medication: string
  dose: string | null
  frequency: string | null
  purpose: string | null
}

function emptyForm () {
  return { name: '', specialty: '', clinic: '', phone: '', address: '', notes: '' }
}

export function DoctorsPage () {
  const { user } = useAuth()
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // which doctor's tree is expanded
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // which sections inside a doctor tree are open
  const [openSections, setOpenSections] = useState<Record<string, Record<string, boolean>>>({})

  // per-doctor loaded data
  const [visitMap, setVisitMap] = useState<Record<string, VisitRow[]>>({})
  const [questionMap, setQuestionMap] = useState<Record<string, QuestionRow[]>>({})
  const [diagnosisMap, setDiagnosisMap] = useState<Record<string, DiagnosisRow[]>>({})
  const [medMap, setMedMap] = useState<Record<string, MedRow[]>>({})

  // answer editing
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({})

  // add/edit form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  useEffect(() => {
    if (!user) return
    loadDoctors()
  }, [user])

  async function loadDoctors () {
    const { data, error: e } = await supabase
      .from('doctors')
      .select('*')
      .eq('user_id', user!.id)
      .order('name', { ascending: true })
    if (e) setError(e.message)
    else setDoctors((data ?? []) as Doctor[])
  }

  async function saveDoctor () {
    if (!form.name.trim()) { setError('Doctor name is required.'); return }
    setBusy(true)
    if (editingId) {
      const { error: e } = await supabase.from('doctors').update({
        name: form.name.trim(),
        specialty: form.specialty || null,
        clinic: form.clinic || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
      }).eq('id', editingId)
      if (e) setError(e.message)
    } else {
      const { error: e } = await supabase.from('doctors').insert({
        user_id: user!.id,
        name: form.name.trim(),
        specialty: form.specialty || null,
        clinic: form.clinic || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
      })
      if (e) setError(e.message)
    }
    setBusy(false)
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
    loadDoctors()
  }

  async function deleteDoctor (id: string) {
    if (!confirm('Remove this doctor and all linked data from your list?')) return
    await supabase.from('doctors').delete().eq('id', id)
    setDoctors((prev) => prev.filter((d) => d.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function startEdit (doc: Doctor) {
    setEditingId(doc.id)
    setForm({
      name: doc.name,
      specialty: doc.specialty ?? '',
      clinic: doc.clinic ?? '',
      phone: doc.phone ?? '',
      address: doc.address ?? '',
      notes: doc.notes ?? '',
    })
    setShowForm(true)
  }

  function toggleSection (docId: string, section: string) {
    setOpenSections((prev) => ({
      ...prev,
      [docId]: { ...(prev[docId] ?? {}), [section]: !(prev[docId]?.[section]) },
    }))
  }

  async function loadDoctorTree (docId: string, doctorName: string) {
    if (!user) return
    const name = doctorName

    const [v, q, d, m] = await Promise.all([
      supabase.from('doctor_visits').select('id, visit_date, reason, findings, tests_ordered, notes')
        .eq('user_id', user!.id).ilike('doctor', `%${name}%`).order('visit_date', { ascending: false }).limit(30),
      supabase.from('doctor_questions').select('id, date_created, appointment_date, question, priority, answer, status')
        .eq('user_id', user!.id).ilike('doctor', `%${name}%`).order('date_created', { ascending: false }).limit(50),
      supabase.from('diagnosis_notes').select('id, note_date, diagnoses_mentioned, diagnoses_ruled_out, notes')
        .eq('user_id', user!.id).ilike('doctor', `%${name}%`).order('note_date', { ascending: false }).limit(30),
      supabase.from('current_medications').select('id, medication, dose, frequency, purpose')
        .eq('user_id', user!.id).ilike('notes', `%${name}%`).limit(20),
    ])

    setVisitMap((prev) => ({ ...prev, [docId]: (v.data ?? []) as VisitRow[] }))
    setQuestionMap((prev) => ({ ...prev, [docId]: (q.data ?? []) as QuestionRow[] }))
    setDiagnosisMap((prev) => ({ ...prev, [docId]: (d.data ?? []) as DiagnosisRow[] }))
    setMedMap((prev) => ({ ...prev, [docId]: (m.data ?? []) as MedRow[] }))
  }

  async function toggleDoctor (doc: Doctor) {
    if (expandedId === doc.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(doc.id)
    await loadDoctorTree(doc.id, doc.name)
  }

  async function saveAnswer (questionId: string) {
    const answer = answerDraft[questionId] ?? ''
    const { error: e } = await supabase.from('doctor_questions')
      .update({ answer, status: 'Answered' })
      .eq('id', questionId)
    if (e) { setError(e.message); return }
    setQuestionMap((prev) => {
      const updated = Object.fromEntries(
        Object.entries(prev).map(([docId, qs]) => [
          docId,
          qs.map((q) => q.id === questionId ? { ...q, answer, status: 'Answered' } : q),
        ])
      )
      return updated
    })
  }

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>My Doctors</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}
          >
            + Add doctor
          </button>
        </div>
        <p className="muted">Tap a doctor to see their full history — visits, questions, diagnoses, and medications.</p>
      </div>

      {/* ADD / EDIT FORM */}
      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit doctor' : 'Add doctor'}</h3>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Smith" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Specialty</label>
              <input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Rheumatology" />
            </div>
            <div className="form-group">
              <label>Clinic / Hospital</label>
              <input value={form.clinic} onChange={(e) => setForm({ ...form, clinic: e.target.value })} placeholder="UCLA Medical" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 000-0000" />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this doctor…" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={saveDoctor} disabled={busy}>Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {doctors.length === 0 && !showForm && (
        <div className="card"><p className="muted">No doctors added yet. Tap "+ Add doctor" to get started.</p></div>
      )}

      {/* DOCTOR LIST */}
      {doctors.map((doc) => {
        const isOpen = expandedId === doc.id
        const sections = openSections[doc.id] ?? {}
        const visits = visitMap[doc.id] ?? []
        const questions = questionMap[doc.id] ?? []
        const diagnoses = diagnosisMap[doc.id] ?? []
        const meds = medMap[doc.id] ?? []

        return (
          <div key={doc.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>

            {/* DOCTOR HEADER */}
            <div
              style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => toggleDoctor(doc)}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>👩‍⚕️ {doc.name}</div>
                {doc.specialty && <div className="muted" style={{ fontSize: '0.85rem', marginTop: 2 }}>{doc.specialty}{doc.clinic ? ` · ${doc.clinic}` : ''}</div>}
                {doc.phone && <div className="muted" style={{ fontSize: '0.85rem' }}>📞 {doc.phone}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                  onClick={(e) => { e.stopPropagation(); startEdit(doc) }}>Edit</button>
                <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '0.8rem', color: 'red' }}
                  onClick={(e) => { e.stopPropagation(); deleteDoctor(doc.id) }}>Remove</button>
                <span style={{ fontSize: '1.2rem' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* DOCTOR TREE */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>

                {/* VISITS */}
                <div>
                  <button type="button" className="btn btn-ghost" style={{ width: '100%', textAlign: 'left', fontWeight: 600, padding: '8px 0' }}
                    onClick={() => toggleSection(doc.id, 'visits')}>
                    🏥 Visits ({visits.length}) {sections.visits ? '▲' : '▼'}
                  </button>
                  {sections.visits && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {visits.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No visits logged for this doctor yet.</p>}
                      {visits.map((v) => (
                        <div key={v.id} className="list-item">
                          <strong>{v.visit_date}</strong>
                          {v.reason && <div className="muted" style={{ fontSize: '0.85rem' }}>Reason: {v.reason}</div>}
                          {v.findings && <div className="muted" style={{ fontSize: '0.85rem' }}>Findings: {v.findings}</div>}
                          {v.tests_ordered && <div className="muted" style={{ fontSize: '0.85rem' }}>Tests: {v.tests_ordered}</div>}
                          {v.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>Notes: {v.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* QUESTIONS */}
                <div>
                  <button type="button" className="btn btn-ghost" style={{ width: '100%', textAlign: 'left', fontWeight: 600, padding: '8px 0' }}
                    onClick={() => toggleSection(doc.id, 'questions')}>
                    ❓ Questions ({questions.length}) {sections.questions ? '▲' : '▼'}
                  </button>
                  {sections.questions && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {questions.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No questions logged for this doctor yet.</p>}
                      {questions.map((q) => (
                        <div key={q.id} className="list-item">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.9rem' }}>{q.question}</strong>
                            <span className="muted" style={{ fontSize: '0.8rem' }}>{q.priority ?? ''} · {q.status ?? ''}</span>
                          </div>
                          {q.answer && (
                            <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                              <strong>Answer:</strong> {q.answer}
                            </div>
                          )}
                          {!q.answer && (
                            <div style={{ marginTop: 8 }}>
                              <textarea
                                placeholder="Write answer here…"
                                value={answerDraft[q.id] ?? ''}
                                onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                style={{ marginBottom: 6 }}
                              />
                              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                                onClick={() => saveAnswer(q.id)}>
                                Save answer
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* DIAGNOSES */}
                <div>
                  <button type="button" className="btn btn-ghost" style={{ width: '100%', textAlign: 'left', fontWeight: 600, padding: '8px 0' }}
                    onClick={() => toggleSection(doc.id, 'diagnoses')}>
                    📋 Diagnoses ({diagnoses.length}) {sections.diagnoses ? '▲' : '▼'}
                  </button>
                  {sections.diagnoses && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {diagnoses.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No diagnosis notes for this doctor yet.</p>}
                      {diagnoses.map((d) => (
                        <div key={d.id} className="list-item">
                          <strong>{d.note_date}</strong>
                          {d.diagnoses_mentioned && <div className="muted" style={{ fontSize: '0.85rem' }}>Mentioned: {d.diagnoses_mentioned}</div>}
                          {d.diagnoses_ruled_out && <div className="muted" style={{ fontSize: '0.85rem' }}>Ruled out: {d.diagnoses_ruled_out}</div>}
                          {d.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>Notes: {d.notes}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* MEDICATIONS */}
                <div>
                  <button type="button" className="btn btn-ghost" style={{ width: '100%', textAlign: 'left', fontWeight: 600, padding: '8px 0' }}
                    onClick={() => toggleSection(doc.id, 'meds')}>
                    💊 Medications ({meds.length}) {sections.meds ? '▲' : '▼'}
                  </button>
                  {sections.meds && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {meds.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No medications linked to this doctor yet. When logging a medication, include this doctor's name in the "Prescribed by" field.</p>}
                      {meds.map((m) => (
                        <div key={m.id} className="list-item">
                          <strong>{m.medication}</strong>
                          <div className="muted" style={{ fontSize: '0.85rem' }}>
                            {[m.dose, m.frequency].filter(Boolean).join(' · ')}
                            {m.purpose ? ` · ${m.purpose}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}