import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { LeaveLaterDialog } from './LeaveLaterDialog'
import {
  clearDoctorNoteDraft,
  loadDoctorNoteDraft,
  saveDoctorNoteDraft,
} from '../lib/doctorNoteDraft'

type DoctorRow = { id: string; name: string; specialty: string | null }

type Props = {
  open: boolean
  initialDoctorId: string | null
  onClose: () => void
}

export function DoctorNoteModal ({ open, initialDoctorId, onClose }: Props) {
  const { user } = useAuth()
  const [doctors, setDoctors] = useState<DoctorRow[]>([])
  const [doctorId, setDoctorId] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumeAsk, setResumeAsk] = useState(false)
  const [leaveAsk, setLeaveAsk] = useState(false)
  const resumeDraftRef = useRef<{ doctorId: string; body: string } | null>(null)

  useEffect(() => {
    if (!open || !user) return
    setError(null)
    setResumeAsk(false)
    resumeDraftRef.current = null
    void (async () => {
      const { data, error: e } = await supabase
        .from('doctors')
        .select('id, name, specialty, archived_at')
        .eq('user_id', user.id)
        .order('name')
      if (e) {
        setDoctors([])
        return
      }
      const rows = ((data ?? []) as (DoctorRow & { archived_at?: string | null })[])
        .filter((r) => !r.archived_at)
        .map(({ id, name, specialty }) => ({ id, name, specialty }))
      setDoctors(rows)

      const draft = loadDoctorNoteDraft(user.id)
      if (draft && (draft.body.trim() || draft.doctorId)) {
        resumeDraftRef.current = { doctorId: draft.doctorId, body: draft.body }
        setResumeAsk(true)
        return
      }

      const preset = initialDoctorId && rows.some((r) => r.id === initialDoctorId)
        ? initialDoctorId
        : rows[0]?.id ?? ''
      setDoctorId(preset)
      setBody('')
    })()
  }, [open, user, initialDoctorId])

  if (!open) return null

  function applyResume () {
    const d = resumeDraftRef.current
    if (!d) return
    const valid = doctors.some((x) => x.id === d.doctorId)
    setDoctorId(valid ? d.doctorId : (doctors[0]?.id ?? ''))
    setBody(d.body)
    setResumeAsk(false)
    resumeDraftRef.current = null
  }

  function declineResume () {
    if (user) clearDoctorNoteDraft()
    setResumeAsk(false)
    resumeDraftRef.current = null
    const rows = doctors
    const preset = initialDoctorId && rows.some((r) => r.id === initialDoctorId)
      ? initialDoctorId
      : rows[0]?.id ?? ''
    setDoctorId(preset)
    setBody('')
  }

  function requestBackdropClose () {
    if (busy) return
    if (!body.trim()) {
      onClose()
      return
    }
    setLeaveAsk(true)
  }

  function requestCancel () {
    if (busy) return
    if (!body.trim()) {
      onClose()
      return
    }
    setLeaveAsk(true)
  }

  async function save () {
    if (!user) return
    const d = doctorId.trim()
    const text = body.trim()
    if (!d) {
      setError('Choose a doctor.')
      return
    }
    if (!text) {
      setError('Write something for your note.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.from('doctor_profile_notes').insert({
      user_id: user.id,
      doctor_id: d,
      body: text,
    })
    setBusy(false)
    if (e) {
      setError(e.message)
      return
    }
    clearDoctorNoteDraft()
    try {
      window.dispatchEvent(new CustomEvent('mb-doctor-note-saved'))
    } catch { /* ignore */ }
    onClose()
  }

  return (
    <div
      className="doctor-note-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doctor-note-title"
      onClick={(ev) => { if (ev.target === ev.currentTarget) requestBackdropClose() }}
    >
      {resumeAsk && (
        <LeaveLaterDialog
          variant="resume"
          onResume={applyResume}
          onFresh={declineResume}
        />
      )}
      {leaveAsk && (
        <LeaveLaterDialog
          variant="saveForLater"
          onYes={() => {
            if (user && doctorId) {
              saveDoctorNoteDraft({ v: 1, userId: user.id, doctorId, body })
            }
            setLeaveAsk(false)
            onClose()
          }}
          onNo={() => {
            clearDoctorNoteDraft()
            setLeaveAsk(false)
            onClose()
          }}
          onStay={() => setLeaveAsk(false)}
        />
      )}
      <div className="doctor-note-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="doctor-note-modal-top">
          <h2 id="doctor-note-title" className="doctor-note-modal-title">Log a note</h2>
        </div>

        <label className="doctor-note-field-label" htmlFor="doctor-note-select">Doctor</label>
        <select
          id="doctor-note-select"
          className="doctor-note-select"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          disabled={resumeAsk}
        >
          <option value="">— Select —</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}{d.specialty ? ` (${d.specialty})` : ''}
            </option>
          ))}
        </select>

        <label className="doctor-note-field-label" htmlFor="doctor-note-body">Note</label>
        <textarea
          id="doctor-note-body"
          className="doctor-note-lined"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your note here…"
          rows={8}
          disabled={resumeAsk}
        />

        {error && <p className="doctor-note-error">{error}</p>}

        <div className="doctor-note-actions">
          <button type="button" className="btn btn-secondary" onClick={requestCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || resumeAsk}>
            {busy ? 'Saving…' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
