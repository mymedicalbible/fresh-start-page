import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { ensureDoctorProfile } from '../lib/ensureDoctorProfile'

type DoctorRow = { id: string; name: string; specialty: string | null }

type Props = {
  resumeVisitId?: string | null
  initialDoctorName?: string
  initialSpecialty?: string
  onDone?: () => void
  onCancel?: () => void
}

function todayISO () { return new Date().toISOString().slice(0, 10) }
function nowTime () {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

export function VisitLogWizard ({
  resumeVisitId,
  initialDoctorName = '',
  initialSpecialty = '',
  onDone,
  onCancel,
}: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [doctors, setDoctors] = useState<DoctorRow[]>([])
  const [pastReasons, setPastReasons] = useState<string[]>([])
  const [visitId, setVisitId] = useState<string | null>(resumeVisitId ?? null)

  const [visitDate, setVisitDate] = useState(todayISO())
  const [visitTime, setVisitTime] = useState(nowTime())
  const [doctorMode, setDoctorMode] = useState<'pick' | 'new'>(initialDoctorName ? 'new' : 'pick')
  const [selectedName, setSelectedName] = useState('')
  const [newDoctorName, setNewDoctorName] = useState(initialDoctorName)
  const [specialty, setSpecialty] = useState(initialSpecialty)
  const [reason, setReason] = useState('')

  const [questionLines, setQuestionLines] = useState<string[]>([''])

  const [dvTests, setDvTests] = useState([{ test_name: '', reason: '' }])
  const [newMedEntry, setNewMedEntry] = useState({ medication: '', dose: '', frequency: '' })
  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string; action: 'keep' | 'remove' }[]>([])
  const [findings, setFindings] = useState('')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')
  const [nextApptDate, setNextApptDate] = useState('')
  const [nextApptTime, setNextApptTime] = useState('')

  const effectiveName = doctorMode === 'new' ? newDoctorName.trim() : selectedName

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
    if (visitId) {
      const { error: e } = await supabase.from('doctor_visits').update(payload).eq('id', visitId)
      setBusy(false)
      if (e) { setError(e.message); return }
    } else {
      const { data: rows, error: e } = await supabase.from('doctor_visits').insert(payload).select('id')
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
    const lines = questionLines.map((s) => s.trim()).filter(Boolean)
    setBusy(true)
    if (lines.length > 0) {
      const { error: e } = await supabase.from('doctor_questions').insert(
        lines.map((q) => ({
          user_id: user.id,
          date_created: todayISO(),
          doctor: effectiveName,
          question: q,
          priority: 'Medium',
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
      const { error: apErr } = await supabase.from('appointments').insert({
        user_id: user.id,
        doctor: effectiveName,
        specialty: specialty || null,
        appointment_date: nextApptDate,
        appointment_time: nextApptTime || null,
      })
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
    if (onDone) {
      onDone()
      return
    }
    navigate('/app')
  }

  const chipRow = useMemo(() => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {pastReasons.map((r) => (
        <button
          key={r}
          type="button"
          className="pill"
          style={{ fontSize: '0.78rem' }}
          onClick={() => setReason(r)}
        >
          {r.length > 42 ? `${r.slice(0, 40)}…` : r}
        </button>
      ))}
    </div>
  ), [pastReasons])

  if (!user) return null

  return (
    <div style={{ display: 'grid', gap: 14 }}>
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
          <p style={{ margin: '14px 0 4px', fontSize: '0.85rem', color: '#64748b' }}>Main reason — tap a past reason or type</p>
          {chipRow}
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="In your own words…" rows={3} style={{ marginTop: 8, width: '100%' }} />
          <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy} onClick={() => void saveStep1()}>
            Continue
          </button>
          {onCancel && (
            <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>Back</button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="card shadow" style={{ borderRadius: 16, padding: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#475569' }}>Questions for this visit</p>
          <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#94a3b8' }}>Add any questions now, or skip.</p>
          {questionLines.map((line, i) => (
            <textarea
              key={i}
              value={line}
              rows={2}
              placeholder="Question…"
              style={{ width: '100%', marginBottom: 8 }}
              onChange={(e) => setQuestionLines((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
          ))}
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.85rem' }} onClick={() => setQuestionLines((p) => [...p, ''])}>+ Another question</button>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(1)}>←</button>
            <button type="button" className="btn btn-primary" style={{ flex: 2 }} disabled={busy} onClick={() => void saveStep2AndGo()}>Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card shadow" style={{ borderRadius: 16, padding: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#475569' }}>Tests, meds & follow-up</p>
          <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#94a3b8' }}>Fill now or save as pending and finish later from Doctor visits.</p>

          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Tests discussed</p>
          {dvTests.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input style={{ flex: 2 }} placeholder="Test" value={t.test_name} onChange={(e) => setDvTests((p) => p.map((x, j) => j === i ? { ...x, test_name: e.target.value } : x))} />
              <input style={{ flex: 2 }} placeholder="Why (optional)" value={t.reason} onChange={(e) => setDvTests((p) => p.map((x, j) => j === i ? { ...x, reason: e.target.value } : x))} />
            </div>
          ))}
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => setDvTests((p) => [...p, { test_name: '', reason: '' }])}>+ Test</button>

          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', margin: '12px 0 4px' }}>Medications</p>
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

          <textarea value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="Findings (optional)" rows={2} style={{ width: '100%', marginTop: 10 }} />
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Instructions (optional)" rows={2} style={{ width: '100%', marginTop: 8 }} />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} style={{ width: '100%', marginTop: 8 }} />

          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', margin: '10px 0 4px' }}>Next appointment</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={nextApptDate} onChange={(e) => setNextApptDate(e.target.value)} style={{ flex: 1 }} />
            <input type="time" value={nextApptTime} onChange={(e) => setNextApptTime(e.target.value)} style={{ flex: 1 }} />
          </div>

          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void finalizeVisit(false)}>Save visit</button>
            <button type="button" className="btn btn-secondary btn-block" disabled={busy} onClick={() => void finalizeVisit(true)}>Save as pending</button>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => setStep(2)}>← Questions</button>
          </div>
        </div>
      )}
    </div>
  )
}
