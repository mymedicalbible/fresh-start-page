import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type DiagnosisRow = {
  id: string
  diagnosis: string
  doctor: string | null
  date_diagnosed: string | null
  status: string
  notes: string | null
}

type Doctor = { id: string; name: string }
type StatusFilter = 'Active' | 'Archived' | 'All'

const QUICK_ADD_CHIPS = [
  'MCAS', 'POTS', 'EDS', 'Fibromyalgia', 'Lupus', 'Hashimoto\'s',
]

const DIAGNOSIS_SUGGESTIONS = [
  'MCAS', 'POTS', 'EDS (Ehlers-Danlos Syndrome)', 'Fibromyalgia',
  'Lupus (SLE)', 'Hashimoto\'s Thyroiditis', 'Graves Disease',
  'Rheumatoid Arthritis', 'Psoriatic Arthritis', 'Ankylosing Spondylitis',
  'Sjögren\'s Syndrome', 'Multiple Sclerosis', 'Myasthenia Gravis',
  'Celiac Disease', 'Crohn\'s Disease', 'Ulcerative Colitis', 'IBS',
  'SIBO', 'GERD', 'Gastroparesis', 'Dysautonomia', 'Raynaud\'s Phenomenon',
  'Interstitial Cystitis', 'Endometriosis', 'PCOS', 'Hypothyroidism',
  'Hyperthyroidism', 'Adrenal Insufficiency', 'Mast Cell Activation',
  'Chronic Fatigue Syndrome (ME/CFS)', 'Long COVID', 'Lyme Disease',
  'Antiphospholipid Syndrome', 'Mixed Connective Tissue Disease',
  'Undifferentiated Connective Tissue Disease', 'Vasculitis',
  'Hypermobility Spectrum Disorder', 'Idiopathic Intracranial Hypertension',
  'Chiari Malformation', 'Tethered Cord Syndrome', 'Mold Toxicity',
  'Heavy Metal Toxicity', 'Mitochondrial Disease', 'Neuropathy',
  'Small Fiber Neuropathy', 'Migraine', 'Cluster Headaches',
  'Sleep Apnea', 'Narcolepsy', 'Restless Leg Syndrome',
  'Anxiety Disorder', 'Depression', 'PTSD', 'ADHD', 'Autism Spectrum',
]

const STATUS_OPTIONS = [
  { value: 'Suspected', label: '🟡 Suspected', color: '#fef3c7', text: '#92400e' },
  { value: 'Confirmed', label: '🟢 Confirmed', color: '#d1fae5', text: '#065f46' },
  { value: 'Ruled Out', label: '🔴 Ruled out', color: '#fee2e2', text: '#991b1b' },
  { value: 'Resolved', label: '⚪ Resolved', color: '#f3f4f6', text: '#374151' },
]

function todayISO () { return new Date().toISOString().slice(0, 10) }

