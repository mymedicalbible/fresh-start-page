import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Doctor = {
  id: string; name: string; specialty: string | null
  clinic: string | null; phone: string | null
  address: string | null; notes: string | null
}
type VisitRow = {
  id: string; visit_date: string; reason: string | null
  findings: string | null; tests_ordered: string | null; notes: string | null
}
type QuestionRow = {
  id: string; date_created: string; appointment_date: string | null
  question: string; priority: string | null; answer: string | null; status: string | null
}
type DiagnosisRow = {
  id: string; note_date: string
  diagnoses_mentioned: string | null; diagnoses_ruled_out: string | null; notes: string | null
}
type DiagDirRow = {
  id: string; diagnosis: string; status: string; date_diagnosed: string | null
}
type MedRow = {
  id: string; medication: string; dose: string | null
  frequency: string | null; purpose: string | null
}
type TestRow = {
  id: string; test_date: string; test_name: string; status: string
}

const STATUS_OPTIONS = [
  { value: 'Suspected', label: '🟡 Suspected', color: '#fef3c7', text: '#92400e' },
  { value: 'Confirmed', label: '🟢 Confirmed', color: '#d1fae5', text: '#065f46' },
  { value: 'Ruled Out', label: '🔴 Ruled out', color: '#fee2e2', text: '#991b1b' },
  { value: 'Resolved', label: '⚪ Resolved', color: '#f3f4f6', text: '#374151' },
]

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
  const [diagDirMap, setDiagDirMap] = useState<Record<string, DiagDirRow[]>>({})
  const [medMap, setMedMap] = useState<Record<string, MedRow[]>>({})
  const [testMap, setTestMap] = useState<Record<string, TestRow[]>>({})
  const [inlineQuestion, setInlineQuestion] = useState<Record<string, boolean>>({})
  const [inlineDiagnosis, setInlineDiagnosis] = useState<Record<string, boolean>>({})
  const [inlineMed, setInlineMed] = useState<Record<string, boolean>>({})
  const [questionForms, setQuestionForms] = useState<Record<string, { text: string; priority: string }[]>>({})
  const [diagnosisForm, setDiagnosisForm] = useState<Record<string, any>>({})
  const [medForm, setMedForm] = useState<Record<string, any>>({})
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user) return
    loadDoctors()
  }, [user])

  async function loadDoctors () {
    const { data, error: e } = await supabase.from('doctors').select('*')
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
      if (e) { setError(e.message); setBusy(false); return }
    } else {
      const { error: e } = await supabase.from('doctors').insert({
        user_id: user!.id, name: form.name.trim(),
        specialty: form.specialty || null, clinic: form.clinic || null,
        phone: form.phone || null, address: form.address || null,
        notes: form.notes || null,
      })
      if (e) { setError(e.message); setBusy(false); return }
    }
    setBusy(false)
    setShowForm(false); setEditingId(null); setForm(emptyForm())
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
    const [v, q, d, dd, m, t] = await Promise.all([
      supabase.from('doctor_visits').select('id, visit_date, reason, findings, tests_ordered, notes')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`)
        .order('visit_date', { ascending: false }).limit(30),
      supabase.from('doctor_questions').select('id, date_created, appointment_date, question, priority, answer, status')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`)
        .order('date_created', { ascending: false }).limit(50),
      supabase.from('diagnosis_notes').select('id, note_date, diagnoses_mentioned, diagnoses_ruled_out, notes')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`)
        .order('note_date', { ascending: false }).limit(30),
      supabase.from('diagnoses_directory').select('id, diagnosis, status, date_diagnosed')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`)
        .order('created_at', { ascending: false }),
      supabase.from('current_medications').select('id, medication, dose, frequency, purpose')
        .eq('user_id', user!.id).ilike('notes', `Prescribed by: ${doctorName}%`).limit(20),
      supabase.from('tests_ordered').select('id, test_date, test_name, status')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`)
        .order('test_date', { ascending: false }).limit(20),
    ])
    setVisitMap((prev) => ({ ...prev, [docId]: (v.data ?? []) as VisitRow[] }))
    setQuestionMap((prev) => ({ ...prev, [docId]: (q.data ?? []) as QuestionRow[] }))
    setDiagnosisMap((prev) => ({ ...prev, [docId]: (d.data ?? []) as DiagnosisRow[] }))
    setDiagDirMap((prev) => ({ ...prev, [docId]: (dd.data ?? []) as DiagDirRow[] }))
    setMedMap((prev) => ({ ...prev, [docId]: (m.data ?? []) as MedRow[] }))
    setTestMap((prev) => ({ ...prev, [docId]: (t.data ?? []) as TestRow[] }))
  }

  async function toggleDoctor (doc: Doctor) {
    if (expandedId === doc.id) { setExpandedId(null); return }
    setExpandedId(doc.id)
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
      doctor: doc.name,
      diagnoses_mentioned: df.diagnoses_mentioned || null,
      diagnoses_ruled_out: df.diagnoses_ruled_out || null,
      notes: df.notes || null,
    })
    if (!e && df.diagnoses_mentioned?.trim()) {
      const diags = df.diagnoses_mentioned.split(',').map((d: string) => d.trim()).filter(Boolean)
      for (const diag of diags) {
        const { data: existing } = await supabase.from('diagnoses_directory')
          .select('id').eq('user_id', user!.id).ilike('diagnosis', diag).limit(1)
        if (!existing || existing.length === 0) {
          await supabase.from('diagnoses_directory').insert({
            user_id: user!.id, diagnosis: diag, doctor: doc.name,
            date_diagnosed: df.note_date || todayISO(), status: 'Suspected',
          })
        }
      }
    }
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
    const { error: e } = await supabase.from('current_medications').upsert({
      user_id: user!.id, medication: mf.medication.trim(),
      dose: mf.dose || null, frequency: mf.frequency || null,
      purpose: mf.purpose || null,
      notes: `Prescribed by: ${doc.name}`,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,medication' })
    setBusy(false)
    if (e) { setError(e.message); return }
    setInlineMed((prev) => ({ ...prev, [doc.id]: false }))
    setMedForm((prev) => ({ ...prev, [doc.id]: {} }))
    await loadDoctorTree(doc.id, doc.name)
  }

  async function saveAnswer (questionId: string) {
    const answer = answerDraft[questionId] ?? ''
    if (!answer.trim()) return
    const { error: e } = await supabase.from('doctor_questions')
      .update({ answer, status: 'Answered' }).eq('id', questionId)
    if (e) { setError(e.message); return }
    setQuestionMap((prev) => Object.fromEntries(
      Object.entries(prev).map(([docId, qs]) => [
        docId, qs.map((q) => q.id === questionId ? { ...q, answer, status: 'Answered' } : q),
      ])
    ))
  }

  async function updateDiagStatus (id: string, status: string) {
    await supabase.from('diagnoses_directory').update({ status }).eq('id', id)
    setDiagDirMap((prev) => Object.fromEntries(
      Object.entries(prev).map(([docId, rows]) => [
        docId, rows.map((r) => r.id === id ? { ...r, status } : r),
      ])
    ))
  }

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')}>← Home</button>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>My Doctors</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(emptyForm()) }}>
            {showForm && !editingId ? 'Cancel' : '+ Add doctor'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>Tap a doctor to expand their history.</p>
      </div>

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
              <label>Clinic</label>
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
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={saveDoctor} disabled={busy}>Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {doctors.length === 0 && !showForm && (
        <div className="card"><p className="muted">No doctors added yet.</p></div>
      )}

      {doctors.map((doc) => {
        const isOpen = expandedId === doc.id
        const sections = openSections[doc.id] ?? {}
        const visits = visitMap[doc.id] ?? []
        const questions = questionMap[doc.id] ?? []
        const diagnoses = diagnosisMap[doc.id] ?? []
        const diagDir = diagDirMap[doc.id] ?? []
        const meds = medMap[doc.id] ?? []
        const tests = testMap[doc.id] ?? []
        const df = diagnosisForm[doc.id] ?? {}
        const mf = medForm[doc.id] ?? {}
        const qs = questionForms[doc.id] ?? [{ text: '', priority: 'Medium' }]

        return (
          <div key={doc.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>

            {/* DOCTOR HEADER ROW */}
            <div
              style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => toggleDoctor(doc)}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: '#e8f0e0', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700, fontSize: '0.9rem',
                  color: '#4a7a32', flexShrink: 0,
                }}>
                  {doc.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem' }}>{doc.name}</div>
                  {(doc.specialty || doc.clinic) && (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {[doc.specialty, doc.clinic].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {doc.phone && (
                    <div className="muted" style={{ fontSize: '0.8rem' }}>📞 {doc.phone}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className="btn btn-ghost"
                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                  onClick={(e) => { e.stopPropagation(); startEdit(doc) }}>Edit</button>
                <button type="button" className="btn btn-ghost"
                  style={{ padding: '4px 10px', fontSize: '0.8rem', color: 'red' }}
                  onClick={(e) => { e.stopPropagation(); deleteDoctor(doc.id) }}>Remove</button>
                <span style={{ color: '#aaa', fontSize: '1rem' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)' }}>

                {/* VISITS */}
                <div style={{ borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
                    <button type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.9rem', color: 'inherit' }}
                      onClick={() => toggleSection(doc.id, 'visits')}>
                      🏥 Visits
                      <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>({visits.length})</span>
                      <span style={{ color: '#ccc', fontSize: '0.75rem' }}>{sections.visits ? '▲' : '▼'}</span>
                    </button>
                    <button type="button" className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        const sp = new URLSearchParams({ tab: 'visit', doctor: doc.name })
                        if (doc.specialty) sp.set('specialty', doc.specialty)
                        navigate(`/log?${sp.toString()}`)
                      }}>
                      + Log visit
                    </button>
                  </div>

                  {sections.visits && (
                    <div style={{ padding: '0 16px 12px', display: 'grid', gap: 8 }}>
                      {visits.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No visits logged yet.</p>}
                      {visits.map((v) => (
                        <div key={v.id} className="list-item">
                          <strong style={{ fontSize: '0.9rem' }}>{v.visit_date}</strong>
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
                <div style={{ borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
                    <button type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.9rem', color: 'inherit' }}
                      onClick={() => toggleSection(doc.id, 'questions')}>
                      ❓ Questions
                      <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>({questions.filter((q) => !q.answer).length} open)</span>
                      <span style={{ color: '#ccc', fontSize: '0.75rem' }}>{sections.questions ? '▲' : '▼'}</span>
                    </button>
                    <button type="button" className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                      onClick={() => {
                        setInlineQuestion((prev) => ({ ...prev, [doc.id]: !inlineQuestion[doc.id] }))
                        if (!questionForms[doc.id]?.length) setQuestionForms((p) => ({ ...p, [doc.id]: [{ text: '', priority: 'Medium' }] }))
                      }}>
                      + Add
                    </button>
                  </div>

                  {inlineQuestion[doc.id] && (
                    <div style={{ padding: '0 16px 12px' }}>
                      <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
                        {qs.map((q, i) => (
                          <div key={i} style={{ display: 'grid', gap: 6 }}>
                            <textarea value={q.text} placeholder="Question…"
                              onChange={(e) => setQuestionForms((p) => ({ ...p, [doc.id]: qs.map((qq, ii) => ii === i ? { ...qq, text: e.target.value } : qq) }))} />
                            <select value={q.priority}
                              onChange={(e) => setQuestionForms((p) => ({ ...p, [doc.id]: qs.map((qq, ii) => ii === i ? { ...qq, priority: e.target.value } : qq) }))}>
                              <option value="High">🔴 High</option>
                              <option value="Medium">🟡 Medium</option>
                              <option value="Low">🟢 Low</option>
                            </select>
                          </div>
                        ))}
                        <button type="button" className="btn btn-ghost"
                          onClick={() => setQuestionForms((p) => ({ ...p, [doc.id]: [...qs, { text: '', priority: 'Medium' }] }))}>
                          + Add another
                        </button>
                        <button type="button" className="btn btn-primary btn-block"
                          onClick={() => saveInlineQuestions(doc)} disabled={busy}>Save questions</button>
                      </div>
                    </div>
                  )}

                  {sections.questions && (
                    <div style={{ padding: '0 16px 12px', display: 'grid', gap: 8 }}>
                      {questions.filter((q) => !q.answer).length === 0
                        ? <p className="muted" style={{ fontSize: '0.85rem' }}>No open questions.</p>
                        : questions.filter((q) => !q.answer).map((q) => (
                          <div key={q.id} className="list-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{q.question}</span>
                              <span className="muted" style={{ fontSize: '0.8rem', flexShrink: 0 }}>{q.priority ?? ''}</span>
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <textarea placeholder="Write answer…"
                                value={answerDraft[q.id] ?? ''}
                                onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                                style={{ marginBottom: 6 }} />
                              <button type="button" className="btn btn-secondary"
                                style={{ fontSize: '0.8rem', padding: '4px 12px' }}
                                onClick={() => saveAnswer(q.id)}>Save answer</button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* DIAGNOSES */}
                <div style={{ borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
                    <button type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.9rem', color: 'inherit' }}
                      onClick={() => toggleSection(doc.id, 'diagnoses')}>
                      📋 Diagnoses
                      <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>({diagDir.length})</span>
                      <span style={{ color: '#ccc', fontSize: '0.75rem' }}>{sections.diagnoses ? '▲' : '▼'}</span>
                    </button>
                    <button type="button" className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                      onClick={() => setInlineDiagnosis((prev) => ({ ...prev, [doc.id]: !inlineDiagnosis[doc.id] }))}>
                      + Log note
                    </button>
                  </div>

                  {inlineDiagnosis[doc.id] && (
                    <div style={{ padding: '0 16px 12px' }}>
                      <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
                        {diagDir.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 6, color: '#666' }}>Existing diagnoses</div>
                            {diagDir.map((d) => {
                              const s = STATUS_OPTIONS.find((x) => x.value === d.status)
                              return (
                                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 8, background: s?.color ?? '#f9f9f9', marginBottom: 4 }}>
                                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: s?.text }}>{d.diagnosis}</span>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    {d.status !== 'Resolved' && (
                                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                                        onClick={() => updateDiagStatus(d.id, 'Resolved')}>Resolve</button>
                                    )}
                                    {d.status !== 'Ruled Out' && (
                                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '2px 6px', color: '#991b1b' }}
                                        onClick={() => updateDiagStatus(d.id, 'Ruled Out')}>Rule out</button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        <div className="form-group"><label>Date</label><input type="date" value={df.note_date ?? todayISO()} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, note_date: e.target.value } }))} /></div>
                        <div className="form-group">
                          <label>Diagnoses mentioned (comma separated)</label>
                          <textarea value={df.diagnoses_mentioned ?? ''}
                            onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, diagnoses_mentioned: e.target.value } }))}
                            placeholder="Auto-adds to diagnoses directory as Suspected" />
                        </div>
                        <div className="form-group">
                          <label>Diagnoses ruled out</label>
                          <textarea value={df.diagnoses_ruled_out ?? ''}
                            onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, diagnoses_ruled_out: e.target.value } }))} />
                        </div>
                        <div className="form-group"><label>Notes</label><textarea value={df.notes ?? ''} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, notes: e.target.value } }))} /></div>
                        <button type="button" className="btn btn-primary btn-block" onClick={() => saveInlineDiagnosis(doc)} disabled={busy}>Save</button>
                      </div>
                    </div>
                  )}

                  {sections.diagnoses && (
                    <div style={{ padding: '0 16px 12px', display: 'grid', gap: 8 }}>
                      {diagDir.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No diagnoses logged for this doctor yet.</p>}
                      {diagDir.map((d) => {
                        const s = STATUS_OPTIONS.find((x) => x.value === d.status)
                        return (
                          <div key={d.id} className="list-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong>{d.diagnosis}</strong>
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: s?.color, color: s?.text }}>{d.status}</span>
                            </div>
                            {d.date_diagnosed && <div className="muted" style={{ fontSize: '0.8rem' }}>Diagnosed: {d.date_diagnosed}</div>}
                            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                              {STATUS_OPTIONS.filter((x) => x.value !== d.status).map((x) => (
                                <button key={x.value} type="button" className="btn btn-ghost"
                                  style={{ fontSize: '0.7rem', padding: '2px 8px', background: x.color, color: x.text }}
                                  onClick={() => updateDiagStatus(d.id, x.value)}>{x.label}</button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {diagnoses.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#888', marginBottom: 6 }}>Diagnosis notes</div>
                          {diagnoses.map((d) => (
                            <div key={d.id} className="list-item">
                              <strong style={{ fontSize: '0.85rem' }}>{d.note_date}</strong>
                              {d.diagnoses_mentioned && <div className="muted" style={{ fontSize: '0.85rem' }}>Mentioned: {d.diagnoses_mentioned}</div>}
                              {d.diagnoses_ruled_out && <div className="muted" style={{ fontSize: '0.85rem' }}>Ruled out: {d.diagnoses_ruled_out}</div>}
                              {d.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>Notes: {d.notes}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* MEDICATIONS */}
                <div style={{ borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
                    <button type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.9rem', color: 'inherit' }}
                      onClick={() => toggleSection(doc.id, 'meds')}>
                      💊 Medications
                      <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>({meds.length})</span>
                      <span style={{ color: '#ccc', fontSize: '0.75rem' }}>{sections.meds ? '▲' : '▼'}</span>
                    </button>
                    <button type="button" className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                      onClick={() => setInlineMed((prev) => ({ ...prev, [doc.id]: !inlineMed[doc.id] }))}>
                      + Add
                    </button>
                  </div>

                  {inlineMed[doc.id] && (
                    <div style={{ padding: '0 16px 12px' }}>
                      <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, display: 'grid', gap: 8 }}>
                        <div className="form-group"><label>Medication</label><input value={mf.medication ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, medication: e.target.value } }))} placeholder="Medication name" /></div>
                        <div className="form-row">
                          <div className="form-group"><label>Dose</label><input value={mf.dose ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, dose: e.target.value } }))} placeholder="50mg" /></div>
                          <div className="form-group"><label>Frequency</label><input value={mf.frequency ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, frequency: e.target.value } }))} placeholder="Twice daily" /></div>
                        </div>
                        <div className="form-group"><label>Purpose</label><input value={mf.purpose ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, purpose: e.target.value } }))} placeholder="Pain, inflammation…" /></div>
                        <button type="button" className="btn btn-primary btn-block" onClick={() => saveInlineMed(doc)} disabled={busy}>Save medication</button>
                      </div>
                    </div>
                  )}

                  {sections.meds && (
                    <div style={{ padding: '0 16px 12px', display: 'grid', gap: 8 }}>
                      {meds.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No medications linked yet.</p>}
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

                {/* TESTS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
                    <button type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.9rem', color: 'inherit' }}
                      onClick={() => toggleSection(doc.id, 'tests')}>
                      🧪 Tests & orders
                      <span className="muted" style={{ fontWeight: 400, fontSize: '0.8rem' }}>({tests.length})</span>
                      <span style={{ color: '#ccc', fontSize: '0.75rem' }}>{sections.tests ? '▲' : '▼'}</span>
                    </button>
                    <button type="button" className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                      onClick={() => navigate('/tests')}>
                      All tests
                    </button>
                  </div>

                  {sections.tests && (
                    <div style={{ padding: '0 16px 12px', display: 'grid', gap: 8 }}>
                      {tests.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No tests ordered yet.</p>}
                      {tests.map((t) => {
                        const statusColor = t.status === 'Completed'
                          ? { background: '#d1fae5', color: '#065f46' }
                          : t.status === 'Archived'
                            ? { background: '#e5e7eb', color: '#6b7280' }
                            : { background: '#fef3c7', color: '#92400e' }
                        return (
                          <div key={t.id} className="list-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <strong style={{ fontSize: '0.9rem' }}>{t.test_name}</strong>
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, ...statusColor }}>{t.status}</span>
                            </div>
                            <div className="muted" style={{ fontSize: '0.85rem' }}>{t.test_date}</div>
                          </div>
                        )
                      })}
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