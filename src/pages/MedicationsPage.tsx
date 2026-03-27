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

function emptyMed (): Omit<MedRow, 'id'> {
  return {
    medication: '', dose: '', frequency: '',
    start_date: new Date().toISOString().slice(0, 10),
    purpose: '', effectiveness: '', side_effects: '', notes: '',
  }
}

export function MedicationsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<MedRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState(emptyMed())
  const [effectForm, setEffectForm] = useState<Record<string, {
    positive: string; side_effects: string; severity: string; score: string; notes: string
  }>>({})
  const [showEffectId, setShowEffectId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  async function load () {
    if (!user) return
    const { data, error: e } = await supabase
      .from('current_medications').select('*')
      .eq('user_id', user.id).order('medication', { ascending: true })
    if (e) setError(e.message)
    else setRows((data ?? []) as MedRow[])
  }

  useEffect(() => { load() }, [user])

  async function saveMed () {
    if (!addForm.medication.trim()) { setError('Medication name is required.'); return }
    setBusy(true)
    const { error: e } = await supabase.from('current_medications').upsert(
      { user_id: user!.id, ...addForm, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,medication' }
    )
    setBusy(false)
    if (e) { setError(e.message); return }
    setShowAddForm(false)
    setAddForm(emptyMed())
    load()
  }

  async function saveEffect (med: MedRow) {
    const ef = effectForm[med.id]
    if (!ef) return
    setBusy(true)
    const { error: e } = await supabase.from('med_reactions').insert({
      user_id: user!.id,
      reaction_date: new Date().toISOString().slice(0, 10),
      medication: med.medication,
      dose: med.dose,
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
      {error && <div className="banner error">{error}</div>}
      {banner && <div className="banner success">{banner}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
            <h2 style={{ margin: 0 }}>Medications</h2>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Cancel' : '+ Add medication'}
          </button>
        </div>
      </div>

      {/* ADD FORM */}
      {showAddForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>New medication</h3>
          <div className="form-group"><label>Medication name</label><input value={addForm.medication ?? ''} onChange={(e) => setAddForm({ ...addForm, medication: e.target.value })} placeholder="Medication name" /></div>
          <div className="form-row">
            <div className="form-group"><label>Dose</label><input value={addForm.dose ?? ''} onChange={(e) => setAddForm({ ...addForm, dose: e.target.value })} placeholder="50mg" /></div>
            <div className="form-group"><label>Frequency</label><input value={addForm.frequency ?? ''} onChange={(e) => setAddForm({ ...addForm, frequency: e.target.value })} placeholder="Twice daily" /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Start date</label><input type="date" value={addForm.start_date ?? ''} onChange={(e) => setAddForm({ ...addForm, start_date: e.target.value })} /></div>
            <div className="form-group"><label>Purpose</label><input value={addForm.purpose ?? ''} onChange={(e) => setAddForm({ ...addForm, purpose: e.target.value })} placeholder="Pain, inflammation…" /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Effectiveness</label>
              <select value={addForm.effectiveness ?? ''} onChange={(e) => setAddForm({ ...addForm, effectiveness: e.target.value })}>
                <option value="">—</option>
                <option>Excellent</option><option>Good</option><option>Fair</option><option>Poor</option><option>Unknown</option>
              </select>
            </div>
            <div className="form-group"><label>Side effects</label><input value={addForm.side_effects ?? ''} onChange={(e) => setAddForm({ ...addForm, side_effects: e.target.value })} placeholder="Comma-separated" /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea value={addForm.notes ?? ''} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} /></div>
          <button type="button" className="btn btn-primary btn-block" onClick={saveMed} disabled={busy}>Save</button>
        </div>
      )}

      {rows.length === 0 && !showAddForm && (
        <div className="card"><p className="muted">No medications yet. Tap "+ Add medication" to get started.</p></div>
      )}

      {/* MED LIST */}
      {rows.map((med) => {
        const isOpen = expandedId === med.id
        const showEffect = showEffectId === med.id
        const ef = effectForm[med.id] ?? { positive: '', side_effects: '', severity: '', score: '', notes: '' }

        return (
          <div key={med.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* MED HEADER */}
            <div
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setExpandedId(isOpen ? null : med.id)}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{med.medication}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {[med.dose, med.frequency].filter(Boolean).join(' · ') || '—'}
                  {med.purpose ? ` · ${med.purpose}` : ''}
                </div>
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* MED DETAILS */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 8 }}>
                {med.effectiveness && <div className="muted" style={{ fontSize: '0.85rem' }}>Effectiveness: {med.effectiveness}</div>}
                {med.side_effects && <div className="muted" style={{ fontSize: '0.85rem' }}>Side effects: {med.side_effects}</div>}
                {med.start_date && <div className="muted" style={{ fontSize: '0.85rem' }}>Started: {med.start_date}</div>}
                {med.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>Notes: {med.notes}</div>}

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 8 }}
                  onClick={() => setShowEffectId(showEffect ? null : med.id)}
                >
                  {showEffect ? 'Cancel' : '📝 Log effects'}
                </button>

                {/* EFFECTS FORM */}
                {showEffect && (
                  <div style={{ marginTop: 8, display: 'grid', gap: 10, background: '#f9f9f9', borderRadius: 10, padding: 12 }}>
                    <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                      Logging effects for <strong>{med.medication}</strong>
                      {med.dose ? ` · ${med.dose}` : ''}
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