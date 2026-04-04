import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  const d = new Date()
  return d.toTimeString().slice(0, 5)
}

export function VisitLogWizard ({ resumeVisitId, initialDoctorName, initialSpecialty, onDone, onCancel }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visitId, setVisitId] = useState<string | null>(resumeVisitId || null)

  const [doctors, setDoctors] = useState<DoctorRow[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [customDoctorName, setCustomDoctorName] = useState(initialDoctorName || '')
  const [specialty, setSpecialty] = useState(initialSpecialty || '')

  const [visitDate, setVisitDate] = useState(todayISO())
  const [visitTime, setVisitTime] = useState(nowTime())
  const [reason, setReason] = useState('')
  const [findings, setFindings] = useState('')
  const [instructions, setInstructions] = useState('')
  const [notes, setNotes] = useState('')

  const [dvMeds, setDvMeds] = useState<{ medication: string; dose: string; action: 'keep' | 'stop' | 'new' }[]>([])
  const [newMedEntry, setNewMedEntry] = useState({ medication: '', dose: '' })
  const [dvTests, setDvTests] = useState<{ test_name: string; reason: string }[]>([{ test_name: '', reason: '' }])
  const [nextApptDate, setNextApptDate] = useState('')

  useEffect(() => {
    if (!user) return
    async function loadDoctors () {
      const { data } = await supabase.from('doctors').select('id, name, specialty').eq('user_id', user!.id).order('name')
      if (data) setDoctors(data)
    }
    loadDoctors()
  }, [user])

  const effectiveName = useMemo(() => {
    if (selectedDoctorId === 'new') return customDoctorName.trim()
    const found = doctors.find(d => d.id === selectedDoctorId)
    return found ? found.name : customDoctorName.trim()
  }, [selectedDoctorId, customDoctorName, doctors])

  const next = () => setStep(s => s + 1)
  const back = () => setStep(s => s - 1)

  async function startVisit () {
    if (!user) return
    if (!effectiveName) { setError('Please select or enter a doctor.'); return }
    setError(null)
    setBusy(true)

    const { data, error: ie } = await supabase.from('doctor_visits').insert({
      user_id: user.id,
      visit_date: visitDate,
      visit_time: visitTime,
      doctor: effectiveName,
      specialty: specialty || null,
      status: 'pending'
    }).select().single()

    if (ie) { setError(ie.message); setBusy(false); return }
    setVisitId(data.id)
    setBusy(false)
    next()
  }

  async function finalizeVisit (asPending: boolean) {
    if (!user || !visitId) return
    if (!effectiveName) { setError('Doctor name missing.'); return }
    setError(null)
    setBusy(true)

    const validTests = dvTests.filter(t => t.test_name.trim())
    const testsStr = validTests.map(t => t.test_name.trim()).join(', ') || null
    
    const medsStr = [
      ...dvMeds.filter(m => m.action === 'keep').map(m => `${m.medication} (${m.dose})`),
      ...(newMedEntry.medication.trim() ? [`${newMedEntry.medication.trim()} (${newMedEntry.dose})`] : [])
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
        validTests.map(t => ({
          user_id: user!.id,
          test_date: visitDate,
          doctor: effectiveName,
          test_name: t.test_name.trim(),
          reason: t.reason || null,
          status: 'Pending'
        }))
      )
    }

    if (!asPending && nextApptDate) {
      await supabase.from('appointments').insert({
        user_id: user.id,
        doctor_id: selectedDoctorId !== 'new' ? selectedDoctorId : null,
        appointment_date: nextApptDate,
        doctor_name: effectiveName,
        reason: 'Follow up'
      })
    }

    setBusy(false)
    onDone?.() ?? navigate('/app/visits')
  }

  return (
    <div className="wizard">
      {error && <div className="card shadow" style={{ color: 'red', marginBottom: '16px' }}>{error}</div>}

      {step === 1 && (
        <div className="card shadow">
          <h2>Clinical Visit</h2>
          <div className="form-group">
            <label>Date & Time</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="date" className="input" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
              <input type="time" className="input" value={visitTime} onChange={e => setVisitTime(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Doctor</label>
            <select className="input" value={selectedDoctorId} onChange={e => setSelectedDoctorId(e.target.value)}>
              <option value="">-- Choose --</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>)}
              <option value="new">+ Add New / Custom</option>
            </select>
          </div>
          {selectedDoctorId === 'new' && (
            <>
              <div className="form-group">
                <input type="text" className="input" placeholder="Doctor Name" value={customDoctorName} onChange={e => setCustomDoctorName(e.target.value)} />
              </div>
              <div className="form-group">
                <input type="text" className="input" placeholder="Specialty (optional)" value={specialty} onChange={e => setSpecialty(e.target.value)} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={startVisit} disabled={busy}>Start Log</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card shadow">
          <h3>Reason for Visit</h3>
          <textarea className="input" rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are you seeing the doctor today?" />
          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={back}>Back</button>
            <button className="btn btn-primary" onClick={next}>Next</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card shadow">
          <h3>Findings & Results</h3>
          <textarea className="input" rows={6} value={findings} onChange={e => setFindings(e.target.value)} placeholder="What did the doctor find? Results of exams?" />
          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={back}>Back</button>
            <button className="btn btn-primary" onClick={next}>Next</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card shadow">
          <h3>Tests & Imaging</h3>
          {dvTests.map((t, idx) => (
            <div key={idx} style={{ marginBottom: '16px', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <input 
                className="input" 
                placeholder="Test Name (e.g. Blood Work, MRI)" 
                value={t.test_name} 
                onChange={e => {
                  const copy = [...dvTests]
                  copy[idx].test_name = e.target.value
                  setDvTests(copy)
                }} 
              />
              <input 
                className="input" 
                style={{ marginTop: '8px' }} 
                placeholder="Reason" 
                value={t.reason} 
                onChange={e => {
                  const copy = [...dvTests]
                  copy[idx].reason = e.target.value
                  setDvTests(copy)
                }} 
              />
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setDvTests([...dvTests, { test_name: '', reason: '' }])}>+ Add Another Test</button>
          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={back}>Back</button>
            <button className="btn btn-primary" onClick={next}>Next</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="card shadow">
          <h3>Medication Changes</h3>
          <div className="form-group">
            <input className="input" placeholder="Medication name" value={newMedEntry.medication} onChange={e => setNewMedEntry({ ...newMedEntry, medication: e.target.value })} />
            <input className="input" style={{ marginTop: '8px' }} placeholder="Dose/Instructions" value={newMedEntry.dose} onChange={e => setNewMedEntry({ ...newMedEntry, dose: e.target.value })} />
          </div>
          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={back}>Back</button>
            <button className="btn btn-primary" onClick={next}>Next</button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="card shadow">
          <h3>Plan & Follow Up</h3>
          <div className="form-group">
            <label>Instructions</label>
            <textarea className="input" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="What did they tell you to do?" />
          </div>
          <div className="form-group">
            <label>Next Appointment Date</label>
            <input type="date" className="input" value={nextApptDate} onChange={e => setNextApptDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Final Notes</label>
            <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any other observations..." />
          </div>
          <div className="wizard-nav">
            <button className="btn btn-ghost" onClick={back}>Back</button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-ghost" onClick={() => finalizeVisit(true)}>Save as Draft</button>
              <button className="btn btn-primary" onClick={() => finalizeVisit(false)}>Complete Visit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}