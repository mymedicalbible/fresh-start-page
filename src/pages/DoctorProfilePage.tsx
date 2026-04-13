import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useDoctorNoteModal } from '../contexts/DoctorNoteModalContext'
import { markAppointmentsVisitLoggedForVisitDay } from '../lib/markAppointmentsVisitLogged'
import { formatTime12h } from '../lib/formatTime12h'
import { VisitNotesWithTranscriptFold } from '../components/VisitNotesWithTranscriptFold'
import { DIAGNOSIS_STATUS_OPTIONS } from '../lib/diagnosisStatusOptions'
import {
  doctorFieldContainsRegex,
  escapePostgresRegexLiteral,
  prescribedByNotesRegex,
} from '../lib/pgRegex'


/* ──────────────── Types ──────────────── */
type Doctor = {
  id: string; name: string; specialty: string | null
  clinic: string | null; phone: string | null
  address: string | null; notes: string | null
}
type VisitRow = {
  id: string; visit_date: string; visit_time: string | null
  reason: string | null
  findings: string | null; tests_ordered: string | null
  instructions: string | null; notes: string | null; follow_up: string | null
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
  id: string; test_date: string; test_name: string; status: string; reason: string | null
}
type ProfileNoteRow = { id: string; body: string; created_at: string }


/* ──────────────── Constants ──────────────── */

function todayISO () { return new Date().toISOString().slice(0, 10) }

function initials (name: string) {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('')
}

function emptyEditForm (doc: Doctor) {
  return {
    name: doc.name, specialty: doc.specialty ?? '',
    clinic: doc.clinic ?? '', phone: doc.phone ?? '',
    address: doc.address ?? '', notes: doc.notes ?? '',
  }
}


/* ──────────────── Collapsible section header ──────────────── */
function SectionHeader ({
  icon, title, count, action, actionLabel, collapsed, onToggle,
}: {
  icon: string; title: string; count?: number
  action?: () => void; actionLabel?: string
  collapsed?: boolean; onToggle?: () => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 12, gap: 8 }}>
      <button type="button" onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: '1rem', color: 'var(--text)', textAlign: 'left', flex: 1 }}>
        {icon} {title}
        {count !== undefined && (
          <span className="muted" style={{ fontWeight: 400, fontSize: '0.82rem' }}>({count})</span>
        )}
        <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 4 }}>{collapsed ? '▼' : '▲'}</span>
      </button>
      {action && actionLabel && !collapsed && (
        <button type="button" className="btn btn-secondary"
          style={{ fontSize: '0.78rem', padding: '4px 12px', flexShrink: 0 }}
          onClick={action}>{actionLabel}</button>
      )}
    </div>
  )
}


