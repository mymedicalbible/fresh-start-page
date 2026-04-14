import { useEffect, useMemo, useState, useRef, useCallback, forwardRef, useImperativeHandle, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ensureDoctorProfile } from '../lib/ensureDoctorProfile'
import { priorityButtonStyles } from '../lib/priorityQuickLog'
import {
  deleteVisitDocument,
  listVisitDocuments,
  uploadVisitDocument,
  type VisitDocItem,
} from '../lib/visitDocsStorage'
import { LeaveLaterDialog } from './LeaveLaterDialog'
import { LeaveHomeConfirmDialog } from './LeaveHomeConfirmDialog'
import { SaveLogOptionsDialog } from './SaveLogOptionsDialog'
import {
  clearVisitWizardDraft,
  loadVisitWizardDraft,
  saveVisitWizardDraft,
  type VisitWizardDraftV1,
} from '../lib/visitWizardDraft'
import { markAppointmentsVisitLoggedForVisitDay } from '../lib/markAppointmentsVisitLogged'
import { AppConfirmDialog } from './AppConfirmDialog'
import { normalizeExtractedFields, type ExtractedVisitFields } from '../lib/transcriptExtract'
import {
  DIAGNOSIS_STATUS_OPTIONS,
  type DiagnosisDirectoryStatus,
} from '../lib/diagnosisStatusOptions'
import {
  dedupeDiagnosisRows,
  emptyDiagnosisDraftRow,
  normalizeDiagnosisDraftRow,
  type DiagnosisDirectoryDetailFields,
} from '../lib/diagnosisDirectoryRow'
import { upsertDiagnosesFromVisit } from '../lib/diagnosisDirectoryFromVisit'
import { DiagnosisDetailFields } from './DiagnosisDetailFields'
import { splitDoseFrequencyFromCombined } from '../lib/medDoseParse'
import { gameTokensEnabled, grantTranscriptVisitTokens } from '../lib/gameTokens'
import { buildClinicalNotesSupplement } from '../lib/transcriptVisitFormat'
import { formatTime12h, formatVisitDateLong } from '../lib/formatTime12h'

type DoctorRow = { id: string; name: string; specialty: string | null }

type Props = {
  resumeVisitId?: string | null
  initialDoctorName?: string
  initialSpecialty?: string
  onDone?: () => void
}

export type VisitLogWizardRef = {
  requestLeave: () => void
}

function draftLooksMeaningful (d: VisitWizardDraftV1) {
  if (d.visitId) return true
  if (d.step >= 2) return true
  return !!(
    d.reason.trim() ||
    d.newDoctorName.trim() ||
    d.selectedName.trim() ||
    d.specialty.trim() ||
    d.findings.trim() ||
    d.instructions.trim() ||
    d.notes.trim() ||
    d.nextApptDate.trim() ||
    d.dvTests.some((t) => t.test_name.trim() || t.reason.trim()) ||
    (d.dvDiagnoses?.some((x) => x.diagnosis.trim()) ?? false) ||
    d.dvMeds.length > 0 ||
    d.newMedEntry.medication.trim()
  )
}

function todayISO () { return new Date().toISOString().slice(0, 10) }
function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

type QuestionLine = { text: string; priority: string }

