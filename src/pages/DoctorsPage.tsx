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

export function DoctorsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const prefillName = searchParams.get('prefill') ?? ''
  const [form, setForm] = useState({ ...emptyForm(), name: prefillName })
  const [showForm, setShowForm] = useState(!!prefillName)

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

  const [editingId, setEditingId] = useState<string | null>(null)

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
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>

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

      {/* rest of file unchanged */}
    </div>
  )
}