/* ──────────────── Main component ──────────────── */
export function DoctorProfilePage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const profileReturnTo = encodeURIComponent(`${pathname}${search}`)
  const { id } = useParams<{ id: string }>()
  const { openNoteModal } = useDoctorNoteModal()

  const [doctor, setDoctor] = useState<Doctor | null>(null)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [diagnoses, setDiagnoses] = useState<DiagnosisRow[]>([])
  const [diagDir, setDiagDir] = useState<DiagDirRow[]>([])
  const [meds, setMeds] = useState<MedRow[]>([])
  const [tests, setTests] = useState<TestRow[]>([])

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  // Edit doctor form
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', specialty: '', clinic: '', phone: '', address: '', notes: '' })

  // Inline visit form
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [visitForm, setVisitForm] = useState<Record<string, string>>({})
  const [visitTests, setVisitTests] = useState([{ test_name: '', reason: '' }])
  const [visitMeds, setVisitMeds] = useState<{ medication: string; dose: string; action: 'keep' | 'remove' }[]>([])
  const [newMedEntry, setNewMedEntry] = useState({ medication: '', dose: '', frequency: '', prn: false })
  const [visitMedsIncludeAll, setVisitMedsIncludeAll] = useState(false)
  const saveVisitInFlightRef = useRef(false)

  // Inline question form
  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [questionRows, setQuestionRows] = useState([{ text: '', priority: 'Medium' }])
  const [questionFilter, setQuestionFilter] = useState<'all' | 'open' | 'answered'>('all')
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({})
  const [expandedQId, setExpandedQId] = useState<string | null>(null)

  // Inline diagnosis form
  const [showDiagForm, setShowDiagForm] = useState(false)
  const [diagForm, setDiagForm] = useState<Record<string, string>>({})

  // Inline med form
  const [showMedForm, setShowMedForm] = useState(false)
  const [medForm, setMedForm] = useState<Record<string, string>>({})

  // Section collapse
  const [colVisits, setColVisits] = useState(false)
  const [colQuestions, setColQuestions] = useState(false)
  const [colDiag, setColDiag] = useState(false)
  const [colMeds, setColMeds] = useState(false)
  const [colTests, setColTests] = useState(false)

  const [profileNotes, setProfileNotes] = useState<ProfileNoteRow[]>([])

  const mountedRef = useRef(true)
  const idRef = useRef<string | undefined>(undefined)
  idRef.current = id

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /* ──────────── Load ──────────── */
  useEffect(() => {
    if (!user || !id) return
    load()
  }, [user, id])

  useEffect(() => {
    if (!user || !id) return
    const uid = user.id
    const doctorPk = id
    async function refreshNotes () {
      const { data: pn } = await supabase
        .from('doctor_profile_notes')
        .select('id, body, created_at')
        .eq('user_id', uid)
        .eq('doctor_id', doctorPk)
        .order('created_at', { ascending: false })
        .limit(50)
      setProfileNotes((pn ?? []) as ProfileNoteRow[])
    }
    function onSaved () {
      void refreshNotes()
    }
    window.addEventListener('mb-doctor-note-saved', onSaved)
    return () => window.removeEventListener('mb-doctor-note-saved', onSaved)
  }, [user, id])


  async function load () {
    const loadForId = idRef.current
    if (!loadForId || !user) return
    setLoading(true)
    const { data: docData, error: docErr } = await supabase
      .from('doctors').select('*').eq('id', loadForId).eq('user_id', user.id).single()
    if (idRef.current !== loadForId || !mountedRef.current) {
      setLoading(false)
      return
    }
    if (docErr || !docData) {
      setLoading(false)
      navigate('/app/doctors')
      return
    }
    const doc = docData as Doctor
    setDoctor(doc)
    setEditForm(emptyEditForm(doc))
    await loadData(doc.name)
    if (idRef.current !== loadForId || !mountedRef.current) {
      setLoading(false)
      return
    }
    const { data: pn } = await supabase
      .from('doctor_profile_notes')
      .select('id, body, created_at')
      .eq('user_id', user.id)
      .eq('doctor_id', doc.id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (idRef.current !== loadForId || !mountedRef.current) {
      setLoading(false)
      return
    }
    setProfileNotes((pn ?? []) as ProfileNoteRow[])
    setLoading(false)
  }


  async function loadData (doctorName: string, medsAllForVisit = visitMedsIncludeAll) {
    const docContains = doctorFieldContainsRegex(doctorName)
    const prescribedRx = prescribedByNotesRegex(doctorName)
    const mVisitQ = medsAllForVisit
      ? supabase.from('current_medications')
        .select('id, medication, dose, frequency, purpose')
        .eq('user_id', user!.id)
        .order('medication', { ascending: true })
        .limit(200)
      : supabase.from('current_medications')
        .select('id, medication, dose, frequency, purpose')
        .eq('user_id', user!.id)
        .regexIMatch('notes', prescribedRx)
        .limit(60)

    const [v, q, d, dd, m, t, mVisit] = await Promise.all([
      supabase.from('doctor_visits')
        .select('id, visit_date, visit_time, reason, findings, tests_ordered, instructions, notes, follow_up')
        .eq('user_id', user!.id).regexIMatch('doctor', docContains)
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('doctor_questions')
        .select('id, date_created, appointment_date, question, priority, answer, status')
        .eq('user_id', user!.id).regexIMatch('doctor', docContains)
        .order('date_created', { ascending: false }).limit(100),
      supabase.from('diagnosis_notes')
        .select('id, note_date, diagnoses_mentioned, diagnoses_ruled_out, notes')
        .eq('user_id', user!.id).regexIMatch('doctor', docContains)
        .order('note_date', { ascending: false }).limit(50),
      supabase.from('diagnoses_directory')
        .select('id, diagnosis, status, date_diagnosed')
        .eq('user_id', user!.id).regexIMatch('doctor', docContains)
        .order('created_at', { ascending: false }),
      supabase.from('current_medications')
        .select('id, medication, dose, frequency, purpose')
        .eq('user_id', user!.id).regexIMatch('notes', docContains).limit(30),
      supabase.from('tests_ordered')
        .select('id, test_date, test_name, status, reason')
        .eq('user_id', user!.id).regexIMatch('doctor', docContains)
        .order('test_date', { ascending: false }).limit(60),
      mVisitQ,
    ])
    setVisits((v.data ?? []) as VisitRow[])
    setQuestions((q.data ?? []) as QuestionRow[])
    setDiagnoses((d.data ?? []) as DiagnosisRow[])
    setDiagDir((dd.data ?? []) as DiagDirRow[])
    setMeds((m.data ?? []) as MedRow[])
    setTests((t.data ?? []) as TestRow[])
    setVisitMeds(
      ((mVisit.data ?? []) as MedRow[]).map((med) => ({
        medication: med.medication, dose: med.dose ?? '', action: 'keep' as const,
      }))
    )
  }


  function flash (msg: string) {
    setBanner(msg)
    setTimeout(() => setBanner(null), 3500)
  }


  /* ──────────── Save doctor edit ──────────── */
  async function saveEdit () {
    if (!editForm.name.trim()) { setError('Name is required.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('doctors').update({
      name: editForm.name.trim(), specialty: editForm.specialty || null,
      clinic: editForm.clinic || null, phone: editForm.phone || null,
      address: editForm.address || null, notes: editForm.notes || null,
    }).eq('id', id!)
    setBusy(false)
    if (e) { setError(e.message); return }
    setShowEdit(false)
    await load()
  }


  /* ──────────── Save visit ──────────── */
  async function saveVisit () {
    if (!visitForm.visit_date) { setError('Visit date is required.'); return }
    if (!doctor) return
    if (saveVisitInFlightRef.current) return
    saveVisitInFlightRef.current = true
    const validTests = visitTests.filter((t) => t.test_name.trim())
    setBusy(true)
    try {
      const { error: ve } = await supabase.from('doctor_visits').insert({
        user_id: user!.id, visit_date: visitForm.visit_date,
        visit_time: visitForm.visit_time || null, doctor: doctor.name,
        specialty: doctor.specialty || null,
        reason: visitForm.reason || null, findings: visitForm.findings || null,
        tests_ordered: validTests.map((t) => t.test_name).join(', ') || null,
        instructions: visitForm.instructions || null,
        follow_up: visitForm.next_appt_date || null,
        notes: visitForm.notes || null, status: 'complete',
      })
      if (ve) { setError(ve.message); return }

      await markAppointmentsVisitLoggedForVisitDay(
        supabase,
        user!.id,
        visitForm.visit_date,
        doctor.name,
      )

      if (validTests.length > 0) {
        await supabase.from('tests_ordered').insert(
          validTests.map((t) => ({
            user_id: user!.id, test_date: visitForm.visit_date,
            doctor: doctor.name, test_name: t.test_name,
            reason: t.reason || null, status: 'Pending',
          }))
        )
      }
      if (visitForm.next_appt_date) {
        await supabase.from('appointments').insert({
          user_id: user!.id, doctor: doctor.name,
          specialty: doctor.specialty || null,
          appointment_date: visitForm.next_appt_date,
          appointment_time: visitForm.next_appt_time || null,
        })
      }
      for (const m of visitMeds) {
        if (m.action === 'remove') {
          await supabase.from('current_medications')
            .delete().eq('user_id', user!.id).eq('medication', m.medication)
        }
      }
      if (newMedEntry.medication.trim()) {
        await supabase.from('current_medications').upsert({
          user_id: user!.id, medication: newMedEntry.medication.trim(),
          dose: newMedEntry.dose || null,
          frequency: newMedEntry.prn ? 'As needed' : (newMedEntry.frequency.trim() || null),
          notes: `Prescribed by: ${doctor.name}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,medication' })
      }
      setShowVisitForm(false)
      setVisitForm({})
      setVisitTests([{ test_name: '', reason: '' }])
      setNewMedEntry({ medication: '', dose: '', frequency: '', prn: false })
      flash('Visit saved.')
      await loadData(doctor.name)
    } finally {
      saveVisitInFlightRef.current = false
      setBusy(false)
    }
  }


  /* ──────────── Save questions ──────────── */
  async function saveQuestions () {
    if (!doctor) return
    const valid = questionRows.filter((q) => q.text.trim())
    if (valid.length === 0) { setError('Enter at least one question.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('doctor_questions').insert(
      valid.map((q) => ({
        user_id: user!.id, date_created: todayISO(),
        doctor: doctor.name, question: q.text.trim(),
        priority: q.priority, status: 'Unanswered', answer: null,
      }))
    )
    setBusy(false)
    if (e) { setError(e.message); return }
    setShowQuestionForm(false)
    setQuestionRows([{ text: '', priority: 'Medium' }])
    flash('Question(s) saved.')
    await loadData(doctor.name)
  }


  /* ──────────── Save answer ──────────── */
  async function saveAnswer (questionId: string) {
    const answer = answerDraft[questionId] ?? ''
    if (!answer.trim()) return
    const { error: e } = await supabase.from('doctor_questions')
      .update({ answer: answer.trim(), status: 'Answered' }).eq('id', questionId)
    if (e) { setError(e.message); return }
    setQuestions((prev) => prev.map((q) =>
      q.id === questionId ? { ...q, answer: answer.trim(), status: 'Answered' } : q
    ))
    setAnswerDraft((prev) => { const n = { ...prev }; delete n[questionId]; return n })
  }


  /* ──────────── Save diagnosis ──────────── */
  async function saveDiagnosis () {
    if (!doctor) return
    setBusy(true)
    const { error: e } = await supabase.from('diagnosis_notes').insert({
      user_id: user!.id, note_date: diagForm.note_date || todayISO(),
      doctor: doctor.name,
      diagnoses_mentioned: diagForm.diagnoses_mentioned || null,
      diagnoses_ruled_out: diagForm.diagnoses_ruled_out || null,
      notes: diagForm.notes || null,
    })
    if (!e && diagForm.diagnoses_mentioned?.trim()) {
      const diags = diagForm.diagnoses_mentioned.split(',').map((d) => d.trim()).filter(Boolean)
      for (const diag of diags) {
        const { data: existing } = await supabase.from('diagnoses_directory')
          .select('id, doctor').eq('user_id', user!.id)
          .regexIMatch('diagnosis', `^${escapePostgresRegexLiteral(diag)}$`)
          .limit(1)
        if (!existing || existing.length === 0) {
          await supabase.from('diagnoses_directory').insert({
            user_id: user!.id, diagnosis: diag, doctor: doctor.name,
            date_diagnosed: diagForm.note_date || todayISO(), status: 'Suspected',
          })
        } else if (!existing[0].doctor) {
          await supabase.from('diagnoses_directory')
            .update({ doctor: doctor.name })
            .eq('id', existing[0].id)
        }
      }
    }
    if (!e && diagForm.diagnoses_ruled_out?.trim()) {
      const diags = diagForm.diagnoses_ruled_out.split(',').map((d) => d.trim()).filter(Boolean)
      for (const diag of diags) {
        const { data: existing } = await supabase.from('diagnoses_directory')
          .select('id, doctor').eq('user_id', user!.id)
          .regexIMatch('diagnosis', `^${escapePostgresRegexLiteral(diag)}$`)
          .limit(1)
        if (!existing || existing.length === 0) {
          await supabase.from('diagnoses_directory').insert({
            user_id: user!.id, diagnosis: diag, doctor: doctor.name,
            date_diagnosed: diagForm.note_date || todayISO(), status: 'Ruled Out',
          })
        } else {
          await supabase.from('diagnoses_directory')
            .update({ status: 'Ruled Out', ...(!existing[0].doctor ? { doctor: doctor.name } : {}) })
            .eq('id', existing[0].id)
        }
      }
    }
    setBusy(false)
    if (e) { setError(e.message); return }
    setShowDiagForm(false)
    setDiagForm({})
    flash('Diagnosis note saved.')
    await loadData(doctor.name)
  }


  /* ──────────── Update diag status ──────────── */
  async function updateDiagStatus (diagId: string, status: string) {
    const { error: ue } = await supabase.from('diagnoses_directory').update({ status }).eq('id', diagId)
    if (ue) {
      setError(ue.message)
      return
    }
    setDiagDir((prev) => prev.map((d) => d.id === diagId ? { ...d, status } : d))
  }


  /* ──────────── Save medication ──────────── */
  async function saveMed () {
    if (!doctor) return
    if (!medForm.medication?.trim()) { setError('Medication name is required.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('current_medications').upsert({
      user_id: user!.id, medication: medForm.medication.trim(),
      dose: medForm.dose || null, frequency: medForm.frequency || null,
      purpose: medForm.purpose || null,
      notes: `Prescribed by: ${doctor.name}`,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,medication' })
    setBusy(false)
    if (e) { setError(e.message); return }
    setShowMedForm(false)
    setMedForm({})
    flash('Medication saved.')
    await loadData(doctor.name)
  }


  /* ──────────── Render ──────────── */
  if (!user) return null
  if (loading) return <div style={{ padding: 24 }} className="muted">Loading…</div>
  if (!doctor) return null

  const filteredQ = questions.filter((q) => {
    const open = !q.answer?.trim()
    if (questionFilter === 'open') return open
    if (questionFilter === 'answered') return !open
    return true
  })
  const openCount = questions.filter((q) => !q.answer?.trim()).length


  return (
    <div style={{ paddingBottom: 60 }}>
      {/* NAV */}
      <BackButton label="My Doctors" fallbackTo="/app/doctors" />
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}


      {/* ── DOCTOR HEADER ── */}
      <div className="card">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#e8f0e0', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem',
            color: '#4a7a32', flexShrink: 0,
          }}>
            {initials(doctor.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>{doctor.name}</div>
            <div className="muted" style={{ fontSize: '0.88rem', marginTop: 2 }}>
              <span style={{ fontWeight: 600 }}>Specialty:</span>{' '}
              {doctor.specialty?.trim() || '—'}
              {doctor.clinic ? ` · ${doctor.clinic}` : ''}
            </div>
            {doctor.phone && (
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                <a href={`tel:${doctor.phone.replace(/\s/g, '')}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                  📞 {doctor.phone}
                </a>
              </div>
            )}
            {doctor.address && (
              <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(doctor.address)}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  📍 {doctor.address}
                </a>
              </div>
            )}
            {doctor.notes && (
              <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4, fontStyle: 'italic' }}>{doctor.notes}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button type="button" className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '4px 10px', whiteSpace: 'nowrap' }}
              onClick={() => openNoteModal({ doctorId: doctor.id })}>
              Log a note
            </button>
            <button type="button" className="btn btn-ghost"
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              onClick={() => setShowEdit((v) => !v)}>
              {showEdit ? 'Cancel' : 'Edit'}
            </button>
          </div>
        </div>

        {showEdit && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16, display: 'grid', gap: 10 }}>
            <div className="form-group"><label>Name</label>
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group"><label>Specialty</label>
                <input value={editForm.specialty} onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })} placeholder="Rheumatology" />
              </div>
              <div className="form-group"><label>Clinic</label>
                <input value={editForm.clinic} onChange={(e) => setEditForm({ ...editForm, clinic: e.target.value })} placeholder="UCLA Medical" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Phone</label>
                <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="form-group"><label>Address</label>
                <input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
            </div>
            <div className="form-group"><label>Notes</label>
              <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" onClick={saveEdit} disabled={busy}>Save changes</button>
          </div>
        )}
      </div>

      {profileNotes.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Notes you saved</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', listStyleType: 'none', display: 'grid', gap: 12 }}>
            {profileNotes.map((n) => (
              <li
                key={n.id}
                style={{
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 10,
                  listStyle: 'none',
                  listStyleType: 'none',
                }}
              >
                <div className="muted" style={{ fontSize: '0.75rem', marginBottom: 4 }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{n.body}</div>
              </li>
            ))}
          </ul>
        </div>
      )}


      {/* ── VISITS ── */}
      <div className="card">
        <SectionHeader
          icon="🏥" title="Visits" count={visits.length}
          collapsed={colVisits} onToggle={() => setColVisits((v) => !v)}
          action={() => setShowVisitForm((v) => !v)}
          actionLabel={showVisitForm ? 'Cancel' : '+ Log visit'}
        />

        {!colVisits && showVisitForm && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, marginBottom: 14, display: 'grid', gap: 10 }}>
            <div className="form-row">
              <div className="form-group"><label>Date *</label>
                <input type="date" value={visitForm.visit_date ?? todayISO()}
                  onChange={(e) => setVisitForm({ ...visitForm, visit_date: e.target.value })} />
              </div>
              <div className="form-group"><label>Time</label>
                <input type="time" value={visitForm.visit_time ?? ''}
                  onChange={(e) => setVisitForm({ ...visitForm, visit_time: e.target.value })} />
              </div>
            </div>
            <div className="form-group"><label>Reason</label>
              <textarea value={visitForm.reason ?? ''} onChange={(e) => setVisitForm({ ...visitForm, reason: e.target.value })} />
            </div>
            <div className="form-group"><label>Findings / notes from doctor</label>
              <textarea value={visitForm.findings ?? ''} onChange={(e) => setVisitForm({ ...visitForm, findings: e.target.value })} />
            </div>
            <div className="form-group"><label>Instructions from doctor</label>
              <textarea value={visitForm.instructions ?? ''} onChange={(e) => setVisitForm({ ...visitForm, instructions: e.target.value })} placeholder="e.g. Continue current meds, follow up if worse…" />
            </div>
            <div className="form-group">
              <label>Tests / orders</label>
              {visitTests.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input style={{ flex: 2 }} value={t.test_name} placeholder="Test name"
                    onChange={(e) => setVisitTests((p) => p.map((x, idx) => idx === i ? { ...x, test_name: e.target.value } : x))} />
                  <input style={{ flex: 2 }} value={t.reason} placeholder="Reason (optional)"
                    onChange={(e) => setVisitTests((p) => p.map((x, idx) => idx === i ? { ...x, reason: e.target.value } : x))} />
                  {visitTests.length > 1 && (
                    <button type="button" className="btn btn-ghost" style={{ color: 'red' }}
                      onClick={() => setVisitTests((p) => p.filter((_, idx) => idx !== i))}>✕</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }}
                onClick={() => setVisitTests((p) => [...p, { test_name: '', reason: '' }])}>+ Add test</button>
            </div>
            <div className="form-group">
              <label>Current medications</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 400, marginBottom: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={visitMedsIncludeAll}
                  onChange={(e) => {
                    const next = e.target.checked
                    setVisitMedsIncludeAll(next)
                    if (doctor) void loadData(doctor.name, next)
                  }}
                />
                Show all my medications (not only those tagged for this provider)
              </label>
              {visitMeds.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.85rem' }}>{m.medication}{m.dose ? ` · ${m.dose}` : ''}</span>
                  <button type="button" className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', color: m.action === 'remove' ? 'red' : '#888' }}
                    onClick={() => setVisitMeds((p) => p.map((x, idx) => idx === i ? { ...x, action: x.action === 'remove' ? 'keep' : 'remove' } : x))}>
                    {m.action === 'remove' ? 'Undo' : 'Remove'}
                  </button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <input style={{ flex: '2 1 130px' }} value={newMedEntry.medication} placeholder="New medication name"
                  onChange={(e) => setNewMedEntry((p) => ({ ...p, medication: e.target.value }))} />
                <input style={{ flex: '1 1 80px' }} value={newMedEntry.dose} placeholder="Dose"
                  onChange={(e) => setNewMedEntry((p) => ({ ...p, dose: e.target.value }))} />
              </div>
              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>Schedule</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn ${!newMedEntry.prn ? 'btn-mint' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    onClick={() => setNewMedEntry((p) => ({
                      ...p,
                      prn: false,
                      frequency: p.frequency === 'As needed' ? '' : p.frequency,
                    }))}
                  >
                    Scheduled
                  </button>
                  <button
                    type="button"
                    className={`btn ${newMedEntry.prn ? 'btn-sky' : 'btn-secondary'}`}
                    style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                    onClick={() => setNewMedEntry((p) => ({ ...p, prn: true, frequency: 'As needed' }))}
                  >
                    PRN / as needed
                  </button>
                </div>
                {!newMedEntry.prn && (
                  <input
                    style={{ width: '100%' }}
                    placeholder="e.g. Twice daily, at bedtime"
                    value={newMedEntry.frequency}
                    onChange={(e) => setNewMedEntry((p) => ({ ...p, frequency: e.target.value }))}
                  />
                )}
              </div>
            </div>
            <div className="form-group"><label>Notes</label>
              <textarea value={visitForm.notes ?? ''} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Next appointment</label>
              <div className="form-row">
                <div className="form-group">
                  <input type="date" value={visitForm.next_appt_date ?? ''}
                    onChange={(e) => setVisitForm({ ...visitForm, next_appt_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <input type="time" value={visitForm.next_appt_time ?? ''}
                    onChange={(e) => setVisitForm({ ...visitForm, next_appt_time: e.target.value })} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-primary" onClick={saveVisit} disabled={busy}>Save visit</button>
              <Link
                to={`/app/visits?new=1&doctor=${encodeURIComponent(doctor.name)}&returnTo=${profileReturnTo}`}
                className="btn btn-secondary" style={{ textDecoration: 'none', fontSize: '0.85rem' }}
              >
                Guided wizard →
              </Link>
            </div>
          </div>
        )}

        {!colVisits && (<>
          {visits.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No visits logged yet.</p>}
          <div style={{ display: 'grid', gap: 8 }}>
            {visits.map((v) => {
              const testsForVisit = tests.filter((t) => t.test_date === v.visit_date)
              return (
                <div key={v.id} className="list-item">
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                    {v.visit_date}{v.visit_time ? ` · ${formatTime12h(v.visit_time)}` : ''}
                  </div>
                  {v.reason && <div className="muted" style={{ fontSize: '0.85rem' }}>Reason: {v.reason}</div>}
                  {v.findings && <div className="muted" style={{ fontSize: '0.85rem' }}>Findings: {v.findings}</div>}
                  {v.tests_ordered && <div className="muted" style={{ fontSize: '0.85rem' }}>Tests: {v.tests_ordered}</div>}
                  {testsForVisit.length > 0 && (
                    <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                      <div style={{ fontWeight: 600 }}>Tests & orders (detail)</div>
                      <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', listStyleType: 'none' }}>
                        {testsForVisit.map((t) => (
                          <li
                            key={t.id}
                            style={{ paddingLeft: 18, listStyle: 'none', listStyleType: 'none' }}
                          >
                            {t.test_name}
                            {t.reason ? ` — ${t.reason}` : ''}
                            <span className="muted"> ({t.status})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {v.instructions && <div className="muted" style={{ fontSize: '0.85rem' }}>Instructions: {v.instructions}</div>}
                  {v.follow_up && <div className="muted" style={{ fontSize: '0.85rem' }}>Follow-up: {v.follow_up}</div>}
                  <VisitNotesWithTranscriptFold notes={v.notes} />
                </div>
              )
            })}
          </div>
        </>)}
      </div>


      {/* ── QUESTIONS ── */}
      <div className="card">
        <SectionHeader
          icon="❓" title="Questions"
          count={openCount > 0 ? openCount : questions.length}
          collapsed={colQuestions} onToggle={() => setColQuestions((v) => !v)}
          action={() => {
            setShowQuestionForm((v) => !v)
            if (!showQuestionForm) setQuestionRows([{ text: '', priority: 'Medium' }])
          }}
          actionLabel={showQuestionForm ? 'Cancel' : '+ Add question'}
        />

        {!colQuestions && showQuestionForm && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, marginBottom: 14, display: 'grid', gap: 10 }}>
            {questionRows.map((q, i) => (
              <div key={i} style={{ display: 'grid', gap: 6 }}>
                <textarea value={q.text}
                  placeholder="e.g. Why is my pain worse at night? Should we adjust the dose?"
                  onChange={(e) => setQuestionRows((p) => p.map((qq, ii) => ii === i ? { ...qq, text: e.target.value } : qq))} />
                <select value={q.priority}
                  onChange={(e) => setQuestionRows((p) => p.map((qq, ii) => ii === i ? { ...qq, priority: e.target.value } : qq))}>
                  <option value="High">🔴 High</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="Low">🟢 Low</option>
                </select>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.82rem' }}
              onClick={() => setQuestionRows((p) => [...p, { text: '', priority: 'Medium' }])}>
              + Add another
            </button>
            <button type="button" className="btn btn-primary" onClick={saveQuestions} disabled={busy}>
              Save question{questionRows.length > 1 ? 's' : ''}
            </button>
          </div>
        )}

        {!colQuestions && (<>
        {/* Filter tabs */}
        {questions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['all', 'open', 'answered'] as const).map((f) => (
              <button key={f} type="button"
                className={`btn ${questionFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.78rem', padding: '3px 12px' }}
                onClick={() => setQuestionFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'open' && openCount > 0 && (
                  <span style={{ marginLeft: 5, background: '#f59e0b', color: '#fff', borderRadius: 20, padding: '0 5px', fontSize: '0.7rem' }}>
                    {openCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {filteredQ.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No questions{questionFilter !== 'all' ? ` in this filter` : ''} yet.</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {filteredQ.map((q) => {
            const isOpen = !q.answer?.trim()
            const isExpanded = expandedQId === q.id
            return (
              <div key={q.id} className="list-item" style={{ padding: 0, overflow: 'hidden' }}>
                <div
                  style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}
                  onClick={() => setExpandedQId(isExpanded ? null : q.id)}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{q.question}</div>
                    <div className="muted" style={{ fontSize: '0.8rem', marginTop: 3 }}>
                      {q.date_created}{q.priority ? ` · ${q.priority}` : ''}
                    </div>
                    <span style={{
                      fontSize: '0.72rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, marginTop: 5, display: 'inline-block',
                      ...(isOpen ? { background: '#fef3c7', color: '#92400e' } : { background: '#d1fae5', color: '#065f46' }),
                    }}>{isOpen ? 'Open' : 'Answered'}</span>
                  </div>
                  <span style={{ color: '#aaa', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'grid', gap: 10 }}>
                    {q.answer && (
                      <div>
                        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '0.88rem' }}>Answer</div>
                        <div className="muted" style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>{q.answer}</div>
                      </div>
                    )}
                    {isOpen && (
                      <>
                        <textarea
                          placeholder="Record the doctor's answer…"
                          value={answerDraft[q.id] ?? ''}
                          onChange={(e) => setAnswerDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                          style={{ minHeight: 72 }}
                        />
                        <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: '0.82rem' }}
                          onClick={() => saveAnswer(q.id)}>Save answer</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </>)}
      </div>


      {/* ── DIAGNOSES ── */}
      <div className="card">
        <SectionHeader
          icon="📋" title="Diagnoses" count={diagDir.length}
          collapsed={colDiag} onToggle={() => setColDiag((v) => !v)}
          action={() => setShowDiagForm((v) => !v)}
          actionLabel={showDiagForm ? 'Cancel' : '+ Log note'}
        />

        {!colDiag && showDiagForm && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, marginBottom: 14, display: 'grid', gap: 10 }}>
            {diagDir.length > 0 && (
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 8, color: '#555' }}>Existing diagnoses</div>
                {diagDir.map((d) => {
                  const s = DIAGNOSIS_STATUS_OPTIONS.find((x) => x.value === d.status)
                  return (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: 8, background: s?.color ?? '#f9f9f9', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: s?.text }}>{d.diagnosis}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {DIAGNOSIS_STATUS_OPTIONS.filter((x) => x.value !== d.status).map((x) => (
                          <button key={x.value} type="button" className="btn btn-ghost"
                            style={{ fontSize: '0.7rem', padding: '2px 6px', background: x.color, color: x.text }}
                            onClick={() => updateDiagStatus(d.id, x.value)}>{x.value}</button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="form-group"><label>Date</label>
              <input type="date" value={diagForm.note_date ?? todayISO()}
                onChange={(e) => setDiagForm({ ...diagForm, note_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Diagnoses mentioned <span className="muted" style={{ fontWeight: 400 }}>(comma-separated)</span></label>
              <textarea value={diagForm.diagnoses_mentioned ?? ''}
                onChange={(e) => setDiagForm({ ...diagForm, diagnoses_mentioned: e.target.value })}
                placeholder="Auto-adds to directory as Suspected" />
            </div>
            <div className="form-group"><label>Diagnoses ruled out</label>
              <textarea value={diagForm.diagnoses_ruled_out ?? ''}
                onChange={(e) => setDiagForm({ ...diagForm, diagnoses_ruled_out: e.target.value })} />
            </div>
            <div className="form-group"><label>Notes</label>
              <textarea value={diagForm.notes ?? ''} onChange={(e) => setDiagForm({ ...diagForm, notes: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" onClick={saveDiagnosis} disabled={busy}>Save note</button>
          </div>
        )}

        {!colDiag && (<>
        {diagDir.length === 0 && diagnoses.length === 0 && (
          <p className="muted" style={{ fontSize: '0.85rem' }}>No diagnoses logged for this doctor yet.</p>
        )}

        {/* Diagnosis directory */}
        {diagDir.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginBottom: diagnoses.length > 0 ? 16 : 0 }}>
            {diagDir.map((d) => {
              const s = DIAGNOSIS_STATUS_OPTIONS.find((x) => x.value === d.status)
              return (
                <div key={d.id} style={{ padding: '10px 12px', borderRadius: 10, background: s?.color ?? '#f9f9f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ color: s?.text }}>{d.diagnosis}</strong>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: s?.text }}>{d.status}</span>
                  </div>
                  {d.date_diagnosed && <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>Since: {d.date_diagnosed}</div>}
                  <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                    {DIAGNOSIS_STATUS_OPTIONS.filter((x) => x.value !== d.status).map((x) => (
                      <button key={x.value} type="button" className="btn btn-ghost"
                        style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#fff', color: x.text, border: `1px solid ${x.color}` }}
                        onClick={() => updateDiagStatus(d.id, x.value)}>{x.label}</button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Diagnosis notes */}
        {diagnoses.length > 0 && (
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#888', marginBottom: 8 }}>Diagnosis notes</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {diagnoses.map((d) => (
                <div key={d.id} className="list-item">
                  <strong style={{ fontSize: '0.88rem' }}>{d.note_date}</strong>
                  {d.diagnoses_mentioned && <div className="muted" style={{ fontSize: '0.84rem' }}>Mentioned: {d.diagnoses_mentioned}</div>}
                  {d.diagnoses_ruled_out && <div className="muted" style={{ fontSize: '0.84rem' }}>Ruled out: {d.diagnoses_ruled_out}</div>}
                  {d.notes && <div className="muted" style={{ fontSize: '0.84rem' }}>Notes: {d.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}
      </div>


      {/* ── MEDICATIONS ── */}
      <div className="card">
        <SectionHeader
          icon="💊" title="Medications" count={meds.length}
          collapsed={colMeds} onToggle={() => setColMeds((v) => !v)}
          action={() => setShowMedForm((v) => !v)}
          actionLabel={showMedForm ? 'Cancel' : '+ Add medication'}
        />

        {!colMeds && showMedForm && (
          <div style={{ background: '#f9fafb', borderRadius: 10, padding: 14, marginBottom: 14, display: 'grid', gap: 10 }}>
            <div className="form-group"><label>Medication *</label>
              <input value={medForm.medication ?? ''} placeholder="e.g. Gabapentin"
                onChange={(e) => setMedForm({ ...medForm, medication: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group"><label>Dose</label>
                <input value={medForm.dose ?? ''} placeholder="300 mg"
                  onChange={(e) => setMedForm({ ...medForm, dose: e.target.value })} />
              </div>
              <div className="form-group"><label>Frequency</label>
                <input value={medForm.frequency ?? ''} placeholder="Twice daily"
                  onChange={(e) => setMedForm({ ...medForm, frequency: e.target.value })} />
              </div>
            </div>
            <div className="form-group"><label>Purpose</label>
              <input value={medForm.purpose ?? ''} placeholder="Nerve pain"
                onChange={(e) => setMedForm({ ...medForm, purpose: e.target.value })} />
            </div>
            <button type="button" className="btn btn-primary" onClick={saveMed} disabled={busy}>Save medication</button>
          </div>
        )}

        {!colMeds && (<>
          {meds.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No medications linked to this doctor yet.</p>}
          <div style={{ display: 'grid', gap: 8 }}>
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
          <Link to="/app/meds" className="muted" style={{ fontSize: '0.82rem', display: 'block', marginTop: 10 }}>
            → All medications
          </Link>
        </>)}
      </div>


      {/* ── TESTS ── */}
      <div className="card">
        <SectionHeader icon="🧪" title="Tests & Orders" count={tests.length}
          collapsed={colTests} onToggle={() => setColTests((v) => !v)} />
        {!colTests && (<>
        {tests.length === 0 && <p className="muted" style={{ fontSize: '0.85rem' }}>No tests ordered by this doctor yet.</p>}
        <div style={{ display: 'grid', gap: 8 }}>
          {tests.map((t) => {
            const sc = t.status === 'Completed' || t.status === 'Archived'
              ? { background: '#d1fae5', color: '#065f46' }
              : { background: '#fef3c7', color: '#92400e' }
            return (
              <div key={t.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.9rem' }}>{t.test_name}</strong>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, ...sc }}>{t.status}</span>
                </div>
                <div className="muted" style={{ fontSize: '0.83rem' }}>{t.test_date}</div>
              </div>
            )
          })}
        </div>
        <Link to="/app/tests" className="muted" style={{ fontSize: '0.82rem', display: 'block', marginTop: 10 }}>
          → All tests & orders
        </Link>
        </>)}
      </div>
    </div>
  )
}
