import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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

type Doctor = { id: string; name: string }

function emptyMed () {
  return {
    medication: '', dose: '', frequency: '',
    start_date: new Date().toISOString().slice(0, 10),
    purpose: '', prescribed_by: '', effectiveness: '', side_effects: '', notes: '',
  }
}

function todayISO () { return new Date().toISOString().slice(0, 10) }

export function MedicationsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<MedRow[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState(emptyMed())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Delete archive popup
  const [deleteTarget, setDeleteTarget] = useState<MedRow | null>(null)
  const [deleteReason, setDeleteReason] = useState('')

  // Effect logging
  const [effectForm, setEffectForm] = useState<Record<string, {
    positive: string; side_effects: string; severity: string; score: string; notes: string
  }>>({})
  const [showEffectId, setShowEffectId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    load()
    supabase.from('doctors').select('id, name').eq('user_id', user.id).order('name')
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

  async function saveMed () {
    if (!addForm.medication.trim()) { setError('Medication name is required.'); return }
    setBusy(true)
    const notesVal = addForm.prescribed_by
      ? `Prescribed by: ${addForm.prescribed_by}`
      : (editingId ? rows.find((r) => r.id === editingId)?.notes ?? null : null)

    if (editingId) {
      const { error: e } = await supabase.from('current_medications').update({
        medication: addForm.medication.trim(),
        dose: addForm.dose || null, frequency: addForm.frequency || null,
        start_date: addForm.start_date || null, purpose: addForm.purpose || null,
        effectiveness: addForm.effectiveness || null, side_effects: addForm.side_effects || null,
        notes: notesVal, updated_at: new Date().toISOString(),
      }).eq('id', editingId)
      if (e) { setError(e.message); setBusy(false); return }
    } else {
      const { error: e } = await supabase.from('current_medications').upsert(
        {
          user_id: user!.id, medication: addForm.medication.trim(),
          dose: addForm.dose || null, frequency: addForm.frequency || null,
          start_date: addForm.start_date || null, purpose: addForm.purpose || null,
          effectiveness: addForm.effectiveness || null, side_effects: addForm.side_effects || null,
          notes: notesVal, updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,medication' }
      )
      if (e) { setError(e.message); setBusy(false); return }
    }
    setBusy(false)
    setShowAddForm(false)
    setEditingId(null)
    setAddForm(emptyMed())
    load()
  }

  function startEdit (med: MedRow) {
    const prescribedBy = med.notes?.replace('Prescribed by: ', '') ?? ''
    setAddForm({
      medication: med.medication, dose: med.dose ?? '',
      frequency: med.frequency ?? '', start_date: med.start_date ?? todayISO(),
      purpose: med.purpose ?? '', prescribed_by: prescribedBy,
      effectiveness: med.effectiveness ?? '', side_effects: med.side_effects ?? '',
      notes: med.notes ?? '',
    })
    setEditingId(med.id)
    setShowAddForm(true)
    setExpandedId(null)
  }

  async function confirmDelete () {
    if (!deleteTarget) return
    setBusy(true)
    await supabase.from('medications_archive').insert({
      user_id: user!.id,
      medication: deleteTarget.medication,
      dose: deleteTarget.dose,
      frequency: deleteTarget.frequency,
      start_date: deleteTarget.start_date,
      purpose: deleteTarget.purpose,
      prescribed_by: deleteTarget.notes?.replace('Prescribed by: ', '') ?? null,
      reason_stopped: deleteReason || 'No reason given',
      stopped_date: todayISO(),
      notes: deleteTarget.notes,
    })
    await supabase.from('current_medications').delete().eq('id', deleteTarget.id)
    setBusy(false)
    setDeleteTarget(null)
    setDeleteReason('')
    setBanner(`${deleteTarget.medication} archived.`)
    setTimeout(() => setBanner(null), 4000)
    load()
  }

  async function saveEffect (med: MedRow) {
    const ef = effectForm[med.id]
    if (!ef) return
    setBusy(true)
    const { error: e } = await supabase.from('med_reactions').insert({
      user_id: user!.id,
      reaction_date: todayISO(),
      medication: med.medication, dose: med.dose,
      reaction: ef.side_effects || 'No side effects noted',
      severity: ef.severity || null,
      effect_score: ef.score ? Number(ef.score) : 5,
      notes: [
        ef.positive ? `Positive effects: ${ef.positive}` : '',
        ef.notes,
      ].filter(Boolean).join('\n') || null,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    setBanner('Effects logged!')
    setShowEffectId(null)
    setTimeout(() => setBanner(null), 4000)
  }

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}

      {/* DELETE ARCHIVE POPUP */}
      {deleteTarget && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
        }}>
          <div className="card" style={{ maxWidth: 400, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Remove {deleteTarget.medication}?</h3>
            <p className="muted">This will archive the medication. Why are you stopping it?</p>
            <div className="form-group">
              <label>Reason</label>
              <select value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}>
                <option value="">— Select reason —</option>
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
              <textarea value={deleteReason.startsWith('Other') ? deleteReason : ''}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Any additional details…" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-primary" onClick={confirmDelete} disabled={busy}>Archive medication</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setDeleteTarget(null); setDeleteReason('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
            <h2 style={{ margin: 0 }}>Medications</h2>
          </div>
          <button type="button" className="btn btn-primary"
            onClick={() => { setShowAddForm((v) => !v); setEditingId(null); setAddForm(emptyMed()) }}>
            {showAddForm && !editingId ? 'Cancel' : '+ Add medication'}
          </button>
        </div>
      </div>

      {/* ADD / EDIT FORM */}
      {showAddForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit medication' : 'New medication'}</h3>
          <div className="form-group"><label>Medication name</label><input value={addForm.medication} onChange={(e) => setAddForm({ ...addForm, medication: e.target.value })} placeholder="Medication name" /></div>
          <div className="form-row">
            <div className="form-group"><label>Dose</label><input value={addForm.dose} onChange={(e) => setAddForm({ ...addForm, dose: e.target.value })} placeholder="50mg" /></div>
            <div className="form-group"><label>Frequency</label><input value={addForm.frequency} onChange={(e) => setAddForm({ ...addForm, frequency: e.target.value })} placeholder="Twice daily" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Start date</label><input type="date" value={addForm.start_date} onChange={(e) => setAddForm({ ...addForm, start_date: e.target.value })} /></div>
            <div className="form-group">
              <label>Prescribed by</label>
              <select value={addForm.prescribed_by} onChange={(e) => setAddForm({ ...addForm, prescribed_by: e.target.value })}>
                <option value="">— Select doctor —</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Purpose</label><input value={addForm.purpose} onChange={(e) => setAddForm({ ...addForm, purpose: e.target.value })} placeholder="Pain, inflammation…" /></div>
          <div className="form-row">
            <div className="form-group">
              <label>Effectiveness</label>
              <select value={addForm.effectiveness} onChange={(e) => setAddForm({ ...addForm, effectiveness: e.target.value })}>
                <option value="">—</option>
                <option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option><option>Unknown</option>
              </select>
            </div>
            <div className="form-group"><label>Side effects</label><input value={addForm.side_effects} onChange={(e) => setAddForm({ ...addForm, side_effects: e.target.value })} placeholder="Comma-separated" /></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={saveMed} disabled={busy}>Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowAddForm(false); setEditingId(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {rows.length === 0 && !showAddForm && (
        <div className="card"><p className="muted">No medications yet. Tap "+ Add medication" to get started.</p></div>
      )}

      {rows.map((med) => {
        const isOpen = expandedId === med.id
        const showEffect = showEffectId === med.id
        const ef = effectForm[med.id] ?? { positive: '', side_effects: '', severity: '', score: '', notes: '' }
        const prescribedBy = med.notes?.startsWith('Prescribed by:')
          ? med.notes.replace('Prescribed by: ', '') : null

        return (
          <div key={med.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setExpandedId(isOpen ? null : med.id)}>
              <div>
                <div style={{ fontWeight: 700 }}>{med.medication}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {[med.dose, med.frequency].filter(Boolean).join(' · ') || '—'}
                  {med.purpose ? ` · ${med.purpose}` : ''}
                </div>
                {prescribedBy && <div className="muted" style={{ fontSize: '0.8rem' }}>Prescribed by: {prescribedBy}</div>}
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
                {med.effectiveness && <div className="muted" style={{ fontSize: '0.85rem' }}>Effectiveness: {med.effectiveness}</div>}
                {med.side_effects && <div className="muted" style={{ fontSize: '0.85rem' }}>Side effects: {med.side_effects}</div>}
                {med.start_date && <div className="muted" style={{ fontSize: '0.85rem' }}>Started: {med.start_date}</div>}

                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                    onClick={() => startEdit(med)}>✏️ Edit</button>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                    onClick={() => setShowEffectId(showEffect ? null : med.id)}>
                    {showEffect ? 'Cancel' : '📝 Log effects'}
                  </button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem', color: 'red' }}
                    onClick={() => { setDeleteTarget(med); setDeleteReason('') }}>🗑️ Remove</button>
                </div>

                {showEffect && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 10, background: '#f9f9f9', borderRadius: 10, padding: 12 }}>
                    <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                      Logging effects for <strong>{med.medication}</strong>{med.dose ? ` · ${med.dose}` : ''}
                    </p>
                    <div className="form-group">
                      <label>Positive effects noticed</label>
                      <textarea value={ef.positive} onChange={(e) => setEffectForm((prev) => ({ ...prev, [med.id]: { ...ef, positive: e.target.value } }))} placeholder="What has improved?" />
                    </div>
                    <div className="form-group">
                      <label>Side effects noticed</label>
                      <textarea value={ef.side_effects} onChange={(e) => setEffectForm((prev) => ({ ...prev, [med.id]: { ...ef, side_effects: e.target.value } }))} placeholder="Any negative effects?" />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Severity</label>
                        <select value={ef.severity} onChange={(e) => setEffectForm((prev) => ({ ...prev, [med.id]: { ...ef, severity: e.target.value } }))}>
                          <option value="">—</option>
                          <option>None</option><option>Mild</option><option>Moderate</option><option>Severe</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Overall score 1–10</label>
                        <select value={ef.score} onChange={(e) => setEffectForm((prev) => ({ ...prev, [med.id]: { ...ef, score: e.target.value } }))}>
                          <option value="">Default 5</option>
                          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={String(n)}>{n}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Notes</label>
                      <textarea value={ef.notes} onChange={(e) => setEffectForm((prev) => ({ ...prev, [med.id]: { ...ef, notes: e.target.value } }))} />
                    </div>
                    <button type="button" className="btn btn-primary btn-block" onClick={() => saveEffect(med)} disabled={busy}>Save effects</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}