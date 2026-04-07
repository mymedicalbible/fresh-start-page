import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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

  useEffect(() => {
    if (!open || !user) return
    setError(null)
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
      const preset = initialDoctorId && rows.some((r) => r.id === initialDoctorId)
        ? initialDoctorId
        : rows[0]?.id ?? ''
      setDoctorId(preset)
      setBody('')
    })()
  }, [open, user, initialDoctorId])

  if (!open) return null

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
      onClick={(ev) => { if (ev.target === ev.currentTarget) onClose() }}
    >
      <div className="doctor-note-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="doctor-note-modal-top">
          <h2 id="doctor-note-title" className="doctor-note-modal-title">Log a note</h2>
          <button type="button" className="doctor-note-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <label className="doctor-note-field-label" htmlFor="doctor-note-select">Doctor</label>
        <select
          id="doctor-note-select"
          className="doctor-note-select"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
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
        />

        {error && <p className="doctor-note-error">{error}</p>}

        <div className="doctor-note-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>
    </div>
  )
}
