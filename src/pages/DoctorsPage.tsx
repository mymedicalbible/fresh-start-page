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
  const [inlineVisit, setInlineVisit] = useState<Record<string, boolean>>({})
  const [inlineQuestion, setInlineQuestion] = useState<Record<string, boolean>>({})
  const [inlineDiagnosis, setInlineDiagnosis] = useState<Record<string, boolean>>({})
  const [inlineMed, setInlineMed] = useState<Record<string, boolean>>({})
  const [visitForm, setVisitForm] = useState<Record<string, any>>({})
  const [visitTests, setVisitTests] = useState<Record<string, { test_name: string; reason: string }[]>>({})
  const [visitMeds, setVisitMeds] = useState<Record<string, { medication: string; dose: string; action: 'keep' | 'remove' }[]>>({})
  const [newMedEntry, setNewMedEntry] = useState<Record<string, { medication: string; dose: string }>>({})
  const [questionForms, setQuestionForms] = useState<Record<string, { text: string; priority: string }[]>>({})
  const [diagnosisForm, setDiagnosisForm] = useState<Record<string, any>>({})
  const [medForm, setMedForm] = useState<Record<string, any>>({})
  const [uploadingVisitId, setUploadingVisitId] = useState<string | null>(null)
  const [visitDocMap, setVisitDocMap] = useState<Record<string, { name: string; signedUrl: string }[]>>({})

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
      if (e) setError(e.message)
    } else {
      const { error: e } = await supabase.from('doctors').insert({
        user_id: user!.id, name: form.name.trim(),
        specialty: form.specialty || null, clinic: form.clinic || null,
        phone: form.phone || null, address: form.address || null, notes: form.notes || null,
      })
      if (e) setError(e.message)
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
    setForm({ name: doc.name, specialty: doc.specialty ?? '', clinic: doc.clinic ?? '', phone: doc.phone ?? '', address: doc.address ?? '', notes: doc.notes ?? '' })
    setShowForm(true)
  }

  function toggleSection (docId: string, section: string) {
    setOpenSections((prev) => ({ ...prev, [docId]: { ...(prev[docId] ?? {}), [section]: !(prev[docId]?.[section]) } }))
  }

  async function loadDoctorTree (docId: string, doctorName: string) {
    if (!user) return
    const [v, q, d, dd, m, t] = await Promise.all([
      supabase.from('doctor_visits').select('id, visit_date, reason, findings, tests_ordered, notes')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`).order('visit_date', { ascending: false }).limit(30),
      supabase.from('doctor_questions').select('id, date_created, appointment_date, question, priority, answer, status')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`).order('date_created', { ascending: false }).limit(50),
      supabase.from('diagnosis_notes').select('id, note_date, diagnoses_mentioned, diagnoses_ruled_out, notes')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`).order('note_date', { ascending: false }).limit(30),
      supabase.from('diagnoses_directory').select('id, diagnosis, status, date_diagnosed')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`).order('created_at', { ascending: false }),
      supabase.from('current_medications').select('id, medication, dose, frequency, purpose')
        .eq('user_id', user!.id).ilike('notes', `%${doctorName}%`).limit(20),
      supabase.from('tests_ordered').select('id, test_date, test_name, status')
        .eq('user_id', user!.id).ilike('doctor', `%${doctorName}%`).order('test_date', { ascending: false }).limit(20),
    ])
    setVisitMap((prev) => ({ ...prev, [docId]: (v.data ?? []) as VisitRow[] }))
    setQuestionMap((prev) => ({ ...prev, [docId]: (q.data ?? []) as QuestionRow[] }))
    setDiagnosisMap((prev) => ({ ...prev, [docId]: (d.data ?? []) as DiagnosisRow[] }))
    setDiagDirMap((prev) => ({ ...prev, [docId]: (dd.data ?? []) as DiagDirRow[] }))
    setMedMap((prev) => ({ ...prev, [docId]: (m.data ?? []) as MedRow[] }))
    setTestMap((prev) => ({ ...prev, [docId]: (t.data ?? []) as TestRow[] }))

    // Pre-populate visit meds
    const meds = (m.data ?? []) as MedRow[]
    setVisitMeds((prev) => ({ ...prev, [docId]: meds.map((med) => ({ medication: med.medication, dose: med.dose ?? '', action: 'keep' as const })) }))
  }

  async function toggleDoctor (doc: Doctor) {
    if (expandedId === doc.id) { setExpandedId(null); return }
    setExpandedId(doc.id)
    await loadDoctorTree(doc.id, doc.name)
  }

  async function loadVisitDocs (visitId: string) {
    if (!user) return
    const folder = `${user.id}/${visitId}`
    const { data } = await supabase.storage.from('visit-docs').list(folder, { limit: 50 })
    const signed = await Promise.all((data ?? []).map(async (f) => {
      const { data: sd } = await supabase.storage.from('visit-docs').createSignedUrl(`${folder}/${f.name}`, 3600)
      return { name: f.name, signedUrl: sd?.signedUrl ?? '' }
    }))
    setVisitDocMap((prev) => ({ ...prev, [visitId]: signed }))
  }

  async function uploadVisitDoc (visitId: string, file: File) {
    if (!user) return
    setUploadingVisitId(visitId)
    try {
      const folder = `${user.id}/${visitId}`
      const safeName = `${Date.now()}-${file.name}`.replace(/\s+/g, '-')
      await supabase.storage.from('visit-docs').upload(`${folder}/${safeName}`, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      await loadVisitDocs(visitId)
    } catch (e: any) { setError(e?.message ?? String(e)) }
    finally { setUploadingVisitId(null) }
  }

  async function saveInlineVisit (doc: Doctor) {
    const vf = visitForm[doc.id] ?? {}
    if (!vf.visit_date) { setError('Date is required.'); return }
    const tests = (visitTests[doc.id] ?? [{ test_name: '', reason: '' }]).filter((t) => t.test_name.trim())
    const meds = visitMeds[doc.id] ?? []
    const nm = newMedEntry[doc.id] ?? { medication: '', dose: '' }
    setBusy(true)

    const { error: ve } = await supabase.from('doctor_visits').insert({
      user_id: user!.id, visit_date: vf.visit_date, visit_time: vf.visit_time || null,
      doctor: doc.name, specialty: doc.specialty || null, reason: vf.reason || null,
      findings: vf.findings || null,
      tests_ordered: tests.map((t) => t.test_name).join(', ') || null,
      instructions: vf.instructions || null, follow_up: vf.next_appt_date || null, notes: vf.notes || null,
    })
    if (ve) { setError(ve.message); setBusy(false); return }

    if (tests.length > 0) {
      await supabase.from('tests_ordered').insert(
        tests.map((t) => ({ user_id: user!.id, test_date: vf.visit_date, doctor: doc.name, test_name: t.test_name, reason: t.reason || null, status: 'Pending' }))
      )
    }

    if (vf.next_appt_date) {
      await supabase.from('appointments').insert({
        user_id: user!.id, doctor: doc.name, specialty: doc.specialty || null,
        appointment_date: vf.next_appt_date, appointment_time: vf.next_appt_time || null,
      })
    }

    for (const m of meds) {
      if (m.action === 'remove') {
        await supabase.from('current_medications').delete().eq('user_id', user!.id).eq('medication', m.medication)
      }
    }

    if (nm.medication.trim()) {
      await supabase.from('current_medications').upsert(
        { user_id: user!.id, medication: nm.medication.trim(), dose: nm.dose || null, notes: `Prescribed by: ${doc.name}`, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,medication' }
      )
    }

    setBusy(false)
    setInlineVisit((prev) => ({ ...prev, [doc.id]: false }))
    setVisitForm((prev) => ({ ...prev, [doc.id]: {} }))
    setVisitTests((prev) => ({ ...prev, [doc.id]: [{ test_name: '', reason: '' }] }))
    setNewMedEntry((prev) => ({ ...prev, [doc.id]: { medication: '', dose: '' } }))
    await loadDoctorTree(doc.id, doc.name)
  }

  async function saveInlineQuestions (doc: Doctor) {
    const qs = (questionForms[doc.id] ?? []).filter((q) => q.text.trim())
    if (qs.length === 0) { setError('Enter at least one question.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('doctor_questions').insert(
      qs.map((q) => ({ user_id: user!.id, date_created: todayISO(), doctor: doc.name, question: q.text.trim(), priority: q.priority, status: 'Unanswered', answer: null }))
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
      user_id: user!.id, note_date: df.note_date || todayISO(), doctor: doc.name,
      diagnoses_mentioned: df.diagnoses_mentioned || null,
      diagnoses_ruled_out: df.diagnoses_ruled_out || null, notes: df.notes || null,
    })
    // Also add to diagnoses directory if mentioned
    if (!e && df.diagnoses_mentioned?.trim()) {
      const diags = df.diagnoses_mentioned.split(',').map((d: string) => d.trim()).filter(Boolean)
      for (const diag of diags) {
        await supabase.from('diagnoses_directory').insert({
          user_id: user!.id, diagnosis: diag, doctor: doc.name,
          date_diagnosed: df.note_date || todayISO(), status: 'Suspected',
        })
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
    const { error: e } = await supabase.from('current_medications').upsert(
      { user_id: user!.id, medication: mf.medication.trim(), dose: mf.dose || null, frequency: mf.frequency || null, purpose: mf.purpose || null, notes: `Prescribed by: ${doc.name}`, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,medication' }
    )
    setBusy(false)
    if (e) { setError(e.message); return }
    setInlineMed((prev) => ({ ...prev, [doc.id]: false }))
    setMedForm((prev) => ({ ...prev, [doc.id]: {} }))
    await loadDoctorTree(doc.id, doc.name)
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
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>My Doctors</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(emptyForm()) }}>
            {showForm && !editingId ? 'Cancel' : '+ Add doctor'}
          </button>
        </div>
        <p className="muted">Tap a doctor to see their full history.</p>
      </div>

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

      {doctors.map((doc) => {
        const isOpen = expandedId === doc.id
        const sections = openSections[doc.id] ?? {}
        const visits = visitMap[doc.id] ?? []
        const questions = questionMap[doc.id] ?? []
        const diagnoses = diagnosisMap[doc.id] ?? []
        const diagDir = diagDirMap[doc.id] ?? []
        const meds = medMap[doc.id] ?? []
        const tests = testMap[doc.id] ?? []
        const vf = visitForm[doc.id] ?? {}
        const df = diagnosisForm[doc.id] ?? {}
        const mf = medForm[doc.id] ?? {}
        const qs = questionForms[doc.id] ?? [{ text: '', priority: 'Medium' }]
        const dvTests = visitTests[doc.id] ?? [{ test_name: '', reason: '' }]
        const dvMeds = visitMeds[doc.id] ?? []
        const nm = newMedEntry[doc.id] ?? { medication: '', dose: '' }

        return (
          <div key={doc.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                <span>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>

                {/* VISITS — full form */}
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
                      <div className="form-group"><label>Reason</label><textarea value={vf.reason ?? ''} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, reason: e.target.value } }))} /></div>
                      <div className="form-group"><label>Findings</label><textarea value={vf.findings ?? ''} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, findings: e.target.value } }))} /></div>

                      {/* TESTS */}
                      <div className="form-group">
                        <label style={{ fontWeight: 600 }}>Tests / orders</label>
                        {dvTests.map((t, i) => (
                          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                            <input style={{ flex: 2 }} value={t.test_name} placeholder="Test name"
                              onChange={(e) => setVisitTests((p) => ({ ...p, [doc.id]: dvTests.map((x, idx) => idx === i ? { ...x, test_name: e.target.value } : x) }))} />
                            <input style={{ flex: 2 }} value={t.reason} placeholder="Reason"
                              onChange={(e) => setVisitTests((p) => ({ ...p, [doc.id]: dvTests.map((x, idx) => idx === i ? { ...x, reason: e.target.value } : x) }))} />
                            {dvTests.length > 1 && (
                              <button type="button" className="btn btn-ghost" style={{ color: 'red' }}
                                onClick={() => setVisitTests((p) => ({ ...p, [doc.id]: dvTests.filter((_, idx) => idx !== i) }))}>✕</button>
                            )}
                          </div>
                        ))}
                        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }}
                          onClick={() => setVisitTests((p) => ({ ...p, [doc.id]: [...dvTests, { test_name: '', reason: '' }] }))}>+ Add test</button>
                      </div>

                      {/* MEDS */}
                      <div className="form-group">
                        <label style={{ fontWeight: 600 }}>Medications from this doctor</label>
                        {dvMeds.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No medications linked yet.</p>}
                        {dvMeds.map((m, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.85rem' }}>{m.medication}{m.dose ? ` · ${m.dose}` : ''}</span>
                            <button type="button" className="btn btn-ghost"
                              style={{ fontSize: '0.75rem', color: m.action === 'remove' ? 'red' : '#888' }}
                              onClick={() => setVisitMeds((p) => ({ ...p, [doc.id]: dvMeds.map((x, idx) => idx === i ? { ...x, action: x.action === 'remove' ? 'keep' : 'remove' } : x) }))}>
                              {m.action === 'remove' ? 'Undo' : 'Remove'}
                            </button>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <input style={{ flex: 2 }} value={nm.medication} placeholder="Add new medication"
                            onChange={(e) => setNewMedEntry((p) => ({ ...p, [doc.id]: { ...nm, medication: e.target.value } }))} />
                          <input style={{ flex: 1 }} value={nm.dose} placeholder="Dose"
                            onChange={(e) => setNewMedEntry((p) => ({ ...p, [doc.id]: { ...nm, dose: e.target.value } }))} />
                        </div>
                      </div>

                      <div className="form-group"><label>Instructions</label><textarea value={vf.instructions ?? ''} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, instructions: e.target.value } }))} /></div>
                      <div className="form-group"><label>Notes</label><textarea value={vf.notes ?? ''} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, notes: e.target.value } }))} /></div>

                      {/* NEXT APPOINTMENT */}
                      <div className="form-group">
                        <label style={{ fontWeight: 600 }}>📅 Schedule next appointment</label>
                        <div className="form-row">
                          <div className="form-group"><label>Date</label><input type="date" value={vf.next_appt_date ?? ''} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, next_appt_date: e.target.value } }))} /></div>
                          <div className="form-group"><label>Time</label><input type="time" value={vf.next_appt_time ?? ''} onChange={(e) => setVisitForm((p) => ({ ...p, [doc.id]: { ...vf, next_appt_time: e.target.value } }))} /></div>
                        </div>
                      </div>

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
                          <div style={{ marginTop: 8 }}>
                            <input type="file" accept="image/*,application/pdf" disabled={uploadingVisitId === v.id}
                              onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; await uploadVisitDoc(v.id, file); e.target.value = '' }} />
                            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', marginTop: 4 }} onClick={() => loadVisitDocs(v.id)}>
                              {visitDocMap[v.id] ? 'Refresh docs' : 'Load docs'}
                            </button>
                            {(visitDocMap[v.id] ?? []).map((d) => (
                              <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                                <span className="muted" style={{ fontSize: '0.8rem' }}>{d.name}</span>
                                {d.signedUrl && <a href={d.signedUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>View</a>}
                              </div>
                            ))}
                          </div>
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
                      ❓ Questions ({questions.filter((q) => !q.answer).length} unanswered) {sections.questions ? '▲' : '▼'}
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                        onClick={() => navigate('/app/questions')}>Archive →</button>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                        onClick={() => { setInlineQuestion((prev) => ({ ...prev, [doc.id]: !inlineQuestion[doc.id] })); if (!questionForms[doc.id]?.length) setQuestionForms((p) => ({ ...p, [doc.id]: [{ text: '', priority: 'Medium' }] })) }}>
                        + Add
                      </button>
                    </div>
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
                      {questions.filter((q) => !q.answer).length === 0
                        ? <p className="muted" style={{ fontSize: '0.85rem' }}>No unanswered questions. <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => navigate('/app/questions')}>See archive →</button></p>
                        : questions.filter((q) => !q.answer).map((q) => (
                          <div key={q.id} className="list-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <strong style={{ fontSize: '0.9rem' }}>{q.question}</strong>
                              <span className="muted" style={{ fontSize: '0.8rem' }}>{q.priority ?? ''}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* DIAGNOSES — with directory */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="btn btn-ghost" style={{ fontWeight: 600, padding: '8px 0' }}
                      onClick={() => toggleSection(doc.id, 'diagnoses')}>
                      📋 Diagnoses ({diagDir.length}) {sections.diagnoses ? '▲' : '▼'}
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                        onClick={() => navigate('/app/diagnoses')}>Directory →</button>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                        onClick={() => setInlineDiagnosis((prev) => ({ ...prev, [doc.id]: !inlineDiagnosis[doc.id] }))}>
                        + Log note
                      </button>
                    </div>
                  </div>

                  {inlineDiagnosis[doc.id] && (
                    <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10, display: 'grid', gap: 8 }}>
                      {/* Existing diagnoses from directory */}
                      {diagDir.length > 0 && (
                        <div>
                          <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>Existing diagnoses for {doc.name}</label>
                          <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                            {diagDir.map((d) => {
                              const s = STATUS_OPTIONS.find((x) => x.value === d.status)
                              return (
                                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderRadius: 8, background: s?.color ?? '#f9f9f9' }}>
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
                        </div>
                      )}
                      <div className="form-group"><label>Date</label><input type="date" value={df.note_date ?? todayISO()} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, note_date: e.target.value } }))} /></div>
                      <div className="form-group"><label>Diagnoses mentioned (comma separated)</label><textarea value={df.diagnoses_mentioned ?? ''} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, diagnoses_mentioned: e.target.value } }))} placeholder="These will auto-add to your diagnoses directory as Suspected" /></div>
                      <div className="form-group"><label>Diagnoses ruled out</label><textarea value={df.diagnoses_ruled_out ?? ''} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, diagnoses_ruled_out: e.target.value } }))} /></div>
                      <div className="form-group"><label>Notes</label><textarea value={df.notes ?? ''} onChange={(e) => setDiagnosisForm((p) => ({ ...p, [doc.id]: { ...df, notes: e.target.value } }))} /></div>
                      <button type="button" className="btn btn-primary btn-block" onClick={() => saveInlineDiagnosis(doc)} disabled={busy}>Save</button>
                    </div>
                  )}

                  {sections.diagnoses && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {diagDir.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No diagnoses in directory for this doctor yet.</p>}
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
                        <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                          <p className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Diagnosis notes</p>
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
                      + Add
                    </button>
                  </div>

                  {inlineMed[doc.id] && (
                    <div style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10, display: 'grid', gap: 8 }}>
                      <div className="form-group"><label>Medication</label><input value={mf.medication ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, medication: e.target.value } }))} /></div>
                      <div className="form-row">
                        <div className="form-group"><label>Dose</label><input value={mf.dose ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, dose: e.target.value } }))} /></div>
                        <div className="form-group"><label>Frequency</label><input value={mf.frequency ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, frequency: e.target.value } }))} /></div>
                      </div>
                      <div className="form-group"><label>Purpose</label><input value={mf.purpose ?? ''} onChange={(e) => setMedForm((p) => ({ ...p, [doc.id]: { ...mf, purpose: e.target.value } }))} /></div>
                      <button type="button" className="btn btn-primary btn-block" onClick={() => saveInlineMed(doc)} disabled={busy}>Save</button>
                    </div>
                  )}

                  {sections.meds && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {meds.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No medications linked yet.</p>}
                      {meds.map((m) => (
                        <div key={m.id} className="list-item">
                          <strong>{m.medication}</strong>
                          <div className="muted" style={{ fontSize: '0.85rem' }}>{[m.dose, m.frequency].filter(Boolean).join(' · ')}{m.purpose ? ` · ${m.purpose}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* TESTS */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" className="btn btn-ghost" style={{ fontWeight: 600, padding: '8px 0' }}
                      onClick={() => toggleSection(doc.id, 'tests')}>
                      🧪 Tests & orders ({tests.length}) {sections.tests ? '▲' : '▼'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                      onClick={() => navigate('/app/tests')}>Go to tests →</button>
                  </div>

                  {sections.tests && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                      {tests.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No tests ordered yet.</p>}
                      {tests.map((t) => {
                        const statusColor = t.status === 'Completed' ? { background: '#d1fae5', color: '#065f46' } : t.status === 'Archived' ? { background: '#e5e7eb', color: '#6b7280' } : { background: '#fef3c7', color: '#92400e' }
                        return (
                          <div key={t.id} className="list-item">
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <strong>{t.test_name}</strong>
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