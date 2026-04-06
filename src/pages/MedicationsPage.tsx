import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
import { DoctorPickOrNew } from '../components/DoctorPickOrNew'
import { ensureDoctorProfile } from '../lib/ensureDoctorProfile'

type MedRow = {
  id: string
  medication: string
  dose: string | null
  frequency: string | null
  start_date: string | null
  purpose: string | null
  effectiveness: string | null
  side_effects: string | null
  notes: string | null
}

type ArchivedMed = {
  id: string
  medication: string
  dose: string | null
  frequency: string | null
  start_date: string | null
  purpose: string | null
  prescribed_by: string | null
  reason_stopped: string | null
  stopped_date: string | null
  notes: string | null
}

type Doctor = { id: string; name: string; specialty?: string | null }

type AddForm = {
  medication: string
  dose: string
  prn: boolean
  frequency: string
  start_date: string
  purpose: string
  prescribed_by: string
  prescribed_by_specialty: string
  effectiveness: string
  side_effects: string
}

function emptyMed (): AddForm {
  return {
    medication: '', dose: '', prn: false, frequency: '',
    start_date: new Date().toISOString().slice(0, 10),
    purpose: '', prescribed_by: '', prescribed_by_specialty: '', effectiveness: '', side_effects: '',
  }
}

function todayISO () { return new Date().toISOString().slice(0, 10) }