function normPin (s: string) {
  return s
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

const DEFAULT_VISIT_REASON_PILLS = ['Follow-up', 'New or worsening symptoms', 'Medication or prescription']
const PINNED_VISIT_REASONS_KEY = 'mb-pinned-visit-reasons-v2'

/** Cohesive with form text across the app */
const WIZARD_TX: CSSProperties = { width: '100%', fontSize: '0.88rem', lineHeight: 1.45 }
/** Same typography as WIZARD_TX for inputs in flex rows (no forced full width). */
const WIZARD_TX_INLINE: CSSProperties = { fontSize: '0.88rem', lineHeight: 1.45, minWidth: 0 }

function isPlaceholderTranscriptDoctorName (name: string) {
  return /^visit\s*\(from transcript\)$/i.test(name.trim())
}

export const VisitLogWizard = forwardRef<VisitLogWizardRef, Props>(function VisitLogWizard ({
  resumeVisitId,
  initialDoctorName = '',
  initialSpecialty = '',
  onDone,
}, ref) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [doctors, setDoctors] = useState<DoctorRow[]>([])
  const [visitId, setVisitId] = useState<string | null>(resumeVisitId ?? null)
  const [pinnedReasons, setPinnedReasons] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(PINNED_VISIT_REASONS_KEY) ?? '[]') } catch { return [] }
  })

  const [visitDate, setVisitDate] = useState(todayISO())
  const [visitTime, setVisitTime] = useState(nowTime())
  const [doctorMode, setDoctorMode] = useState<'pick' | 'new'>(initialDoctorName ? 'new' : 'pick')
  const [selectedName, setSelectedName] = useState('')
  const [newDoctorName, setNewDoctorName] = useState(initialDoctorName)
  const [specialty, setSpecialty] = useState(initialSpecialty)
  const [reason, setReason] = useState('')

  const [questionLines, setQuestionLines] = useState<QuestionLine[]>([{ text: '', priority: 'Medium' }])
  const [pendingVisitFiles, setPendingVisitFiles] = useState<File[]>([])
  const [visitDocList, setVisitDocList] = useState<VisitDocItem[]>([])
  const [visitDocBusy, setVisitDocBusy] = useState(false)
  const visitFileInputRef = useRef<HTMLInputElement>(null)

  const [dvTests, setDvTests] = useState([{ test_name: '', reason: '' }])
  const [dvDiagnoses, setDvDiagnoses] = useState<DiagnosisDirectoryDetailFields[]>([])
  const [newMedEntry, setNewMedEntry] = useState({ medication: '', dose: '', frequency: '', prn: false })
  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string; action: 'keep' | 'remove' }[]>([])
  const [findings, setFindings] = useState('')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')
  const [nextApptDate, setNextApptDate] = useState('')
  const [nextApptTime, setNextApptTime] = useState('')
  const [nextApptEndTime, setNextApptEndTime] = useState('')

  const [openTests, setOpenTests] = useState(false)
  const [openDiagnoses, setOpenDiagnoses] = useState(false)
  const [openMeds, setOpenMeds] = useState(false)
  const [openClinical, setOpenClinical] = useState(false)
  const [openDocs, setOpenDocs] = useState(false)
  const [openNextAppt, setOpenNextAppt] = useState(false)

  const [resumePrompt, setResumePrompt] = useState(false)
  const [cancelLeaveOpen, setCancelLeaveOpen] = useState(false)
  const [saveOptionsOpen, setSaveOptionsOpen] = useState(false)
  const resumeDraftRef = useRef<VisitWizardDraftV1 | null>(null)
  const finalizeInFlightRef = useRef(false)
  const transcriptBootstrappedRef = useRef(false)
  /** Set when user applied transcript extract; grant 3 tokens on complete finalize (server-validated). */
  const transcriptRewardPendingRef = useRef(false)
  const [showTranscriptPrefillBanner, setShowTranscriptPrefillBanner] = useState(false)
  const [incompleteSaveOpen, setIncompleteSaveOpen] = useState(false)

  const effectiveName = doctorMode === 'new' ? newDoctorName.trim() : selectedName

  const doctorPickOptions = useMemo(
    () => doctors.filter((d) => !isPlaceholderTranscriptDoctorName(d.name)),
    [doctors],
  )

  const applyExtractedVisitFields = useCallback((fields: ExtractedVisitFields) => {
    if (fields.reason_for_visit?.trim()) setReason(fields.reason_for_visit.trim())
    if (fields.findings) setFindings(fields.findings)
    if (fields.instructions) setInstructions(fields.instructions)
    if (fields.follow_up_date?.trim()) {
      setNextApptDate(fields.follow_up_date.trim())
      if (!fields.follow_up_time?.trim()) setNextApptTime('')
    } else if (fields.follow_up_time?.trim()) {
      setNextApptTime(fields.follow_up_time.trim())
    }
    if (fields.tests?.length) {
      setDvTests(fields.tests.map((t) => ({ test_name: t.test_name, reason: t.reason })))
      setOpenTests(true)
    }
    if (fields.diagnoses?.length) {
      setDvDiagnoses(dedupeDiagnosisRows(fields.diagnoses))
      setOpenDiagnoses(true)
    }
    if (fields.medications?.length) {
      setDvMeds((prev) => {
        const byKey = new Map<string, { medication: string; dose: string; action: 'keep' | 'remove' }>()
        for (const m of prev) {
          byKey.set(m.medication.trim().toLowerCase(), { ...m })
        }
        for (const raw of fields.medications) {
          const name = raw.medication?.trim()
          if (!name) continue
          const key = name.toLowerCase()
          const dosePart = [raw.dose?.trim(), raw.frequency?.trim()].filter(Boolean).join(' · ')
          const existing = byKey.get(key)
          if (existing) {
            if (dosePart) byKey.set(key, { ...existing, dose: dosePart })
          } else {
            byKey.set(key, { medication: name, dose: dosePart, action: 'keep' })
          }
        }
        return [...byKey.values()]
      })
      setNewMedEntry({ medication: '', dose: '', frequency: '', prn: false })
      setOpenMeds(true)
    }
    if (fields.findings || fields.instructions || fields.notes?.trim()) setOpenClinical(true)
    if (fields.follow_up_date?.trim() || fields.follow_up_time?.trim()) setOpenNextAppt(true)
  }, [])

  const addNewMedEntryToList = useCallback(() => {
    const name = newMedEntry.medication.trim()
    if (!name) return
    const sched = newMedEntry.prn ? 'As needed' : (newMedEntry.frequency.trim() || '')
    const dosePart = [newMedEntry.dose.trim(), sched].filter(Boolean).join(' · ')
    const key = name.toLowerCase()
    setDvMeds((p) => {
      const i = p.findIndex((m) => m.medication.trim().toLowerCase() === key)
      if (i >= 0) {
        return p.map((m, j) => (j === i ? { ...m, dose: dosePart, action: 'keep' as const } : m))
      }
      return [...p, { medication: name, dose: dosePart, action: 'keep' as const }]
    })
    setNewMedEntry({ medication: '', dose: '', frequency: '', prn: false })
  }, [newMedEntry])

  const buildDraftSnapshot = useCallback((): VisitWizardDraftV1 | null => {
    if (!user) return null
    return {
      v: 1,
      userId: user.id,
      step,
      visitId,
      visitDate,
      visitTime,
      doctorMode,
      selectedName,
      newDoctorName,
      specialty,
      reason,
      questionLines: questionLines.map((q) => ({ ...q })),
      dvTests: dvTests.map((t) => ({ ...t })),
      dvDiagnoses: dvDiagnoses.map((d) => ({ ...d })),
      dvMeds: dvMeds.map((m) => ({ ...m })),
      newMedEntry: { ...newMedEntry },
      findings,
      instructions,
      notes,
      nextApptDate,
      nextApptTime,
      nextApptEndTime,
    }
  }, [user, step, visitId, visitDate, visitTime, doctorMode, selectedName, newDoctorName, specialty, reason, questionLines, dvTests, dvDiagnoses, dvMeds, newMedEntry, findings, instructions, notes, nextApptDate, nextApptTime, nextApptEndTime])

  const isWizardDirty = useCallback(() => {
    if (step >= 2) return true
    if (visitId) return true
    return !!(
      reason.trim() ||
      effectiveName ||
      specialty.trim() ||
      findings.trim() ||
      instructions.trim() ||
      notes.trim() ||
      nextApptDate.trim() ||
      dvTests.some((t) => t.test_name.trim() || t.reason.trim()) ||
      dvDiagnoses.some((d) => d.diagnosis.trim()) ||
      dvMeds.length > 0 ||
      newMedEntry.medication.trim() ||
      questionLines.some((q) => q.text.trim())
    )
  }, [step, visitId, reason, effectiveName, specialty, findings, instructions, notes, nextApptDate, dvTests, dvDiagnoses, dvMeds, newMedEntry, questionLines])

  function applyDraft (d: VisitWizardDraftV1) {
    setStep(d.step)
    setVisitId(d.visitId)
    setVisitDate(d.visitDate)
    setVisitTime(d.visitTime)
    setDoctorMode(d.doctorMode)
    setSelectedName(d.selectedName)
    setNewDoctorName(d.newDoctorName)
    setSpecialty(d.specialty)
    setReason(d.reason)
    setQuestionLines(d.questionLines.length ? d.questionLines : [{ text: '', priority: 'Medium' }])
    setDvTests(d.dvTests.length ? d.dvTests : [{ test_name: '', reason: '' }])
    setDvDiagnoses(d.dvDiagnoses?.length
      ? dedupeDiagnosisRows(d.dvDiagnoses.map((x) => normalizeDiagnosisDraftRow(x)))
      : [])
    setDvMeds(d.dvMeds)
    setNewMedEntry({
      medication: d.newMedEntry.medication,
      dose: d.newMedEntry.dose,
      frequency: d.newMedEntry.frequency,
      prn: d.newMedEntry.prn === true,
    })
    setFindings(d.findings)
    setInstructions(d.instructions)
    setNotes(d.notes)
    setNextApptDate(d.nextApptDate)
    setNextApptTime(d.nextApptTime)
    setNextApptEndTime(d.nextApptEndTime)
    const hasTests = d.dvTests.some((t) => t.test_name.trim() || t.reason.trim()) || d.dvTests.length > 1
    const hasDiags = (d.dvDiagnoses?.some((x) => x.diagnosis.trim()) ?? false)
    const hasMeds = d.dvMeds.length > 0 || !!d.newMedEntry.medication.trim()
    const hasClinical = !!(d.findings.trim() || d.instructions.trim() || d.notes.trim())
    const hasNext = !!(d.nextApptDate.trim() || d.nextApptTime.trim() || d.nextApptEndTime.trim())
    setOpenTests(hasTests)
    setOpenDiagnoses(hasDiags)
    setOpenMeds(hasMeds)
    setOpenClinical(hasClinical)
    setOpenDocs(false)
    setOpenNextAppt(hasNext)
  }

  const requestLeave = useCallback(() => {
    if (!isWizardDirty()) {
      clearVisitWizardDraft()
      navigate('/app')
      return
    }
    setCancelLeaveOpen(true)
  }, [isWizardDirty, navigate])

  useImperativeHandle(ref, () => ({ requestLeave }), [requestLeave])

  useEffect(() => {
    try {
      localStorage.removeItem('mb-pinned-visit-reasons')
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: d } = await supabase.from('doctors').select('id, name, specialty').eq('user_id', user.id).order('name')
      setDoctors((d ?? []) as DoctorRow[])
    })()
  }, [user])

  useEffect(() => {
    if (!initialDoctorName.trim()) return
    const match = doctors.find((d) => d.name === initialDoctorName)
    if (match) {
      setDoctorMode('pick')
      setSelectedName(match.name)
      setSpecialty(match.specialty ?? initialSpecialty)
    } else {
      setDoctorMode('new')
      setNewDoctorName(initialDoctorName)
      setSpecialty(initialSpecialty)
    }
  }, [doctors, initialDoctorName, initialSpecialty])

  useEffect(() => {
    if (!resumeVisitId || !user) return
    void (async () => {
      const { data, error: e } = await supabase.from('doctor_visits').select('*').eq('id', resumeVisitId).eq('user_id', user.id).maybeSingle()
      if (e || !data) return
      setVisitId(data.id)
      setVisitDate(data.visit_date)
      setVisitTime(data.visit_time || nowTime())
      setNewDoctorName(data.doctor || '')
      setSelectedName(data.doctor || '')
      setSpecialty(data.specialty || '')
      setReason(data.reason || '')
      setFindings(data.findings || '')
      setInstructions(data.instructions || '')
      setNotes(data.notes || '')
      setNextApptDate(typeof data.follow_up === 'string' ? data.follow_up.slice(0, 10) : '')
      setDoctorMode('new')
      setStep(3)
    })()
  }, [resumeVisitId, user])

  async function loadDoctorMeds (name: string) {
    if (!user || !name) { setDvMeds([]); return }
    const prefix = `Prescribed by: ${name}%`
    const { data } = await supabase.from('current_medications').select('id, medication, dose').eq('user_id', user.id).ilike('notes', prefix)
    const meds = (data ?? []) as { id: string; medication: string; dose: string | null }[]
    const fromDb = meds.map((m) => ({ medication: m.medication, dose: m.dose ?? '', action: 'keep' as const }))
    /** Keep meds not yet in DB (e.g. from transcript) instead of overwriting the list. */
    setDvMeds((prev) => {
      const dbKeys = new Set(fromDb.map((m) => m.medication.trim().toLowerCase()))
      const extras = prev.filter((m) => !dbKeys.has(m.medication.trim().toLowerCase()))
      return [...fromDb, ...extras]
    })
  }

  useEffect(() => {
    if (doctorMode === 'pick' && selectedName) {
      const doc = doctors.find((d) => d.name === selectedName)
      setSpecialty(doc?.specialty ?? '')
      void loadDoctorMeds(selectedName)
    } else if (doctorMode === 'new' && newDoctorName.trim()) {
      void loadDoctorMeds(newDoctorName.trim())
    } else {
      setDvMeds([])
    }
  }, [doctorMode, selectedName, newDoctorName, doctors, user])

  const refreshVisitDocs = useCallback(async () => {
    if (!user || !visitId) return
    setVisitDocBusy(true)
    const { error, docs } = await listVisitDocuments(user.id, visitId)
    setVisitDocBusy(false)
    if (!error) setVisitDocList(docs)
  }, [user, visitId])

  useEffect(() => {
    if (!user || !visitId || step < 2) return
    void refreshVisitDocs()
  }, [user, visitId, step, refreshVisitDocs])

  async function saveStep1 () {
    if (!user) return
    if (!effectiveName) { setError('Choose or add a doctor.'); return }
    setError(null)
    setBusy(true)
    const payload = {
      user_id: user.id,
      visit_date: visitDate,
      visit_time: visitTime || null,
      doctor: effectiveName,
      specialty: specialty || null,
      reason: reason || null,
      status: 'pending' as const,
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status: _s, ...payloadNoStatus } = payload

    if (visitId) {
      let { error: e } = await supabase.from('doctor_visits').update(payload).eq('id', visitId)
      if (e?.message?.toLowerCase().includes('status')) {
        const res2 = await supabase.from('doctor_visits').update(payloadNoStatus).eq('id', visitId)
        e = res2.error
      }
      setBusy(false)
      if (e) { setError(e.message); return }
    } else {
      let { data: rows, error: e } = await supabase.from('doctor_visits').insert(payload).select('id')
      if (e?.message?.toLowerCase().includes('status')) {
        const res2 = await supabase.from('doctor_visits').insert(payloadNoStatus).select('id')
        rows = res2.data
        e = res2.error
      }
      setBusy(false)
      if (e) { setError(e.message); return }
      const newId = rows?.[0]?.id as string | undefined
      if (!newId) {
        setError('Visit was not saved (no row returned). Check your connection and that doctor_visits exists.')
        return
      }
      setVisitId(newId)
    }
    setShowTranscriptPrefillBanner(false)
    setStep(2)
  }

  async function saveStep2AndGo () {
    if (!user || !visitId) return
    setError(null)
    const lines = questionLines.map((q) => ({ ...q, text: q.text.trim() })).filter((q) => q.text)
    setBusy(true)
    if (lines.length > 0) {
      const { error: delE } = await supabase
        .from('doctor_questions')
        .delete()
        .eq('user_id', user.id)
        .eq('doctor_visit_id', visitId)
      if (delE && !String(delE.message).toLowerCase().includes('doctor_visit_id')) {
        setBusy(false)
        setError(delE.message)
        return
      }

      const baseRows = lines.map((q) => ({
        user_id: user.id,
        date_created: visitDate,
        appointment_date: visitDate,
        doctor_visit_id: visitId,
        doctor: effectiveName,
        question: q.text,
        priority: q.priority || 'Medium',
        status: 'Unanswered' as const,
        answer: null as string | null,
      }))

      let { error: e } = await supabase.from('doctor_questions').insert(
        baseRows.map((r) => ({ ...r, doctor_specialty: specialty.trim() || null }))
      )
      if (e?.message?.toLowerCase().includes('doctor_specialty')) {
        const res2 = await supabase.from('doctor_questions').insert(baseRows)
        e = res2.error
      }
      if (e?.message?.toLowerCase().includes('doctor_visit_id')) {
        const rowsNoVisit = baseRows.map(({ doctor_visit_id: _v, ...rest }) => rest)
        const res3 = await supabase.from('doctor_questions').insert(
          rowsNoVisit.map((r) => ({ ...r, doctor_specialty: specialty.trim() || null }))
        )
        e = res3.error
        if (e?.message?.toLowerCase().includes('doctor_specialty')) {
          const res4 = await supabase.from('doctor_questions').insert(rowsNoVisit)
          e = res4.error
        }
      }
      setBusy(false)
      if (e) { setError(e.message); return }
    } else {
      const { error: delEmpty } = await supabase
        .from('doctor_questions')
        .delete()
        .eq('user_id', user.id)
        .eq('doctor_visit_id', visitId)
      if (delEmpty && !String(delEmpty.message).toLowerCase().includes('doctor_visit_id')) {
        setBusy(false)
        setError(delEmpty.message)
        return
      }
      setBusy(false)
    }
    setStep(3)
  }

  function visitLogLooksIncomplete (): boolean {
    if (!reason.trim()) return true
    if (!findings.trim() && !instructions.trim()) return true
    return false
  }

  function requestFinalizeVisit (asPending: boolean) {
    if (asPending) {
      void finalizeVisit(true)
      return
    }
    if (visitLogLooksIncomplete()) {
      setIncompleteSaveOpen(true)
      return
    }
    void finalizeVisit(false)
  }

  async function finalizeVisit (asPending: boolean) {
    if (!user || !visitId) return
    if (finalizeInFlightRef.current) return
    if (!effectiveName) { setError('Doctor name missing.'); return }
    finalizeInFlightRef.current = true
    setError(null)
    setBusy(true)
    try {
      const validTests = dvTests.filter((t) => t.test_name.trim())
      const validDiags = dedupeDiagnosisRows(dvDiagnoses.filter((d) => d.diagnosis.trim()))
      const testsStr = validTests.map((t) => t.test_name.trim()).join(', ') || null
      const medsStr = [
        ...dvMeds.filter((m) => m.action === 'keep').map((m) => `${m.medication}${m.dose ? ` (${m.dose})` : ''}`),
        ...(newMedEntry.medication.trim()
          ? (() => {
            const sched = newMedEntry.prn ? 'As needed' : (newMedEntry.frequency.trim() || '')
            const tail = [newMedEntry.dose, sched].filter(Boolean).join(' · ')
            return [`${newMedEntry.medication.trim()}${tail ? ` (${tail})` : ''}`]
          })()
          : []),
      ].join('; ') || null

      const { error: ue } = await supabase.from('doctor_visits').update({
        doctor: effectiveName,
        specialty: specialty || null,
        reason: reason || null,
        findings: findings || null,
        tests_ordered: testsStr,
        new_meds: medsStr,
        instructions: instructions || null,
        follow_up: nextApptDate || null,
        notes: notes || null,
        status: asPending ? 'pending' : 'complete',
      }).eq('id', visitId)

      if (ue) { setError(ue.message); return }

      if (!asPending) {
        await markAppointmentsVisitLoggedForVisitDay(supabase, user.id, visitDate, effectiveName)
      }

      if (pendingVisitFiles.length > 0 && visitId) {
        let salt = 0
        for (const file of pendingVisitFiles) {
          salt += 1
          const { error: upErr } = await uploadVisitDocument(user.id, visitId, file, salt)
          if (upErr) console.warn('visit document upload:', upErr.message)
        }
        setPendingVisitFiles([])
        await refreshVisitDocs()
      }

      if (!asPending && validTests.length > 0) {
        const { error: te } = await supabase.from('tests_ordered').insert(
          validTests.map((t) => ({
            user_id: user.id,
            test_date: visitDate,
            doctor: effectiveName,
            test_name: t.test_name.trim(),
            reason: t.reason || null,
            status: 'Pending',
          })),
        )
        if (te) {
          setError(te.message)
          return
        }
      }

      if (!asPending && validDiags.length > 0) {
        const diagErr = await upsertDiagnosesFromVisit(supabase, user.id, effectiveName, visitDate, validDiags)
        if (diagErr) {
          setError(diagErr)
          return
        }
      }

      if (!asPending && nextApptDate) {
        const apptPayload: Record<string, unknown> = {
          user_id: user.id,
          doctor: effectiveName,
          specialty: specialty || null,
          appointment_date: nextApptDate,
          appointment_time: nextApptTime || null,
          appointment_end_time: nextApptEndTime || null,
        }
        let { error: apErr } = await supabase.from('appointments').insert(apptPayload)
        if (apErr?.message?.includes('appointment_end_time')) {
          const { appointment_end_time: _drop, ...fallback } = apptPayload
          const res2 = await supabase.from('appointments').insert(fallback)
          apErr = res2.error
        }
        if (apErr) {
          setError(apErr.message)
          return
        }
      }

      for (const m of dvMeds) {
        if (m.action === 'remove') {
          const { error: delErr } = await supabase.from('current_medications').delete().eq('user_id', user.id).eq('medication', m.medication)
          if (delErr) {
            setError(delErr.message)
            return
          }
        }
      }
      if (!asPending) {
        for (const m of dvMeds) {
          if (m.action !== 'keep') continue
          const medName = m.medication.trim()
          if (!medName) continue
          const { dose, frequency } = splitDoseFrequencyFromCombined(m.dose)
          const { error: upErr } = await supabase.from('current_medications').upsert({
            user_id: user.id,
            medication: medName,
            dose,
            frequency,
            notes: `Prescribed by: ${effectiveName}`,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,medication' })
          if (upErr) {
            setError(upErr.message)
            return
          }
        }
      }
      if (!asPending && newMedEntry.medication.trim()) {
        const key = newMedEntry.medication.trim().toLowerCase()
        const alreadyKept = dvMeds.some((m) => m.action === 'keep' && m.medication.trim().toLowerCase() === key)
        if (!alreadyKept) {
          const { error: nmErr } = await supabase.from('current_medications').upsert({
            user_id: user.id,
            medication: newMedEntry.medication.trim(),
            dose: newMedEntry.dose || null,
            frequency: newMedEntry.prn ? 'As needed' : (newMedEntry.frequency.trim() || null),
            notes: `Prescribed by: ${effectiveName}`,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,medication' })
          if (nmErr) {
            setError(nmErr.message)
            return
          }
        }
      }

      void ensureDoctorProfile(user.id, effectiveName, specialty || null)
      if (
        gameTokensEnabled() &&
        !asPending &&
        transcriptRewardPendingRef.current &&
        visitId
      ) {
        await grantTranscriptVisitTokens(visitId)
      }
      transcriptRewardPendingRef.current = false
      clearVisitWizardDraft()
      if (onDone) {
        onDone()
        return
      }
      navigate('/app')
    } finally {
      finalizeInFlightRef.current = false
      setBusy(false)
    }
  }

  function isReasonPinned (text: string) {
    const n = normPin(text)
    return pinnedReasons.some((x) => normPin(x) === n)
  }

  function pinReason (r: string) {
    const t = r.trim()
    if (!t) return
    if (pinnedReasons.some((x) => normPin(x) === normPin(t))) return
    const next = [t, ...pinnedReasons].slice(0, 8)
    setPinnedReasons(next)
    try { localStorage.setItem(PINNED_VISIT_REASONS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  function unpinReason (r: string) {
    const needle = normPin(r)
    const next = pinnedReasons.filter((x) => normPin(x) !== needle)
    setPinnedReasons(next)
    try { localStorage.setItem(PINNED_VISIT_REASONS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const chipRow = useMemo(() => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center' }}>
      {DEFAULT_VISIT_REASON_PILLS.map((label) => (
        <button
          key={label}
          type="button"
          className={`pill ${reason.trim() === label ? 'on' : ''}`}
          style={{ fontSize: '0.78rem' }}
          onClick={() => setReason(label)}
        >
          {label}
        </button>
      ))}
      {pinnedReasons.map((r) => (
        <span key={`pin-${normPin(r)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            className="pill on"
            style={{ fontSize: '0.78rem' }}
            onClick={() => setReason(r)}
          >
            📌 {r.length > 38 ? `${r.slice(0, 36)}…` : r}
          </button>
          <button
            type="button"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: '0.7rem', color: '#9ca3af', lineHeight: 1 }}
            title="Remove from quick picks"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              unpinReason(r)
            }}
          >✕</button>
        </span>
      ))}
    </div>
  ), [pinnedReasons, reason])

  /** Dashboard → visit log: pre-fill step 1 (real doctor required); no DB row until save step 1. */
  useEffect(() => {
    if (!user || resumeVisitId || transcriptBootstrappedRef.current) return
    const bundleKey = 'mb-pending-transcript-bundle'
    const legacyKey = 'mb-pending-transcript-extract'
    let bundleRaw: string | null = null
    let legacyRaw: string | null = null
    try {
      bundleRaw = sessionStorage.getItem(bundleKey)
      legacyRaw = sessionStorage.getItem(legacyKey)
    } catch { /* ignore */ }
    if (!bundleRaw && !legacyRaw) return

    transcriptBootstrappedRef.current = true
    transcriptRewardPendingRef.current = true
    clearVisitWizardDraft()

    let fields: ExtractedVisitFields

    if (bundleRaw) {
      try {
        const b = JSON.parse(bundleRaw) as {
          fields: Record<string, unknown>
          transcript?: string
          doctorName?: string
          visitDate?: string
        }
        sessionStorage.removeItem(bundleKey)
        fields = normalizeExtractedFields(b.fields)
        const vd = (b.visitDate ?? '').trim()
        if (/^\d{4}-\d{2}-\d{2}/.test(vd)) {
          setVisitDate(vd.slice(0, 10))
        }
      } catch {
        transcriptBootstrappedRef.current = false
        return
      }
    } else {
      try {
        fields = normalizeExtractedFields(JSON.parse(legacyRaw!) as Record<string, unknown>)
        sessionStorage.removeItem(legacyKey)
      } catch {
        transcriptBootstrappedRef.current = false
        return
      }
    }

    setVisitId(null)
    setDoctorMode('pick')
    setNewDoctorName(initialDoctorName || '')
    setSelectedName('')
    setReason('')

    applyExtractedVisitFields(fields)
    const supplement = buildClinicalNotesSupplement(fields)
    setNotes(supplement)
    setStep(1)
    setShowTranscriptPrefillBanner(true)
  }, [user, resumeVisitId, applyExtractedVisitFields, initialDoctorName])

  useEffect(() => {
    if (!user || resumeVisitId) return
    try {
      if (sessionStorage.getItem('mb-pending-transcript-bundle') || sessionStorage.getItem('mb-pending-transcript-extract')) return
    } catch { /* ignore */ }
    const d = loadVisitWizardDraft(user.id)
    if (d && draftLooksMeaningful(d)) {
      resumeDraftRef.current = d
      setResumePrompt(true)
    }
  }, [user, resumeVisitId])

  if (!user) return null

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {resumePrompt && resumeDraftRef.current && (
        <LeaveLaterDialog
          variant="resume"
          onResume={() => {
            applyDraft(resumeDraftRef.current!)
            setResumePrompt(false)
            resumeDraftRef.current = null
          }}
          onFresh={() => {
            clearVisitWizardDraft()
            setResumePrompt(false)
            resumeDraftRef.current = null
          }}
        />
      )}
      {cancelLeaveOpen && (
        <LeaveHomeConfirmDialog
          onConfirmLeave={() => {
            setCancelLeaveOpen(false)
            const snap = buildDraftSnapshot()
            if (snap && draftLooksMeaningful(snap)) saveVisitWizardDraft(snap)
            navigate('/app')
          }}
          onStay={() => setCancelLeaveOpen(false)}
        />
      )}
      {saveOptionsOpen && step === 3 && (
        <SaveLogOptionsDialog
          title="Save visit"
          onSaveComplete={() => {
            setSaveOptionsOpen(false)
            void requestFinalizeVisit(false)
          }}
          onSaveForLater={() => {
            setSaveOptionsOpen(false)
            void finalizeVisit(true)
          }}
          onKeepEditing={() => setSaveOptionsOpen(false)}
        />
      )}
      {incompleteSaveOpen && (
        <AppConfirmDialog
          title="Are you sure?"
          message="Some fields were left unanswered. Save as complete anyway?"
          confirmLabel="Save anyway"
          cancelLabel="Keep editing"
          onConfirm={() => {
            setIncompleteSaveOpen(false)
            void finalizeVisit(false)
          }}
          onCancel={() => setIncompleteSaveOpen(false)}
        />
      )}
      {error && (
        <div className="banner error" style={{ cursor: 'pointer' }} onClick={() => setError(null)}>
          {error} ✕
        </div>
      )}

      {step === 1 && (
        <div className="card shadow" style={{ borderRadius: 16, padding: 16 }}>
          {showTranscriptPrefillBanner && (
            <div
              className="banner"
              style={{ marginBottom: 12, fontSize: '0.85rem', lineHeight: 1.45, background: 'var(--surface-alt, #f0fdf4)', borderColor: 'var(--border)' }}
            >
              We filled details from your transcript. Pick your doctor and a reason for the visit, then continue.
            </div>
          )}
          <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#475569' }}>When & who</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} style={{ flex: '1 1 140px', fontSize: '0.88rem' }} />
            <input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} style={{ flex: '1 1 120px', fontSize: '0.88rem' }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className={`pill ${doctorMode === 'pick' ? 'on' : ''}`} style={{ marginRight: 8 }} onClick={() => setDoctorMode('pick')}>My doctors</button>
            <button type="button" className={`pill ${doctorMode === 'new' ? 'on' : ''}`} onClick={() => setDoctorMode('new')}>Someone new</button>
          </div>
          {doctorMode === 'pick' ? (
            <>
              <select value={selectedName} onChange={(e) => setSelectedName(e.target.value)} style={{ ...WIZARD_TX, marginTop: 10 }}>
                <option value="">— Pick a doctor —</option>
                {doctorPickOptions.map((d) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '8px 0 0', lineHeight: 1.4 }}>
                Specialty:{' '}
                <strong style={{ fontWeight: 600, color: 'var(--text, #334155)' }}>
                  {doctors.find((d) => d.name === selectedName)?.specialty?.trim() || '—'}
                </strong>
              </p>
            </>
          ) : (
            <>
              <input value={newDoctorName} onChange={(e) => setNewDoctorName(e.target.value)} placeholder="Doctor name" style={{ ...WIZARD_TX, marginTop: 10 }} />
              <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Specialty (optional)" style={{ ...WIZARD_TX, marginTop: 10 }} />
            </>
          )}
          <p style={{ margin: '14px 0 4px', fontSize: '0.85rem', color: '#64748b' }}>Main reason — quick picks, your own words, or pin what you typed</p>
          {chipRow}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="In your own words…" rows={3} style={{ ...WIZARD_TX, marginTop: 8 }} />
          {reason.trim() && !isReasonPinned(reason) && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.78rem', padding: '3px 10px', marginTop: 4 }}
              onClick={() => pinReason(reason)}
            >
              📌 Pin this reason
            </button>
          )}
          {reason.trim() && isReasonPinned(reason) && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#4a7a32' }}>📌 In your quick picks</span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                onClick={() => unpinReason(reason)}
              >
                Remove from quick picks
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.9rem', fontWeight: 500, padding: '10px 14px' }} onClick={() => requestLeave()}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: '1 1 160px', minHeight: 44, fontSize: '0.95rem', fontWeight: 600 }} disabled={busy} onClick={() => void saveStep1()}>
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card shadow" style={{ borderRadius: 16, padding: 16 }}>
          <div
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              background: 'var(--surface-alt, #f8fafc)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.02rem', color: 'var(--text, #1e293b)' }}>
              {effectiveName || 'Doctor'}
            </div>
            <div className="muted" style={{ fontSize: '0.88rem', marginTop: 2 }}>
              {formatVisitDateLong(visitDate)}
            </div>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#475569' }}>Questions for this visit</p>
          {questionLines.map((line, i) => (
            <div key={i} style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Priority</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['High', 'Medium', 'Low'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      style={priorityButtonStyles(p, line.priority === p)}
                      onClick={() => setQuestionLines((prev) => prev.map((x, j) => (j === i ? { ...x, priority: p } : x)))}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Question</label>
                <textarea
                  value={line.text}
                  rows={3}
                  placeholder="What do you want to ask?"
                  style={{ ...WIZARD_TX }}
                  onChange={(e) => setQuestionLines((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
              </div>
              {questionLines.length > 1 && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: 6 }}
                  onClick={() => setQuestionLines((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove this question
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem', marginBottom: 12 }}
            onClick={() => setQuestionLines((p) => [...p, { text: '', priority: 'Medium' }])}
          >
            + Add another question
          </button>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" style={{ minWidth: 44, padding: '10px 12px', fontSize: '1rem', fontWeight: 600 }} onClick={() => setStep(1)}>←</button>
            <button type="button" className="btn btn-primary" style={{ flex: '1 1 140px', minHeight: 44, fontSize: '0.95rem', fontWeight: 600 }} disabled={busy} onClick={() => void saveStep2AndGo()}>Next</button>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.9rem', fontWeight: 500, padding: '10px 14px' }} onClick={() => requestLeave()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card shadow" style={{ borderRadius: 16, padding: 16 }}>
          <div
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              background: 'var(--surface-alt, #f8fafc)',
              borderRadius: 12,
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.02rem', color: 'var(--text, #1e293b)' }}>
              {effectiveName || 'Doctor'}
            </div>
            <div className="muted" style={{ fontSize: '0.88rem', marginTop: 2 }}>
              {formatVisitDateLong(visitDate)}
            </div>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: '0.9rem', color: '#475569' }}>Tests, meds, diagnoses & follow-up</p>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ justifyContent: 'space-between', textAlign: 'left', borderRadius: '12px 12px 0 0', fontWeight: 600 }}
              onClick={() => setOpenTests((o) => !o)}
            >
              <span>Tests discussed</span>
              <span className="muted" style={{ fontWeight: 400, fontSize: '0.78rem' }}>{openTests ? 'Hide' : '+ Add tests'}</span>
            </button>
            {openTests && (
              <div style={{ padding: '0 12px 12px' }}>
                {dvTests.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input style={{ ...WIZARD_TX_INLINE, flex: 2 }} placeholder="Test" value={t.test_name} onChange={(e) => setDvTests((p) => p.map((x, j) => j === i ? { ...x, test_name: e.target.value } : x))} />
                    <input style={{ ...WIZARD_TX_INLINE, flex: 2 }} placeholder="Why (optional)" value={t.reason} onChange={(e) => setDvTests((p) => p.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))} />
                  </div>
                ))}
                <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => setDvTests((p) => [...p, { test_name: '', reason: '' }])}>+ Another test row</button>
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ justifyContent: 'space-between', textAlign: 'left', borderRadius: '12px 12px 0 0', fontWeight: 600 }}
              onClick={() => setOpenMeds((o) => !o)}
            >
              <span>Medications</span>
              <span className="muted" style={{ fontWeight: 400, fontSize: '0.78rem' }}>{openMeds ? 'Hide' : '+ Review or add medications'}</span>
            </button>
            {openMeds && (
              <div style={{ padding: '0 12px 12px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.4 }}>
                  Review medications from your transcript below. Add anything that was missed (including dose) — use Add to list for each extra medication.
                </p>
                {dvMeds.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.85rem' }}>{m.medication}{m.dose ? ` · ${m.dose}` : ''}</span>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem' }} onClick={() => setDvMeds((p) => p.map((x, j) => j === i ? { ...x, action: x.action === 'remove' ? 'keep' : 'remove' } : x))}>
                      {m.action === 'remove' ? 'Undo' : 'Remove'}
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <input style={{ ...WIZARD_TX_INLINE, flex: '2 1 130px' }} placeholder="New med name" value={newMedEntry.medication} onChange={(e) => setNewMedEntry((p) => ({ ...p, medication: e.target.value }))} />
                  <input style={{ ...WIZARD_TX_INLINE, flex: '1 1 80px' }} placeholder="Dose" value={newMedEntry.dose} onChange={(e) => setNewMedEntry((p) => ({ ...p, dose: e.target.value }))} />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', marginTop: 8, width: '100%' }}
                  onClick={() => addNewMedEntryToList()}
                >
                  Add to medication list
                </button>
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
                      style={{ ...WIZARD_TX }}
                      placeholder="e.g. Twice daily, at bedtime"
                      value={newMedEntry.frequency}
                      onChange={(e) => setNewMedEntry((p) => ({ ...p, frequency: e.target.value }))}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ justifyContent: 'space-between', textAlign: 'left', borderRadius: '12px 12px 0 0', fontWeight: 600 }}
              onClick={() => setOpenDiagnoses((o) => !o)}
            >
              <span>Diagnosis directory</span>
              <span className="muted" style={{ fontWeight: 400, fontSize: '0.78rem' }}>{openDiagnoses ? 'Hide' : '+ Review or add diagnoses'}</span>
            </button>
            {openDiagnoses && (
              <div style={{ padding: '0 12px 12px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.4 }}>
                  Rows here update your Diagnosis directory when you save the visit as complete. They are not written on “save for later.”
                </p>
                {dvDiagnoses.map((d, i) => (
                  <div key={i} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                      <input
                        style={{ ...WIZARD_TX_INLINE, flex: '2 1 140px' }}
                        placeholder="Diagnosis name"
                        value={d.diagnosis}
                        onChange={(e) => setDvDiagnoses((p) => p.map((x, j) => j === i ? { ...x, diagnosis: e.target.value } : x))}
                      />
                      <select
                        style={{ ...WIZARD_TX_INLINE, flex: '1 1 120px', minHeight: 38 }}
                        value={d.status}
                        onChange={(e) => setDvDiagnoses((p) => p.map((x, j) => j === i ? { ...x, status: e.target.value as DiagnosisDirectoryStatus } : x))}
                      >
                        {DIAGNOSIS_STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => setDvDiagnoses((p) => p.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </div>
                    <DiagnosisDetailFields
                      status={d.status}
                      how_or_why={d.how_or_why}
                      treatment_plan={d.treatment_plan}
                      care_plan={d.care_plan}
                      onChange={(patch) => setDvDiagnoses((p) => p.map((x, j) => j === i ? { ...x, ...patch } : x))}
                      textAreaStyle={WIZARD_TX}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => setDvDiagnoses((p) => [...p, emptyDiagnosisDraftRow()])}
                >
                  + Add diagnosis row
                </button>
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ justifyContent: 'space-between', textAlign: 'left', borderRadius: '12px 12px 0 0', fontWeight: 600 }}
              onClick={() => setOpenClinical((o) => !o)}
            >
              <span>Findings, instructions & notes</span>
              <span className="muted" style={{ fontWeight: 400, fontSize: '0.78rem' }}>{openClinical ? 'Hide' : '+ Add clinical notes'}</span>
            </button>
            {openClinical && (
              <div style={{ padding: '0 12px 12px', display: 'grid', gap: 8 }}>
                <textarea value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Findings (optional)" rows={2} style={{ ...WIZARD_TX }} />
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instructions (optional)" rows={2} style={{ ...WIZARD_TX }} />
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} style={{ ...WIZARD_TX }} />
              </div>
            )}
          </div>

          {visitId && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                style={{ justifyContent: 'space-between', textAlign: 'left', borderRadius: '12px 12px 0 0', fontWeight: 600 }}
                onClick={() => setOpenDocs((o) => !o)}
              >
                <span>Documents / photos</span>
                <span className="muted" style={{ fontWeight: 400, fontSize: '0.78rem' }}>{openDocs ? 'Hide' : '+ Add documents'}</span>
              </button>
              {openDocs && (
                <div className="form-group" style={{ padding: '0 12px 12px', margin: 0 }}>
                  <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#94a3b8' }}>
                    Queued files upload when you save the visit (or choose “save for later” when leaving).
                  </p>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    ref={visitFileInputRef}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      setPendingVisitFiles((prev) => [...prev, ...files])
                      if (visitFileInputRef.current) visitFileInputRef.current.value = ''
                    }}
                  />
                  {pendingVisitFiles.length > 0 && (
                    <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                      {pendingVisitFiles.map((f, idx) => (
                        <div key={`p-${f.name}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="muted" style={{ fontSize: '0.85rem' }}>{f.name} (queued)</span>
                          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', color: '#b91c1c' }}
                            onClick={() => setPendingVisitFiles((prev) => prev.filter((_, j) => j !== idx))}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {visitDocList.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 6 }}>Attached</div>
                      {visitDocList.map((d) => (
                        <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, alignItems: 'center' }}>
                          <span className="muted" style={{ fontSize: '0.82rem' }}>{d.name}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {d.signedUrl && (
                              <a className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} href={d.signedUrl} target="_blank" rel="noreferrer">View</a>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: '0.75rem', color: '#b91c1c' }}
                              disabled={visitDocBusy}
                              onClick={async () => {
                                if (!user || !visitId) return
                                setVisitDocBusy(true)
                                await deleteVisitDocument(user.id, visitId, d.name)
                                await refreshVisitDocs()
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 10 }}>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ justifyContent: 'space-between', textAlign: 'left', borderRadius: '12px 12px 0 0', fontWeight: 600 }}
              onClick={() => setOpenNextAppt((o) => !o)}
            >
              <span>Next appointment</span>
              <span className="muted" style={{ fontWeight: 400, fontSize: '0.78rem' }}>{openNextAppt ? 'Hide' : '+ Schedule follow-up'}</span>
            </button>
            {openNextAppt && (
              <div style={{ padding: '0 12px 12px' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input type="date" value={nextApptDate} onChange={(e) => setNextApptDate(e.target.value)} style={{ ...WIZARD_TX_INLINE, flex: '1 1 140px' }} />
                  <input type="time" value={nextApptTime} onChange={(e) => setNextApptTime(e.target.value)} style={{ ...WIZARD_TX_INLINE, flex: '1 1 100px' }} placeholder="Start" title="Start time" />
                  <input type="time" value={nextApptEndTime} onChange={(e) => setNextApptEndTime(e.target.value)} style={{ ...WIZARD_TX_INLINE, flex: '1 1 100px' }} placeholder="End" title="End time (optional)" />
                </div>
                {nextApptTime && nextApptEndTime && (
                  <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '4px 0 0' }}>
                    {formatTime12h(nextApptTime)} - {formatTime12h(nextApptEndTime)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.9rem', fontWeight: 500, padding: '10px 14px' }} onClick={() => requestLeave()}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: '1 1 200px', minHeight: 44, fontSize: '0.98rem', fontWeight: 600 }} disabled={busy} onClick={() => setSaveOptionsOpen(true)}>
              Save
            </button>
          </div>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8, fontSize: '0.88rem' }} onClick={() => setStep(2)}>← Questions</button>
        </div>
      )}

    </div>
  )
})

