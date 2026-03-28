import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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

function todayISO () { return new Date().toISOString().slice(0, 10) }

export function DoctorsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const prefillName = searchParams.get('prefill') ?? ''
  const [form, setForm] = useState({ ...emptyForm(), name: prefillName })
  const [showForm, setShowForm] = useState(!!prefillName)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [openSections, setOpenSections] = useState<Record<string, Record<string, boolean>>>({})

  const [visitMap, setVisitMap] = useState<Record<string, VisitRow[]>>({})
  const [questionMap, setQuestionMap] = useState<Record<string, QuestionRow[]>>({})
  const [diagnosisMap, setDiagnosisMap] = useState<Record<string, DiagnosisRow[]>>({})
  const [medMap, setMedMap] = useState<Record<string, MedRow[]>>({})
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({})

  // Inline log forms per doctor
  const [inlineVisit, setInlineVisit] = useState<Record<string, boolean>>({})
  const [inlineQuestion, setInlineQuestion] = useState<Record<string, boolean>>({})
  const [inlineDiagnosis, setInlineDiagnosis] = useState<Record<string, boolean>>({})
  const [inlineMed, setInlineMed] = useState<Record<string, boolean>>({})

  const [visitForm, setVisitForm] = useState<Record<string, any>>({})
  const [questionForms, setQuestionForms] = useState<Record<string, { text: string; priority: string }[]>>({})
  const [diagnosisForm, setDiagnosisForm] = useState<Record<string, any>>({})
  const [medForm, setMedForm] = useState<Record<string, any>>({})

  useEffect(() => {
    if (!user) return
    loadDoctors()
  }, [user])

  async function loadDoctors () {
    const { data, error: e } = await supabase
      .from('doctors').select('*')
      .eq('user_id', user!.id).order('name', { ascending: true })
    if (e) setError(e.message)
    else setDoctors((data ?? []) as Doctor[])
  }

  async function saveDoctor () {
    if (!form.name.trim()) { setError('Doctor name is required.'); return }
    setBusy(true)
    if (editingId) {
      const { error: e } = await supabase.from('doctors').update({
        name: form.name.trim(), specialty: form.specialty || null,
        clinic: form.clinic || null, phone: form.phone || null,
        address: form.address || null, notes: form.notes || null,
      }).eq('id', editingId)
      if (e) setError(e.message)
    } else {
      const { error: e } = await supabase.from('doctors').insert({
        user_id: user!.id, name: form.name.trim(),
        specialty: form.specialty || null, clinic: form.clinic || null,
        phone: form.phone || null, address: form.address || null,
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
    if (!confirm('Remove this doctor from your list?')) return
    await supabase.from('doctors').delete().eq('id', id)
    setDoctors((prev) => prev.filter((d) => d.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function startEdit (doc: Doctor) {
    setEditingId(doc.id)
    setForm({
      name: doc.name, specialty: doc.specialty ?? '',
      clinic: doc.clinic ?? '', phone: doc.phone ?? '',
      address: doc.address ?? '', notes: doc.notes ?? '',
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
    const [v, q, d, m] = await Promise.all([
      supabase.from('doctor_visits').select('id, visit_date, reason, findings, tests_ordered, notes')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`)
        .order('visit_date', { ascending: false }).limit(30),
      supabase.from('doctor_questions').select('id, date_created, appointment_date, question, priority, answer, status')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`)
        .order('date_created', { ascending: false }).limit(50),
      supabase.from('diagnosis_notes').select('id, note_date, diagnoses_mentioned, diagnoses_ruled_out, notes')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`)
        .order('note_date', { ascending: false }).limit(30),
      supabase.from('current_medications').select('id, medication, dose, frequency, purpose')
        .eq('user_id', user!.id).ilike('notes', `%${doctorName}%`).limit(20),
    ])
    setVisitMap((prev) => ({ ...prev, [docId]: (v.data ?? []) as VisitRow[] }))
    setQuestionMap((prev) => ({ ...prev, [docId]: (q.data ?? []) as QuestionRow[] }))
    setDiagnosisMap((prev) => ({ ...prev, [docId]: (d.data ?? []) as DiagnosisRow[] }))
    setMedMap((prev) => ({ ...prev, [docId]: (m.data ?? []) as MedRow[] }))
  }

  async function toggleDoctor (doc: Doctor) {
    if (expandedId === doc.id) { setExpandedId(null); return }
    setExpandedId(doc.id)
    await loadDoctorTree(doc.id, doc.name)
  }

  async function saveAnswer (questionId: string) {
    const answer = answerDraft[questionId] ?? ''
    const { error: e } = await supabase.from('doctor_questions')
      .update({ answer, status: 'Answered' }).eq('id', questionId)
    if (e) { setError(e.message); return }
    setQuestionMap((prev) => Object.fromEntries(
      Object.entries(prev).map(([docId, qs]) => [
        docId, qs.map((q) => q.id === questionId ? { ...q, answer, status: 'Answered' } : q),
      ])
    ))
  }

  // Inline save functions
  async function saveInlineVisit (doc: Doctor) {
    const vf = visitForm[doc.id] ?? {}
    if (!vf.visit_date) { setError('Date is required.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('doctor_visits').insert({
      user_id: user!.id, visit_date: vf.visit_date,
      visit_time: vf.visit_time || null, doctor: doc.name,
      specialty: doc.specialty || null, reason: vf.reason || null,
      findings: vf.findings || null, tests_ordered: vf.tests_ordered || null,
      new_meds: vf.new_meds || null, instructions: vf.instructions || null,
      follow_up: vf.follow_up || null, notes: vf.notes || null,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    setInlineVisit((prev) => ({ ...prev, [doc.id]: false }))
    setVisitForm((prev) => ({ ...prev, [doc.id]: {} }))
    await loadDoctorTree(doc.id, doc.name)
  }

  async function saveInlineQuestions (doc: Doctor) {
    const qs = (questionForms[doc.id] ?? []).filter((q) => q.text.trim())
    if (qs.length === 0) { setError('Enter at least one question.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('doctor_questions').insert(
      qs.map((q) => ({
        user_id: user!.id, date_created: todayISO(),
        doctor: doc.name, question: q.text.trim(),
        priority: q.priority, status: 'Unanswered', answer: null,
      }))
    )
    setBusy(false)
    if (e) { setError(e.message); return }
    setInlineQuestion((prev) => ({ ...prev, [doc.id]: false }))
    setQuestionForms((prev) => ({ ...prev, [doc.id]: [] }))
    await loadDoctorTree(doc.id, doc.name)
  }

  async function saveInlineDiagnosis (doc: Doctor) {
    const df = diagnosisForm[doc.id] ?? {}
    setBusy(true)
    const { error: e } = await supabase.from('diagnosis_notes').insert({
      user_id: user!.id, note_date: df.note_date || todayISO(),
      doctor: doc.name, diagnoses_mentioned: df.diagnoses_mentioned || null,
      diagnoses_ruled_out: df.diagnoses_ruled_out || null, notes: df.notes || null,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    setInlineDiagnosis((prev) => ({ ...prev, [doc.id]: false }))
    setDiagnosisForm((prev) => ({ ...prev, [doc.id]: {} }))
    await loadDoctorTree(doc.id, doc.name)
  }

  async function saveInlineMed (doc: Doctor) {
    const mf = medForm[doc.id] ?? {}
    if (!mf.medication?.trim()) { setError('Medication name is required.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('current_medications').upsert(
      {
        user_id: user!.id, medication: mf.medication.trim(),
        dose: mf.dose || null, frequency: mf.frequency || null,
        purpose: mf.purpose || null,
        notes: `Prescribed by: ${doc.name}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,medication' }
    )
    setBusy(false)
    if (e) { setError(e.message); return }
    setInlineMed((prev) => ({ ...prev, [doc.id]: false }))
    setMedForm((prev) => ({ ...prev, [doc.id]: {} }))
    await loadDoctorTree(doc.id, doc.name)
  }

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>

      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>My Doctors</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(emptyForm()) }}>
            {showForm ? 'Cancel' : '+ Add doctor'}
          </button>
        </div>
        <p className="muted">Tap a doctor to see their full history.</p>
      </div>

      {/* ADD / EDIT FORM */}
      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit doctor' : 'Add doctor'}</h3>
          <div className="form-group"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Smith" /></div>
          <div className="form-row">
            <div className="form-group"><label>Specialty</label><input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Rheumatology" /></div>
            <div className="form-group"><label>Clinic</label><input value={form.clinic} onChange={(e) => setForm({ ...form, clinic: e.target.value })} placeholder="UCLA Medical" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 000-0000" /></div>
            <div className="form-group"><label>Address</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
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
        const vf = visitForm[doc.id] ?? {}
        const df = diagnosisForm[doc.id] ?? {}
        const mf = medForm[doc.id] ?? {}
        const qs = questionForms[doc.id] ?? [{ text: '', priority: 'Medium' }]

        return (
          <div key={doc.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>

            {/* HEADER */}
            <div style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => toggleDoctor(doc)}>
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

            {/* TREE */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>

                {/* VISITS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="btn btn-ghost" style={{ fontWeight: 600, padding: '8px 0' }}
                      onClick={() => toggleSection(doc.id, 'visits')}>
                      🏥 Visits ({visits.length}) {sections.visits ? '▲' : '▼'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                      onClick={() => setInlineVisit((prev) => ({ ...prev, [doc.id]: !inlineVisit[doc.id] }))}>
                      + Log visit
                    </button>
                  </div>

                  {inlineVisit[doc.id] && (
                    <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10, display: 'grid', gap: 8 }}>
                      <div className="form-row">
                        <div className="form-group"><label>Date</label><input type="date" value={vf.visit_date ?? todayISO()} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, visit_date: e.target.value } }))} /></div>
                        <div className="form-group"><label>Time</label><input type="time" value={vf.visit_time ?? ''} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, visit_time: e.target.value } }))} /></div>
                      </div>
                      {(['reason', 'findings', 'tests_ordered', 'new_meds', 'instructions', 'follow_up', 'notes'] as const).map((k) => (
                        <div className="form-group" key={k}>
                          <label>{k.replace(/_/g, ' ')}</label>
                          <textarea value={vf[k] ?? ''} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, [k]: e.target.value } }))} />
                        </div>
                      ))}
                      <button type="button" className="btn btn-primary btn-block" onClick={() => saveInlineVisit(doc)} disabled={busy}>Save visit</button>
                    </div>
                  )}

                  {sections.visits && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {visits.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No visits logged yet.</p>}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="btn btn-ghost" style={{ fontWeight: 600, padding: '8px 0' }}
                      onClick={() => toggleSection(doc.id, 'questions')}>
                      ❓ Questions ({questions.length}) {sections.questions ? '▲' : '▼'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                      onClick={() => {
                        setInlineQuestion((prev) => ({ ...prev, [doc.id]: !inlineQuestion[doc.id] }))
                        if (!questionForms[doc.id]?.length) setQuestionForms((p) => ({ ...p, [doc.id]: [{ text: '', priority: 'Medium' }] }))
                      }}>
                      + Add question
                    </button>
                  </div>

                  {inlineQuestion[doc.id] && (
                    <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10, display: 'grid', gap: 8 }}>
                      {qs.map((q, i) => (
                        <div key={i} style={{ display: 'grid', gap: 6 }}>
                          <textarea value={q.text} onChange={(e) => setQuestionForms((p) => ({ ...p, [doc.id]: qs.map((qq, ii) => ii === i ? { ...qq, text: e.target.value } : qq) }))} placeholder="Question…" />
                          <select value={q.priority} onChange={(e) => setQuestionForms((p) => ({ ...p, [doc.id]: qs.map((qq, ii) => ii === i ? { ...qq, priority: e.target.value } : qq) }))}>
                            <option value="High">🔴 High</option>
                            <option value="Medium">🟡 Medium</option>
                            <option value="Low">🟢 Low</option>
                          </select>
                        </div>
                      ))}
                      <button type="button" className="btn btn-ghost" onClick={() => setQuestionForms((p) => ({ ...p, [doc.id]: [...qs, { text: '', priority: 'Medium' }] }))}>+ Add another</button>
                      <button type="button" className="btn btn-primary btn-block" onClick={() => saveInlineQuestions(doc)} disabled={busy}>Save questions</button>
                    </div>
                  )}

                  {sections.questions && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {questions.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No questions logged yet.</p>}
                      {questions.map((q) => (
                        <div key={q.id} className="list-item">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.9rem' }}>{q.question}</strong>
                            <span className="muted" style={{ fontSize: '0.8rem' }}>{q.priority ?? ''} · {q.status ?? ''}</span>
                          </div>
                          {q.answer
                            ? <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}><strong>Answer:</strong> {q.answer}</div>
                            : (
                              <div style={{ marginTop: 8 }}>
                                <textarea placeholder="Write answer here…" value={answerDraft[q.id] ?? ''}
                                  onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                  style={{ marginBottom: 6 }} />
                                <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                                  onClick={() => saveAnswer(q.id)}>Save answer</button>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* DIAGNOSES */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="btn btn-ghost" style={{ fontWeight: 600, padding: '8px 0' }}
                      onClick={() => toggleSection(doc.id, 'diagnoses')}>
                      📋 Diagnoses ({diagnoses.length}) {sections.diagnoses ? '▲' : '▼'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                      onClick={() => setInlineDiagnosis((prev) => ({ ...prev, [doc.id]: !inlineDiagnosis[doc.id] }))}>
                      + Add diagnosis
                    </button>
                  </div>

                  {inlineDiagnosis[doc.id] && (
                    <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10, display: 'grid', gap: 8 }}>
                      <div className="form-group"><label>Date</label><input type="date" value={df.note_date ?? todayISO()} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, note_date: e.target.value } }))} /></div>
                      <div className="form-group"><label>Diagnoses mentioned</label><textarea value={df.diagnoses_mentioned ?? ''} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, diagnoses_mentioned: e.target.value } }))} /></div>
                      <div className="form-group"><label>Diagnoses ruled out</label><textarea value={df.diagnoses_ruled_out ?? ''} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, diagnoses_ruled_out: e.target.value } }))} /></div>
                      <div className="form-group"><label>Notes</label><textarea value={df.notes ?? ''} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, notes: e.target.value } }))} /></div>
                      <button type="button" className="btn btn-primary btn-block" onClick={() => saveInlineDiagnosis(doc)} disabled={busy}>Save diagnosis</button>
                    </div>
                  )}

                  {sections.diagnoses && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {diagnoses.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No diagnosis notes yet.</p>}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="btn btn-ghost" style={{ fontWeight: 600, padding: '8px 0' }}
                      onClick={() => toggleSection(doc.id, 'meds')}>
                      💊 Medications ({meds.length}) {sections.meds ? '▲' : '▼'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                      onClick={() => setInlineMed((prev) => ({ ...prev, [doc.id]: !inlineMed[doc.id] }))}>
                      + Add medication
                    </button>
                  </div>

                  {inlineMed[doc.id] && (
                    <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10, display: 'grid', gap: 8 }}>
                      <div className="form-group"><label>Medication</label><input value={mf.medication ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, medication: e.target.value } }))} placeholder="Medication name" /></div>
                      <div className="form-row">
                        <div className="form-group"><label>Dose</label><input value={mf.dose ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, dose: e.target.value } }))} placeholder="50mg" /></div>
                        <div className="form-group"><label>Frequency</label><input value={mf.frequency ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, frequency: e.target.value } }))} placeholder="Twice daily" /></div>
                      </div>
                      <div className="form-group"><label>Purpose</label><input value={mf.purpose ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, purpose: e.target.value } }))} placeholder="Pain, inflammation…" /></div>
                      <button type="button" className="btn btn-primary btn-block" onClick={() => saveInlineMed(doc)} disabled={busy}>Save medication</button>
                    </div>
                  )}

                  {sections.meds && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {meds.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No medications linked yet. Use "+ Add medication" above, or include this doctor's name when logging meds.</p>}
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