export function DiagnosesDirectoryPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState<DiagnosisRow[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('Active')
  const [openDoctors, setOpenDoctors] = useState<Record<string, boolean>>({})
  const [showForm, setShowForm] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [form, setForm] = useState({
    diagnosis: '', doctor: '', date_diagnosed: '', status: 'Suspected', notes: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    load()
    supabase.from('doctors').select('id, name').eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors((data ?? []) as Doctor[]))
  }, [user])

  async function load () {
    const { data, error: e } = await supabase
      .from('diagnoses_directory').select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    else setRows((data ?? []) as DiagnosisRow[])
  }

  function handleSearchChange (text: string) {
    setSearchText(text)
    setForm((prev) => ({ ...prev, diagnosis: text }))
    if (text.length > 0) {
      const filtered = DIAGNOSIS_SUGGESTIONS.filter((s) =>
        s.toLowerCase().includes(text.toLowerCase())
      ).slice(0, 6)
      setSuggestions(filtered)
    } else {
      setSuggestions([])
    }
  }

  function selectSuggestion (s: string) {
    setForm((prev) => ({ ...prev, diagnosis: s }))
    setSearchText(s)
    setSuggestions([])
  }

  function quickAdd (name: string) {
    setForm({ diagnosis: name, doctor: '', date_diagnosed: todayISO(), status: 'Suspected', notes: '' })
    setSearchText(name)
    setShowForm(true)
  }

  async function saveDiagnosis () {
    if (!form.diagnosis.trim()) { setError('Diagnosis name is required.'); return }
    setBusy(true)
    if (editingId) {
      const { error: e } = await supabase.from('diagnoses_directory').update({
        diagnosis: form.diagnosis.trim(), doctor: form.doctor || null,
        date_diagnosed: form.date_diagnosed || null, status: form.status,
        notes: form.notes || null,
      }).eq('id', editingId)
      if (e) { setError(e.message); setBusy(false); return }
    } else {
      const { error: e } = await supabase.from('diagnoses_directory').insert({
        user_id: user!.id, diagnosis: form.diagnosis.trim(),
        doctor: form.doctor || null, date_diagnosed: form.date_diagnosed || null,
        status: form.status, notes: form.notes || null,
      })
      if (e) { setError(e.message); setBusy(false); return }
    }
    setBusy(false)
    setBanner(editingId ? 'Diagnosis updated!' : 'Diagnosis added!')
    setShowForm(false); setEditingId(null)
    setForm({ diagnosis: '', doctor: '', date_diagnosed: '', status: 'Suspected', notes: '' })
    setSearchText(''); setSuggestions([])
    setTimeout(() => setBanner(null), 3000)
    load()
  }

  async function updateStatus (id: string, status: string) {
    await supabase.from('diagnoses_directory').update({ status }).eq('id', id)
    load()
  }

  function startEdit (row: DiagnosisRow) {
    setEditingId(row.id)
    setForm({
      diagnosis: row.diagnosis, doctor: row.doctor ?? '',
      date_diagnosed: row.date_diagnosed ?? '', status: row.status,
      notes: row.notes ?? '',
    })
    setSearchText(row.diagnosis)
    setShowForm(true)
  }

  const norm = (s: string) => s.trim().toLowerCase()
  const filtered = rows.filter((r) => {
    const st = norm(r.status)
    if (statusFilter === 'Active') return st === 'suspected' || st === 'confirmed'
    if (statusFilter === 'Archived') return st === 'ruled out' || st === 'resolved'
    return true
  })

  const grouped = filtered.reduce<Record<string, DiagnosisRow[]>>((acc, r) => {
    const key = r.doctor ?? 'No doctor assigned'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  const statusStyle = (status: string) => {
    const s = STATUS_OPTIONS.find((x) => norm(x.value) === norm(status))
    return s ? { background: s.color, color: s.text } : {}
  }

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')}>← Home</button>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>📋 Diagnoses directory</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm({ diagnosis: '', doctor: '', date_diagnosed: '', status: 'Suspected', notes: '' }); setSearchText('') }}>
            {showForm && !editingId ? 'Cancel' : '+ Add diagnosis'}
          </button>
        </div>

        {/* QUICK ADD CHIPS */}
        {!showForm && (
          <div>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 8 }}>Quick add:</p>
            <div className="pill-grid">
              {QUICK_ADD_CHIPS.map((chip) => (
                <button key={chip} type="button" className="pill"
                  onClick={() => quickAdd(chip)}>
                  + {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STATUS FILTER */}
        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <button type="button" className={`btn ${statusFilter === 'Active' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '0.85rem' }} onClick={() => setStatusFilter('Active')}>Active</button>
          <button type="button" className={`btn ${statusFilter === 'Archived' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '0.85rem' }} onClick={() => setStatusFilter('Archived')} title="Resolved and ruled-out diagnoses">Resolved / ruled out</button>
          <button type="button" className={`btn ${statusFilter === 'All' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '0.85rem' }} onClick={() => setStatusFilter('All')}>All</button>
        </div>
      </div>

      {/* ADD / EDIT FORM */}
      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit diagnosis' : 'Add diagnosis'}</h3>

          <div className="form-group" style={{ position: 'relative' }}>
            <label>Diagnosis name</label>
            <input
              value={searchText}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Type or search (e.g. MCAS, POTS, EDS…)"
            />
            {suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0,
                background: '#fff', border: '1px solid var(--border)',
                borderRadius: 8, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}>
                {suggestions.map((s) => (
                  <button key={s} type="button"
                    style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
                    onClick={() => selectSuggestion(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Status</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((s) => (
                <button key={s.value} type="button"
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: '0.85rem',
                    fontWeight: 600, border: '2px solid',
                    borderColor: form.status === s.value ? s.text : 'transparent',
                    background: s.color, color: s.text, cursor: 'pointer',
                  }}
                  onClick={() => setForm((prev) => ({ ...prev, status: s.value }))}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Doctor (optional)</label>
              <select value={form.doctor} onChange={(e) => setForm({ ...form, doctor: e.target.value })}>
                <option value="">— Select doctor —</option>
                {doctors.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Date diagnosed (optional)</label>
              <input type="date" value={form.date_diagnosed}
                onChange={(e) => setForm({ ...form, date_diagnosed: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label>Notes (optional)</label>
            <textarea value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any context, symptoms, or details…" />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={saveDiagnosis} disabled={busy}>Save</button>
            <button type="button" className="btn btn-ghost"
              onClick={() => { setShowForm(false); setEditingId(null); setSearchText('') }}>Cancel</button>
          </div>
        </div>
      )}

      {/* GROUPED LIST */}
      {Object.keys(grouped).length === 0 && (
        <div className="card">
          <p className="muted">
            {statusFilter === 'Active' ? 'No active diagnoses yet. Use the quick add chips above!' : 'No archived diagnoses.'}
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([doctor, diagList]) => {
        const isOpen = openDoctors[doctor] ?? true
        return (
          <div key={doctor} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setOpenDoctors((prev) => ({ ...prev, [doctor]: !isOpen }))}>
              <div>
                <div style={{ fontWeight: 700 }}>👩‍⚕️ {doctor}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>{diagList.length} diagnosis{diagList.length !== 1 ? 'es' : ''}</div>
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 10 }}>
                {diagList.map((r) => (
                  <div key={r.id} className="list-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong>{r.diagnosis}</strong>
                      <span style={{ fontSize: '0.75rem', padding: '2px 10px', borderRadius: 20, fontWeight: 600, ...statusStyle(r.status) }}>
                        {r.status}
                      </span>
                    </div>
                    {r.date_diagnosed && <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>Diagnosed: {r.date_diagnosed}</div>}
                    {r.notes && <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>{r.notes}</div>}

                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                        onClick={() => startEdit(r)}>✏️ Edit</button>
                      {r.status !== 'Confirmed' && (
                        <button type="button" className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#d1fae5', color: '#065f46' }}
                          onClick={() => updateStatus(r.id, 'Confirmed')}>🟢 Confirm</button>
                      )}
                      {r.status !== 'Ruled Out' && (
                        <button type="button" className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#fee2e2', color: '#991b1b' }}
                          onClick={() => updateStatus(r.id, 'Ruled Out')}>🔴 Rule out</button>
                      )}
                      {r.status !== 'Resolved' && (
                        <button type="button" className="btn btn-ghost"
                          style={{ fontSize: '0.75rem', padding: '2px 8px', background: '#f3f4f6', color: '#374151' }}
                          onClick={() => updateStatus(r.id, 'Resolved')}>⚪ Resolve</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}