// ─────────────────────────────────────────────
// POPUP: Add / Edit medication
// ─────────────────────────────────────────────
function MedFormPopup ({
  form, editingId, doctors, busy, error,
  onChange, onSave, onClose,
}: {
  form: AddForm
  editingId: string | null
  doctors: Doctor[]
  busy: boolean
  error: string | null
  onChange: (f: AddForm) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(30,77,52,0.18)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20,
        border: '1.5px solid var(--border)',
        width: '100%', maxWidth: 460,
        maxHeight: '90dvh', overflow: 'auto',
        boxShadow: '0 8px 40px rgba(30,77,52,0.18)',
        padding: '20px 20px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--mint-ink)' }}>
            {editingId ? 'Edit medication' : 'Add medication'}
          </h3>
          <button type="button" onClick={onClose} style={{
            background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 999,
            width: 32, height: 32, cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)',
          }}>x</button>
        </div>

        {error && <div className="banner error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="form-group">
          <label>Medication name</label>
          <input
            value={form.medication}
            onChange={(e) => onChange({ ...form, medication: e.target.value })}
            placeholder="e.g. Propranolol"
            autoFocus
          />
        </div>

        <div className="form-group">
          <label>Dose</label>
          <input
            value={form.dose}
            onChange={(e) => onChange({ ...form, dose: e.target.value })}
            placeholder="e.g. 20mg"
          />
        </div>

        {/* PRN vs Scheduled toggle */}
        <div className="form-group">
          <label>Schedule</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button"
              className={`btn ${!form.prn ? 'btn-mint' : 'btn-secondary'}`}
              style={{ fontSize: '0.82rem', padding: '7px 16px' }}
              onClick={() => onChange({ ...form, prn: false })}>
              Scheduled
            </button>
            <button type="button"
              className={`btn ${form.prn ? 'btn-sky' : 'btn-secondary'}`}
              style={{ fontSize: '0.82rem', padding: '7px 16px' }}
              onClick={() => onChange({ ...form, prn: true, frequency: 'As needed' })}>
              PRN / as needed
            </button>
          </div>
        </div>

        {!form.prn && (
          <div className="form-group">
            <label>Frequency</label>
            <input
              value={form.frequency}
              onChange={(e) => onChange({ ...form, frequency: e.target.value })}
              placeholder="e.g. Three times daily, Once at bedtime"
            />
          </div>
        )}

        <div className="form-group">
          <label>Start date</label>
          <input type="date" value={form.start_date} onChange={(e) => onChange({ ...form, start_date: e.target.value })} />
        </div>
        <DoctorPickOrNew
          doctors={doctors}
          value={form.prescribed_by}
          onChange={(v) => {
            const doc = doctors.find((d) => d.name === v)
            onChange({ ...form, prescribed_by: v, prescribed_by_specialty: doc?.specialty ?? form.prescribed_by_specialty })
          }}
          specialty={form.prescribed_by_specialty}
          onSpecialtyChange={(v) => onChange({ ...form, prescribed_by_specialty: v })}
          showSpecialtyForNew
          label="Prescribed by"
        />

        <div className="form-group">
          <label>Purpose / indication</label>
          <input
            value={form.purpose}
            onChange={(e) => onChange({ ...form, purpose: e.target.value })}
            placeholder="Pain, anxiety, heart rate..."
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Effectiveness</label>
            <select value={form.effectiveness} onChange={(e) => onChange({ ...form, effectiveness: e.target.value })}>
              <option value="">—</option>
              <option>Excellent</option>
              <option>Good</option>
              <option>Fair</option>
              <option>Poor</option>
              <option>Unknown</option>
            </select>
          </div>
          <div className="form-group">
            <label>Side effects</label>
            <input
              value={form.side_effects}
              onChange={(e) => onChange({ ...form, side_effects: e.target.value })}
              placeholder="e.g. fatigue, dizziness"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// POPUP: Log dose change
// ─────────────────────────────────────────────
type DoseChangeForm = {
  dose_previous: string
  dose_new: string
  frequency_previous: string
  frequency_new: string
  effectiveness: string
  side_effects: string
  event_date: string
  event_type: 'adjustment' | 'start' | 'stop'
}

function emptyDoseChange (med: MedRow): DoseChangeForm {
  return {
    dose_previous: med.dose ?? '',
    dose_new: '',
    frequency_previous: med.frequency ?? '',
    frequency_new: '',
    effectiveness: '',
    side_effects: '',
    event_date: todayISO(),
    event_type: 'adjustment',
  }
}

function DoseChangePopup ({
  med, form, busy, error,
  onChange, onSave, onClose,
}: {
  med: MedRow
  form: DoseChangeForm
  busy: boolean
  error: string | null
  onChange: (f: DoseChangeForm) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(30,77,52,0.18)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20,
        border: '1.5px solid var(--border)',
        width: '100%', maxWidth: 420,
        maxHeight: '90dvh', overflow: 'auto',
        boxShadow: '0 8px 40px rgba(30,77,52,0.18)',
        padding: '20px 20px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--sky-ink)' }}>Log dose change</h3>
          <button type="button" onClick={onClose} style={{
            background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 999,
            width: 32, height: 32, cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)',
          }}>x</button>
        </div>
        <div className="muted" style={{ fontSize: '0.8rem', marginBottom: 16 }}>{med.medication}</div>

        {error && <div className="banner error" style={{ marginBottom: 12 }}>{error}</div>}

        <div className="form-group">
          <label>Change type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['adjustment', 'start', 'stop'] as const).map((t) => (
              <button key={t} type="button"
                className={`btn ${form.event_type === t ? 'btn-sky' : 'btn-secondary'}`}
                style={{ fontSize: '0.8rem', padding: '6px 14px', textTransform: 'capitalize' }}
                onClick={() => onChange({ ...form, event_type: t })}>
                {t === 'adjustment' ? 'Dose change' : t === 'start' ? 'Restarted' : 'Stopped'}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Date</label>
          <input type="date" value={form.event_date} onChange={(e) => onChange({ ...form, event_date: e.target.value })} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Previous dose</label>
            <input value={form.dose_previous} onChange={(e) => onChange({ ...form, dose_previous: e.target.value })} placeholder="e.g. 10mg" />
          </div>
          <div className="form-group">
            <label>New dose</label>
            <input value={form.dose_new} onChange={(e) => onChange({ ...form, dose_new: e.target.value })} placeholder="e.g. 20mg" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Previous frequency</label>
            <input value={form.frequency_previous} onChange={(e) => onChange({ ...form, frequency_previous: e.target.value })} placeholder="e.g. Once daily" />
          </div>
          <div className="form-group">
            <label>New frequency</label>
            <input value={form.frequency_new} onChange={(e) => onChange({ ...form, frequency_new: e.target.value })} placeholder="e.g. Twice daily" />
          </div>
        </div>

        <div className="form-group">
          <label>Effectiveness after change (optional)</label>
          <select value={form.effectiveness} onChange={(e) => onChange({ ...form, effectiveness: e.target.value })}>
            <option value="">— Too soon to tell —</option>
            <option>Better</option>
            <option>Same</option>
            <option>Worse</option>
            <option>Much better</option>
            <option>Much worse</option>
          </select>
        </div>

        <div className="form-group">
          <label>Side effects after change (optional)</label>
          <input
            value={form.side_effects}
            onChange={(e) => onChange({ ...form, side_effects: e.target.value })}
            placeholder="e.g. More fatigue, headache..."
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button type="button" className="btn btn-sky" onClick={onSave} disabled={busy} style={{ flex: 1 }}>
            {busy ? 'Saving...' : 'Save change'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// POPUP: Remove medication (archive)
// ─────────────────────────────────────────────
function RemovePopup ({
  med, reason, notes, busy, error,
  onReasonChange, onNotesChange, onConfirm, onClose,
}: {
  med: MedRow
  reason: string
  notes: string
  busy: boolean
  error: string | null
  onReasonChange: (v: string) => void
  onNotesChange: (v: string) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(30,77,52,0.18)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20,
        border: '1.5px solid var(--border)',
        width: '100%', maxWidth: 400,
        boxShadow: '0 8px 40px rgba(30,77,52,0.18)',
        padding: '20px 20px 24px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--danger)' }}>Remove {med.medication}?</h3>
          <button type="button" onClick={onClose} style={{
            background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 999,
            width: 32, height: 32, cursor: 'pointer', fontWeight: 700, fontSize: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)',
          }}>x</button>
        </div>
        <p className="muted" style={{ marginBottom: 16, fontSize: '0.85rem' }}>
          This archives the medication. You can view it in the archive below.
        </p>
        {error && <div className="banner error" style={{ marginBottom: 12 }}>{error}</div>}
        <div className="form-group">
          <label>Reason for stopping</label>
          <select value={reason} onChange={(e) => onReasonChange(e.target.value)}>
            <option value="">— Select a reason —</option>
            <option>No longer needed</option>
            <option>Side effects too severe</option>
            <option>Not effective</option>
            <option>Doctor discontinued</option>
            <option>Completed course</option>
            <option>Allergic reaction</option>
            <option>Cost / insurance</option>
            <option>Other</option>
          </select>
        </div>
        <div className="form-group">
          <label>Additional notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Any extra details..."
            rows={2}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-blush" onClick={onConfirm} disabled={busy || !reason} style={{ flex: 1 }}>
            {busy ? 'Archiving...' : 'Archive'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export function MedicationsPage () {
  const { user } = useAuth()
  const [rows, setRows] = useState<MedRow[]>([])
  const [archived, setArchived] = useState<ArchivedMed[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showArchive, setShowArchive] = useState(false)

  // Add/Edit popup
  const [addForm, setAddForm] = useState<AddForm>(emptyMed())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showMedPopup, setShowMedPopup] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Dose change popup
  const [doseChangeTarget, setDoseChangeTarget] = useState<MedRow | null>(null)
  const [doseChangeForm, setDoseChangeForm] = useState<DoseChangeForm | null>(null)
  const [doseChangeError, setDoseChangeError] = useState<string | null>(null)

  // Remove popup
  const [deleteTarget, setDeleteTarget] = useState<MedRow | null>(null)
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteNotes, setDeleteNotes] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    load()
    loadArchived()
    supabase.from('doctors').select('id, name, specialty').eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors((data ?? []) as Doctor[]))
  }, [user])

  async function load () {
    if (!user) return
    const { data, error: e } = await supabase
      .from('current_medications').select('*')
      .eq('user_id', user.id).order('medication', { ascending: true })
    if (e) setError(e.message)
    else setRows((data ?? []) as MedRow[])
  }

  async function loadArchived () {
    if (!user) return
    const { data, error: e } = await supabase
      .from('medications_archive').select('*')
      .eq('user_id', user.id).order('stopped_date', { ascending: false })
    if (e) setError(e.message)
    else setArchived((data ?? []) as ArchivedMed[])
  }

  async function saveMed () {
    if (!addForm.medication.trim()) { setFormError('Medication name is required.'); return }
    setBusy(true)
    setFormError(null)
    const freq = addForm.prn ? 'As needed' : (addForm.frequency || null)
    const notesVal = addForm.prescribed_by ? `Prescribed by: ${addForm.prescribed_by}` : null

    if (editingId) {
      const { error: e } = await supabase.from('current_medications').update({
        medication: addForm.medication.trim(),
        dose: addForm.dose || null,
        frequency: freq,
        start_date: addForm.start_date || null,
        purpose: addForm.purpose || null,
        effectiveness: addForm.effectiveness || null,
        side_effects: addForm.side_effects || null,
        notes: notesVal,
        updated_at: new Date().toISOString(),
      }).eq('id', editingId)
      if (e) { setFormError(e.message); setBusy(false); return }
    } else {
      const { error: e } = await supabase.from('current_medications').upsert(
        {
          user_id: user!.id,
          medication: addForm.medication.trim(),
          dose: addForm.dose || null,
          frequency: freq,
          start_date: addForm.start_date || null,
          purpose: addForm.purpose || null,
          effectiveness: addForm.effectiveness || null,
          side_effects: addForm.side_effects || null,
          notes: notesVal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,medication' }
      )
      if (e) { setFormError(e.message); setBusy(false); return }
    }
    if (addForm.prescribed_by.trim()) void ensureDoctorProfile(user!.id, addForm.prescribed_by, addForm.prescribed_by_specialty || null)
    setBusy(false)
    setShowMedPopup(false)
    setEditingId(null)
    setAddForm(emptyMed())
    load()
  }

  function openEdit (med: MedRow) {
    const isPrn = med.frequency?.toLowerCase().includes('prn') ||
      med.frequency?.toLowerCase().includes('as needed') ||
      med.frequency?.toLowerCase().includes('as required')
    const prescribedBy = med.notes?.startsWith('Prescribed by:')
      ? med.notes.replace('Prescribed by: ', '').trim()
      : ''
    setAddForm({
      medication: med.medication,
      dose: med.dose ?? '',
      prn: isPrn ?? false,
      frequency: isPrn ? '' : (med.frequency ?? ''),
      start_date: med.start_date ?? todayISO(),
      purpose: med.purpose ?? '',
      prescribed_by: prescribedBy,
      prescribed_by_specialty: '',
      effectiveness: med.effectiveness ?? '',
      side_effects: med.side_effects ?? '',
    })
    setEditingId(med.id)
    setFormError(null)
    setShowMedPopup(true)
    setExpandedId(null)
  }

  async function confirmDelete () {
    if (!deleteTarget) return
    if (!deleteReason) { setDeleteError('Please select a reason.'); return }
    setBusy(true)
    setDeleteError(null)
    const prescribedBy = deleteTarget.notes?.startsWith('Prescribed by:')
      ? deleteTarget.notes.replace('Prescribed by: ', '').trim()
      : null
    const fullReason = deleteNotes.trim() ? `${deleteReason} — ${deleteNotes.trim()}` : deleteReason

    const { error: archiveErr } = await supabase.from('medications_archive').insert({
      user_id: user!.id,
      medication: deleteTarget.medication,
      dose: deleteTarget.dose,
      frequency: deleteTarget.frequency,
      start_date: deleteTarget.start_date,
      purpose: deleteTarget.purpose,
      prescribed_by: prescribedBy,
      reason_stopped: fullReason,
      stopped_date: todayISO(),
      notes: deleteTarget.notes,
    })
    if (archiveErr) { setDeleteError(archiveErr.message); setBusy(false); return }
    await supabase.from('current_medications').delete().eq('id', deleteTarget.id)
    setBusy(false)
    setBanner(`${deleteTarget.medication} archived.`)
    setDeleteTarget(null)
    setDeleteReason('')
    setDeleteNotes('')
    setTimeout(() => setBanner(null), 4000)
    load()
    loadArchived()
  }

  async function saveDoseChange () {
    if (!doseChangeTarget || !doseChangeForm) return
    setBusy(true)
    setDoseChangeError(null)
    const rpcRes = await supabase.rpc('insert_medication_change_event', {
      p_event_date: doseChangeForm.event_date,
      p_medication: doseChangeTarget.medication,
      p_event_type: doseChangeForm.event_type,
      p_dose_previous: doseChangeForm.dose_previous || null,
      p_dose_new: doseChangeForm.dose_new || null,
      p_frequency_previous: doseChangeForm.frequency_previous || null,
      p_frequency_new: doseChangeForm.frequency_new || null,
    })
    if (rpcRes.error) {
      // RPC not available yet — fall back to direct table insert
      const { error: e } = await supabase.from('medication_change_events').insert({
        user_id: user!.id,
        event_date: doseChangeForm.event_date,
        medication: doseChangeTarget.medication,
        event_type: doseChangeForm.event_type,
        dose_previous: doseChangeForm.dose_previous || null,
        dose_new: doseChangeForm.dose_new || null,
        frequency_previous: doseChangeForm.frequency_previous || null,
        frequency_new: doseChangeForm.frequency_new || null,
      })
      if (e) { setDoseChangeError(e.message); setBusy(false); return }
    }

    // If there's effectiveness / side_effects, also update the current med record
    if (doseChangeForm.effectiveness || doseChangeForm.side_effects) {
      await supabase.from('current_medications').update({
        dose: doseChangeForm.dose_new || doseChangeTarget.dose,
        frequency: doseChangeForm.frequency_new || doseChangeTarget.frequency,
        effectiveness: doseChangeForm.effectiveness || doseChangeTarget.effectiveness,
        side_effects: doseChangeForm.side_effects || doseChangeTarget.side_effects,
        updated_at: new Date().toISOString(),
      }).eq('id', doseChangeTarget.id)
    }

    setBusy(false)
    setBanner('Dose change logged.')
    setDoseChangeTarget(null)
    setDoseChangeForm(null)
    setTimeout(() => setBanner(null), 4000)
    load()
  }

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>

      {/* POPUPS */}
      {showMedPopup && (
        <MedFormPopup
          form={addForm}
          editingId={editingId}
          doctors={doctors}
          busy={busy}
          error={formError}
          onChange={setAddForm}
          onSave={saveMed}
          onClose={() => { setShowMedPopup(false); setEditingId(null); setAddForm(emptyMed()) }}
        />
      )}

      {doseChangeTarget && doseChangeForm && (
        <DoseChangePopup
          med={doseChangeTarget}
          form={doseChangeForm}
          busy={busy}
          error={doseChangeError}
          onChange={setDoseChangeForm}
          onSave={saveDoseChange}
          onClose={() => { setDoseChangeTarget(null); setDoseChangeForm(null) }}
        />
      )}

      {deleteTarget && (
        <RemovePopup
          med={deleteTarget}
          reason={deleteReason}
          notes={deleteNotes}
          busy={busy}
          error={deleteError}
          onReasonChange={setDeleteReason}
          onNotesChange={setDeleteNotes}
          onConfirm={confirmDelete}
          onClose={() => { setDeleteTarget(null); setDeleteReason(''); setDeleteNotes('') }}
        />
      )}

      {/* BANNERS */}
      {error && (
        <div className="banner error" onClick={() => setError(null)} style={{ cursor: 'pointer' }}>
          {error}
        </div>
      )}
      {banner && <div className="banner success">{banner}</div>}

      {/* HEADER CARD */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <BackButton />
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Medications</h2>
          </div>
          <button
            type="button"
            className="btn btn-mint"
            onClick={() => { setAddForm(emptyMed()); setEditingId(null); setFormError(null); setShowMedPopup(true) }}
          >
            + Add
          </button>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="card">
          <p className="muted">No medications yet. Tap "+ Add" to get started.</p>
        </div>
      )}

      {/* CURRENT MEDICATIONS */}
      {rows.map((med) => {
        const isOpen = expandedId === med.id
        const prescribedBy = med.notes?.startsWith('Prescribed by:')
          ? med.notes.replace('Prescribed by: ', '').trim()
          : null
        const isPrn = med.frequency?.toLowerCase().includes('prn') ||
          med.frequency?.toLowerCase().includes('as needed')

        return (
          <div key={med.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
              onClick={() => setExpandedId(isOpen ? null : med.id)}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {med.medication}
                  {isPrn && (
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 700,
                      background: 'var(--sky-surface)', color: 'var(--sky-ink)',
                      border: '1px solid var(--sky)', borderRadius: 6, padding: '1px 6px',
                    }}>PRN</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: '0.84rem' }}>
                  {[med.dose, med.frequency].filter(Boolean).join(' · ') || '—'}
                  {med.purpose ? ` · ${med.purpose}` : ''}
                </div>
                {prescribedBy && (
                  <div className="muted" style={{ fontSize: '0.78rem' }}>Rx: {prescribedBy}</div>
                )}
              </div>
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1.5px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
                {med.effectiveness && (
                  <div className="muted" style={{ fontSize: '0.84rem' }}>Effectiveness: {med.effectiveness}</div>
                )}
                {med.side_effects && (
                  <div className="muted" style={{ fontSize: '0.84rem' }}>Side effects: {med.side_effects}</div>
                )}
                {med.start_date && (
                  <div className="muted" style={{ fontSize: '0.84rem' }}>Started: {med.start_date}</div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                    onClick={() => openEdit(med)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn-sky" style={{ fontSize: '0.8rem' }}
                    onClick={() => {
                      setDoseChangeTarget(med)
                      setDoseChangeForm(emptyDoseChange(med))
                      setDoseChangeError(null)
                    }}>
                    Log dose change
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}
                    onClick={() => { setDeleteTarget(med); setDeleteReason(''); setDeleteNotes(''); setDeleteError(null) }}>
                    Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* MEDICATION ARCHIVE */}
      <div style={{ marginTop: 20 }}>
        <button
          type="button"
          className="btn btn-secondary btn-block"
          style={{ justifyContent: 'space-between', marginBottom: 8 }}
          onClick={() => setShowArchive((v) => !v)}
        >
          <span>Medication archive ({archived.length})</span>
          <span style={{ fontWeight: 400 }}>{showArchive ? '▲' : '▼'}</span>
        </button>

        {showArchive && (
          <div style={{ display: 'grid', gap: 8 }}>
            {archived.length === 0 && (
              <div className="card">
                <p className="muted">No archived medications yet.</p>
              </div>
            )}
            {archived.map((a) => (
              <div key={a.id} className="card" style={{ opacity: 0.82 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: 'var(--muted)' }}>{a.medication}</div>
                    <div className="muted" style={{ fontSize: '0.84rem' }}>
                      {[a.dose, a.frequency].filter(Boolean).join(' · ') || '—'}
                      {a.purpose ? ` · ${a.purpose}` : ''}
                    </div>
                    {a.prescribed_by && (
                      <div className="muted" style={{ fontSize: '0.78rem' }}>Rx: {a.prescribed_by}</div>
                    )}
                    {a.start_date && (
                      <div className="muted" style={{ fontSize: '0.78rem' }}>Started: {a.start_date}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="muted" style={{ fontSize: '0.75rem' }}>Stopped</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{a.stopped_date ?? '—'}</div>
                  </div>
                </div>
                {a.reason_stopped && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--bg)', borderRadius: 8, fontSize: '0.83rem', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                    Reason: {a.reason_stopped}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
