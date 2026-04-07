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
import {
  clearVisitWizardDraft,
  loadVisitWizardDraft,
  saveVisitWizardDraft,
  type VisitWizardDraftV1,
} from '../lib/visitWizardDraft'

type DoctorRow = { id: string; name: string; specialty: string | null }

type Props = {
  resumeVisitId?: string | null
  initialDoctorName?: string
  initialSpecialty?: string
  onDone?: () => void
}

export type VisitLogWizardRef = {
  requestLeave: (to: '/app' | '/app/visits') => void
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
  const [pastReasons, setPastReasons] = useState<string[]>([])
  const [visitId, setVisitId] = useState<string | null>(resumeVisitId ?? null)
  const [pinnedReasons, setPinnedReasons] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('mb-pinned-visit-reasons') ?? '[]') } catch { return [] }
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
  const [newMedEntry, setNewMedEntry] = useState({ medication: '', dose: '', frequency: '' })
  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string; action: 'keep' | 'remove' }[]>([])
  const [findings, setFindings] = useState('')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')
  const [nextApptDate, setNextApptDate] = useState('')
  const [nextApptTime, setNextApptTime] = useState('')
  const [nextApptEndTime, setNextApptEndTime] = useState('')

  const [openTests, setOpenTests] = useState(false)
  const [openMeds, setOpenMeds] = useState(false)
  const [openClinical, setOpenClinical] = useState(false)
  const [openDocs, setOpenDocs] = useState(false)
  const [openNextAppt, setOpenNextAppt] = useState(false)

  const [resumePrompt, setResumePrompt] = useState(false)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const leaveTargetRef = useRef<'/app' | '/app/visits'>('/app/visits')
  const resumeDraftRef = useRef<VisitWizardDraftV1 | null>(null)

  const effectiveName = doctorMode === 'new' ? newDoctorName.trim() : selectedName

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
      dvMeds: dvMeds.map((m) => ({ ...m })),
      newMedEntry: { ...newMedEntry },
      findings,
      instructions,
      notes,
      nextApptDate,
      nextApptTime,
      nextApptEndTime,
    }
  }, [user, step, visitId, visitDate, visitTime, doctorMode, selectedName, newDoctorName, specialty, reason, questionLines, dvTests, dvMeds, newMedEntry, findings, instructions, notes, nextApptDate, nextApptTime, nextApptEndTime])

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
      dvMeds.length > 0 ||
      newMedEntry.medication.trim() ||
      questionLines.some((q) => q.text.trim())
    )
  }, [step, visitId, reason, effectiveName, specialty, findings, instructions, notes, nextApptDate, dvTests, dvMeds, newMedEntry, questionLines])

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
    setDvMeds(d.dvMeds)
    setNewMedEntry(d.newMedEntry)
    setFindings(d.findings)
    setInstructions(d.instructions)
    setNotes(d.notes)
    setNextApptDate(d.nextApptDate)
    setNextApptTime(d.nextApptTime)
    setNextApptEndTime(d.nextApptEndTime)
    const hasTests = d.dvTests.some((t) => t.test_name.trim() || t.reason.trim()) || d.dvTests.length > 1
    const hasMeds = d.dvMeds.length > 0 || !!d.newMedEntry.medication.trim()
    const hasClinical = !!(d.findings.trim() || d.instructions.trim() || d.notes.trim())
    const hasNext = !!(d.nextApptDate.trim() || d.nextApptTime.trim() || d.nextApptEndTime.trim())
    setOpenTests(hasTests)
    setOpenMeds(hasMeds)
    setOpenClinical(hasClinical)
    setOpenDocs(false)
    setOpenNextAppt(hasNext)
  }

  useEffect(() => {
    if (!user || resumeVisitId) return
    const d = loadVisitWizardDraft(user.id)
    if (d && draftLooksMeaningful(d)) {
      resumeDraftRef.current = d
      setResumePrompt(true)
    }
  }, [user, resumeVisitId])

  function finishLeave (to: '/app' | '/app/visits') {
    setLeaveOpen(false)
    navigate(to)
  }

  const requestLeave = useCallback((to: '/app' | '/app/visits') => {
    leaveTargetRef.current = to
    if (!isWizardDirty()) {
      clearVisitWizardDraft()
      navigate(to)
      return
    }
    setLeaveOpen(true)
  }, [isWizardDirty, navigate])

  useImperativeHandle(ref, () => ({ requestLeave }), [requestLeave])

  useEffect(() => {
    if (!user) return
    void (async () => {
      const { data: d } = await supabase.from('doctors').select('id, name, specialty').eq('user_id', user.id).order('name')
      setDoctors((d ?? []) as DoctorRow[])
      const { data: reasons } = await supabase.from('doctor_visits').select('reason').eq('user_id', user.id).not('reason', 'is', null).order('visit_date', { ascending: false }).limit(80)
      const uniq = [...new Set((reasons ?? []).map((r: { reason: string | null }) => r.reason).filter(Boolean) as string[])]
      setPastReasons(uniq.slice(0, 24))
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
    setDvMeds(meds.map((m) => ({ medication: m.medication, dose: m.dose ?? '', action: 'keep' as const })))
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
    setStep(2)
  }

  async function saveStep2AndGo () {
    if (!user || !visitId) return
    setError(null)
    const lines = questionLines.map((q) => ({ ...q, text: q.text.trim() })).filter((q) => q.text)
    setBusy(true)
    if (lines.length > 0) {
      const { error: e } = await supabase.from('doctor_questions').insert(
        lines.map((q) => ({
          user_id: user.id,
          date_created: todayISO(),
          doctor: effectiveName,
          question: q.text,
          priority: q.priority || 'Medium',
          status: 'Unanswered',
          answer: null,
        }))
      )
      setBusy(false)
      if (e) { setError(e.message); return }
    } else {
      setBusy(false)
    }
    setStep(3)
  }

  async function finalizeVisit (asPending: boolean) {
    if (!user || !visitId) return
    if (!effectiveName) { setError('Doctor name missing.'); return }
    setError(null)
    setBusy(true)
    const validTests = dvTests.filter((t) => t.test_name.trim())
    const testsStr = validTests.map((t) => t.test_name.trim()).join(', ') || null
    const medsStr = [
      ...dvMeds.filter((m) => m.action === 'keep').map((m) => `${m.medication}${m.dose ? ` (${m.dose})` : ''}`),
      ...(newMedEntry.medication.trim() ? [`${newMedEntry.medication.trim()} (${newMedEntry.dose || 'dose ?'})`] : []),
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

    if (ue) { setError(ue.message); setBusy(false); return }

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
      await supabase.from('tests_ordered').insert(
        validTests.map((t) => ({
          user_id: user.id,
          test_date: visitDate,
          doctor: effectiveName,
          test_name: t.test_name.trim(),
          reason: t.reason || null,
          status: 'Pending',
        }))
      )
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
      if (apErr) console.warn('appointments insert:', apErr.message)
    }

    for (const m of dvMeds) {
      if (m.action === 'remove') {
        await supabase.from('current_medications').delete().eq('user_id', user.id).eq('medication', m.medication)
      }
    }
    if (!asPending && newMedEntry.medication.trim()) {
      await supabase.from('current_medications').upsert({
        user_id: user.id,
        medication: newMedEntry.medication.trim(),
        dose: newMedEntry.dose || null,
        frequency: newMedEntry.frequency || null,
        notes: `Prescribed by: ${effectiveName}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,medication' })
    }

    void ensureDoctorProfile(user.id, effectiveName, specialty || null)
    setBusy(false)
    clearVisitWizardDraft()
    if (onDone) {
      onDone()
      return
    }
    navigate('/app')
  }

  function isReasonPinned (text: string) {
    const n = normPin(text)
    return pinnedReasons.some((x) => normPin(x) === n)
  }

  function pinReason (r: string) {
    const t = r.trim()
    if (!t) return
    if (pinnedReasons.some((x) => normPin(x) === normPin(t))) return
    const next = [t, ...pinnedReasons].slice(0, 20)
    setPinnedReasons(next)
    try { localStorage.setItem('mb-pinned-visit-reasons', JSON.stringify(next)) } catch { /* ignore */ }
  }

  function unpinReason (r: string) {
    const needle = normPin(r)
    const next = pinnedReasons.filter((x) => normPin(x) !== needle)
    setPinnedReasons(next)
    try { localStorage.setItem('mb-pinned-visit-reasons', JSON.stringify(next)) } catch { /* ignore */ }
  }

  const [chipCtx, setChipCtx] = useState<string | null>(null)
  const [chipPressing, setChipPressing] = useState<string | null>(null)
  const chipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function startChipPress (r: string) {
    setChipPressing(r)
    chipTimerRef.current = setTimeout(() => {
      setChipCtx(r)
      setChipPressing(null)
    }, 600)
  }
  function cancelChipPress () {
    if (chipTimerRef.current) clearTimeout(chipTimerRef.current)
    setChipPressing(null)
  }
  function deleteFromHistory (r: string) {
    const next = pastReasons.filter((x) => normPin(x) !== normPin(r))
    setPastReasons(next)
    unpinReason(r)
  }

  const chipRow = useMemo(() => {
    const unpinned = pastReasons.filter((r) => !pinnedReasons.some((p) => normPin(p) === normPin(r)))
    const ctxBtnStyle: CSSProperties = {
      display: 'block', width: '100%', padding: '8px 12px', border: 'none', background: 'none',
      textAlign: 'left', fontSize: '0.82rem', cursor: 'pointer', borderRadius: 6,
    }
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {pinnedReasons.map((r) => (
          <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
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
        {unpinned.map((r) => (
          <span key={r} style={{ position: 'relative', display: 'inline-block' }}>
            <button
              type="button"
              className={`pill${chipPressing === r ? ' pill--pressing' : ''}`}
              style={{ fontSize: '0.78rem', userSelect: 'none', WebkitUserSelect: 'none' }}
              onPointerDown={() => startChipPress(r)}
              onPointerUp={() => {
                cancelChipPress()
                if (chipCtx !== r) setReason(r)
              }}
              onPointerLeave={cancelChipPress}
              onPointerCancel={cancelChipPress}
              onClick={() => { if (chipCtx === r) setChipCtx(null) }}
            >
              {r.length > 42 ? `${r.slice(0, 40)}…` : r}
            </button>
            {chipCtx === r && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
                background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10,
                boxShadow: '0 6px 20px rgba(0,0,0,.12)', padding: 4, minWidth: 160,
              }}>
                <button type="button" style={ctxBtnStyle}
                  onClick={() => { setChipCtx(null); setReason(r) }}>
                  Use this reason
                </button>
                <button type="button" style={{ ...ctxBtnStyle, color: '#b91c1c' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#fee2e2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  onClick={() => { setChipCtx(null); deleteFromHistory(r) }}>
                  Delete from history
                </button>
                <button type="button" style={{ ...ctxBtnStyle, color: '#64748b' }}
                  onClick={() => setChipCtx(null)}>
                  Cancel
                </button>
              </div>
            )}
          </span>
        ))}
      </div>
    )
  }, [pastReasons, pinnedReasons, chipCtx, chipPressing])

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
      {leaveOpen && (
        <LeaveLaterDialog
          variant="saveForLater"
          onYes={() => {
            const snap = buildDraftSnapshot()
            if (snap) saveVisitWizardDraft(snap)
            finishLeave(leaveTargetRef.current)
          }}
          onNo={() => {
            clearVisitWizardDraft()
            finishLeave(leaveTargetRef.current)
          }}
          onStay={() => setLeaveOpen(false)}
        />
      )}
      {error && (
        <div className="banner error" style={{ cursor: 'pointer' }} onClick={() => setError(null)}>
          {error} ✕
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.75rem', color: '#64748b' }}>
        <span style={{ fontWeight: 700, color: step >= 1 ? '#4f46e5' : '#cbd5e1' }}>1 · Visit</span>
        <span>→</span>
        <span style={{ fontWeight: 700, color: step >= 2 ? '#4f46e5' : '#cbd5e1' }}>2 · Questions</span>
        <span>→</span>
        <span style={{ fontWeight: 700, color: step >= 3 ? '#4f46e5' : '#cbd5e1' }}>3 · Details</span>
      </div>

      {step === 1 && (
        <div className="card shadow" style={{ borderRadius: 16, padding: 16 }}>
          <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#475569' }}>When & who</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} style={{ flex: '1 1 140px' }} />
            <input type="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} style={{ flex: '1 1 120px' }} />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className={`pill ${doctorMode === 'pick' ? 'on' : ''}`} style={{ marginRight: 8 }} onClick={() => setDoctorMode('pick')}>My doctors</button>
            <button type="button" className={`pill ${doctorMode === 'new' ? 'on' : ''}`} onClick={() => setDoctorMode('new')}>Someone new</button>
          </div>
          {doctorMode === 'pick' ? (
            <select value={selectedName} onChange={(e) => setSelectedName(e.target.value)} style={{ width: '100%', marginTop: 10 }}>
              <option value="">— Pick a doctor —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          ) : (
            <input value={newDoctorName} onChange={(e) => setNewDoctorName(e.target.value)} placeholder="Doctor name" style={{ width: '100%', marginTop: 10 }} />
          )}
          <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Specialty (optional)" style={{ width: '100%', marginTop: 10 }} />
          <p style={{ margin: '14px 0 4px', fontSize: '0.85rem', color: '#64748b' }}>Main reason — tap a saved/past reason or type</p>
          {chipRow}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="In your own words…" rows={3} style={{ marginTop: 8, width: '100%' }} />
          {reason.trim() && !isReasonPinned(reason) && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.78rem', padding: '3px 10px', marginTop: 4 }}
              onClick={() => pinReason(reason)}
            >
              📌 Save as quick button
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
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={() => void saveStep1()}>
            Continue
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => requestLeave('/app/visits')}>
            Cancel
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="card shadow" style={{ borderRadius: 16, padding: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#475569' }}>Questions for this visit</p>
          <p style={{ margin: '0 0 12px', fontSize: '0.78rem', color: '#94a3b8' }}>
            Same layout as Questions quick log — priority + question text. Add any questions now, or skip.
          </p>
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
                  style={{ width: '100%' }}
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

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(1)}>←</button>
            <button type="button" className="btn btn-primary" style={{ flex: 2 }} disabled={busy} onClick={() => void saveStep2AndGo()}>Next</button>
          </div>
          <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => requestLeave('/app/visits')}>
            Cancel
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="card shadow" style={{ borderRadius: 16, padding: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#475569' }}>Tests, meds & follow-up</p>
          <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#94a3b8' }}>
            Open a section when you are ready. Fill now or save as pending and finish later from Doctor visits.
          </p>

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
                    <input style={{ flex: 2 }} placeholder="Test" value={t.test_name} onChange={(e) => setDvTests((p) => p.map((x, j) => j === i ? { ...x, test_name: e.target.value } : x))} />
                    <input style={{ flex: 2 }} placeholder="Why (optional)" value={t.reason} onChange={(e) => setDvTests((p) => p.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))} />
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
                {dvMeds.map((m, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '0.85rem' }}>{m.medication}{m.dose ? ` · ${m.dose}` : ''}</span>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem' }} onClick={() => setDvMeds((p) => p.map((x, j) => j === i ? { ...x, action: x.action === 'remove' ? 'keep' : 'remove' } : x))}>
                      {m.action === 'remove' ? 'Undo' : 'Remove'}
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <input style={{ flex: '2 1 130px' }} placeholder="New med name" value={newMedEntry.medication} onChange={(e) => setNewMedEntry((p) => ({ ...p, medication: e.target.value }))} />
                  <input style={{ flex: '1 1 80px' }} placeholder="Dose" value={newMedEntry.dose} onChange={(e) => setNewMedEntry((p) => ({ ...p, dose: e.target.value }))} />
                  <input style={{ flex: '1 1 110px' }} placeholder="How often (e.g. twice daily)" value={newMedEntry.frequency} onChange={(e) => setNewMedEntry((p) => ({ ...p, frequency: e.target.value }))} />
                </div>
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
                <textarea value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Findings (optional)" rows={2} style={{ width: '100%' }} />
                <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instructions (optional)" rows={2} style={{ width: '100%' }} />
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} style={{ width: '100%' }} />
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
                    Queued files upload when you tap Save visit or Save as pending below.
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
                  <input type="date" value={nextApptDate} onChange={(e) => setNextApptDate(e.target.value)} style={{ flex: '1 1 140px' }} />
                  <input type="time" value={nextApptTime} onChange={(e) => setNextApptTime(e.target.value)} style={{ flex: '1 1 100px' }} placeholder="Start" title="Start time" />
                  <input type="time" value={nextApptEndTime} onChange={(e) => setNextApptEndTime(e.target.value)} style={{ flex: '1 1 100px' }} placeholder="End" title="End time (optional)" />
                </div>
                {nextApptTime && nextApptEndTime && (
                  <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '4px 0 0' }}>
                    {nextApptTime.slice(0, 5)} – {nextApptEndTime.slice(0, 5)}
                  </p>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void finalizeVisit(false)}>Save visit</button>
            <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => void finalizeVisit(true)}>Save as pending</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep(2)}>← Questions</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => requestLeave('/app/visits')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
})

