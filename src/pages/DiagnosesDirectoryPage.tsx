import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
import { DoctorPickOrNew } from '../components/DoctorPickOrNew'
import { ensureDoctorProfile } from '../lib/ensureDoctorProfile'
import { DIAGNOSIS_STATUS_OPTIONS, type DiagnosisDirectoryStatus } from '../lib/diagnosisStatusOptions'
import { diagnosisDetailFieldsForStatus, howOrWhyFieldLabel } from '../lib/diagnosisDirectoryRow'
import { DiagnosisDetailFields } from '../components/DiagnosisDetailFields'


type DiagnosisRow = {
  id: string
  diagnosis: string
  doctor: string | null
  date_diagnosed: string | null
  status: string
  how_or_why: string | null
  treatment_plan: string | null
  care_plan: string | null
  /** Set when status is Resolved (date the condition was marked resolved). */
  date_resolved: string | null
  /** Set when status is Ruled Out (date it was ruled out). */
  date_ruled_out: string | null
}


type Doctor = { id: string; name: string; specialty?: string | null }
type StatusFilter = 'Active' | 'Closed' | 'All'


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


function todayISO () { return new Date().toISOString().slice(0, 10) }


export function DiagnosesDirectoryPage () {
  const { user } = useAuth()
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
    diagnosis: '',
    doctor: '',
    doctor_specialty: '',
    date_diagnosed: '',
    status: 'Suspected' as DiagnosisDirectoryStatus,
    how_or_why: '',
    treatment_plan: '',
    care_plan: '',
    date_resolved: '',
    date_ruled_out: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)


  useEffect(() => {
    if (!user) return
    load()
    supabase.from('doctors').select('id, name, specialty').eq('user_id', user.id).order('name')
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
    setForm({
      diagnosis: name,
      doctor: '',
      doctor_specialty: '',
      date_diagnosed: todayISO(),
      status: 'Suspected',
      how_or_why: '',
      treatment_plan: '',
      care_plan: '',
      date_resolved: '',
      date_ruled_out: '',
    })
    setSearchText(name)
    setShowForm(true)
  }


  async function saveDiagnosis () {
    if (!form.diagnosis.trim()) { setError('Diagnosis name is required.'); return }
    setBusy(true)
    const detail = diagnosisDetailFieldsForStatus(form.status, {
      how_or_why: form.how_or_why,
      treatment_plan: form.treatment_plan,
      care_plan: form.care_plan,
    })
    const dateResolved = form.status === 'Resolved'
      ? (form.date_resolved.trim() || todayISO())
      : null
    const dateRuledOut = form.status === 'Ruled Out'
      ? (form.date_ruled_out.trim() || todayISO())
      : null
    if (editingId) {
      const { error: e } = await supabase.from('diagnoses_directory').update({
        diagnosis: form.diagnosis.trim(),
        doctor: form.doctor || null,
        date_diagnosed: form.date_diagnosed || null,
        status: form.status,
        how_or_why: detail.how_or_why,
        treatment_plan: detail.treatment_plan,
        care_plan: detail.care_plan,
        date_resolved: dateResolved,
        date_ruled_out: dateRuledOut,
      }).eq('id', editingId)
      if (e) { setError(e.message); setBusy(false); return }
    } else {
      const { error: e } = await supabase.from('diagnoses_directory').insert({
        user_id: user!.id,
        diagnosis: form.diagnosis.trim(),
        doctor: form.doctor || null,
        date_diagnosed: form.date_diagnosed || null,
        status: form.status,
        how_or_why: detail.how_or_why,
        treatment_plan: detail.treatment_plan,
        care_plan: detail.care_plan,
        date_resolved: dateResolved,
        date_ruled_out: dateRuledOut,
      })
      if (e) { setError(e.message); setBusy(false); return }
    }
    setBusy(false)
    if (form.doctor.trim()) void ensureDoctorProfile(user!.id, form.doctor, form.doctor_specialty || null)
    setBanner(editingId ? 'Diagnosis updated!' : 'Diagnosis added!')
    setShowForm(false); setEditingId(null)
    setForm({
      diagnosis: '',
      doctor: '',
      doctor_specialty: '',
      date_diagnosed: '',
      status: 'Suspected',
      how_or_why: '',
      treatment_plan: '',
      care_plan: '',
      date_resolved: '',
      date_ruled_out: '',
    })
    setSearchText(''); setSuggestions([])
    setTimeout(() => setBanner(null), 3000)
    load()
  }


  async function updateStatus (id: string, status: string) {
    const patch: Record<string, unknown> = { status }
    if (status !== 'Confirmed') {
      patch.treatment_plan = null
      patch.care_plan = null
    }
    if (status === 'Resolved') {
      patch.date_resolved = todayISO()
      patch.date_ruled_out = null
    } else if (status === 'Ruled Out') {
      patch.date_ruled_out = todayISO()
      patch.date_resolved = null
    } else {
      patch.date_resolved = null
      patch.date_ruled_out = null
    }
    await supabase.from('diagnoses_directory').update(patch).eq('id', id)
    load()
  }


  function startEdit (row: DiagnosisRow) {
    setEditingId(row.id)
    setForm({
      diagnosis: row.diagnosis,
      doctor: row.doctor ?? '',
      doctor_specialty: '',
      date_diagnosed: row.date_diagnosed ?? '',
      status: row.status as DiagnosisDirectoryStatus,
      how_or_why: row.how_or_why ?? '',
      treatment_plan: row.treatment_plan ?? '',
      care_plan: row.care_plan ?? '',
      date_resolved: row.date_resolved ?? '',
      date_ruled_out: row.date_ruled_out ?? '',
    })
    setSearchText(row.diagnosis)
    setShowForm(true)
  }


  function normStatus (s: string) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ')
  }

  const filtered = rows.filter((r) => {
    const s = normStatus(r.status ?? '')
    if (statusFilter === 'Active') return s === 'suspected' || s === 'confirmed'
    if (statusFilter === 'Closed') return s === 'ruled out' || s === 'resolved'
    return true
  })


  const grouped = filtered.reduce<Record<string, DiagnosisRow[]>>((acc, r) => {
    const key = r.doctor ?? 'No doctor assigned'
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})


  const statusStyle = (status: string) => {
    const s = DIAGNOSIS_STATUS_OPTIONS.find((x) => x.value === status)
    return s ? { background: s.color, color: s.text } : {}
  }


  if (!user) return null


  return (
    <div style={{ paddingBottom: 40 }}>
      <BackButton />
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}


      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>📋 Diagnoses directory</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => {
              setShowForm((v) => !v)
              setEditingId(null)
              setForm({
                diagnosis: '',
                doctor: '',
                doctor_specialty: '',
                date_diagnosed: '',
                status: 'Suspected',
                how_or_why: '',
                treatment_plan: '',
                care_plan: '',
                date_resolved: '',
                date_ruled_out: '',
              })
              setSearchText('')
            }}>
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
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {(['Active', 'Closed', 'All'] as StatusFilter[]).map((f) => (
            <button key={f} type="button"
              className={`btn ${statusFilter === f ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.85rem' }}
              onClick={() => setStatusFilter(f)}
              title={f === 'Closed' ? 'Ruled out or resolved' : undefined}>
              {f}
            </button>
          ))}
          <span className="muted" style={{ fontSize: '0.75rem' }}>Closed = ruled out or resolved</span>
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
              {DIAGNOSIS_STATUS_OPTIONS.map((s) => (
                <button key={s.value} type="button"
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: '0.85rem',
                    fontWeight: 600, border: '2px solid',
                    borderColor: form.status === s.value ? s.text : 'transparent',
                    background: s.color, color: s.text, cursor: 'pointer',
                  }}
                  onClick={() => setForm((prev) => {
                    const status = s.value as DiagnosisDirectoryStatus
                    let date_resolved = prev.date_resolved
                    let date_ruled_out = prev.date_ruled_out
                    if (status === 'Resolved') {
                      date_ruled_out = ''
                      if (!date_resolved.trim()) date_resolved = todayISO()
                    } else if (status === 'Ruled Out') {
                      date_resolved = ''
                      if (!date_ruled_out.trim()) date_ruled_out = todayISO()
                    } else {
                      date_resolved = ''
                      date_ruled_out = ''
                    }
                    return { ...prev, status, date_resolved, date_ruled_out }
                  })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>


          <DoctorPickOrNew
            doctors={doctors}
            value={form.doctor}
            onChange={(v) => {
              const doc = doctors.find((d) => d.name === v)
              setForm({ ...form, doctor: v, doctor_specialty: doc?.specialty ?? form.doctor_specialty })
            }}
            specialty={form.doctor_specialty}
            onSpecialtyChange={(v) => setForm((f) => ({ ...f, doctor_specialty: v }))}
            showSpecialtyForNew
            label="Doctor (optional)"
          />
          <div className="form-group">
            <label>Date diagnosed (optional)</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={form.date_diagnosed}
                onChange={(e) => setForm({ ...form, date_diagnosed: e.target.value })}
                style={{ flex: 1 }} />
              {form.date_diagnosed && (
                <button type="button" className="btn btn-ghost"
                  style={{ padding: '4px 10px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  onClick={() => setForm({ ...form, date_diagnosed: '' })}>
                  Clear
                </button>
              )}
            </div>
          </div>


          <DiagnosisDetailFields
            status={form.status}
            how_or_why={form.how_or_why}
            treatment_plan={form.treatment_plan}
            care_plan={form.care_plan}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          />

          {form.status === 'Resolved' && (
            <div className="form-group">
              <label>Date resolved</label>
              <input
                type="date"
                value={form.date_resolved}
                onChange={(e) => setForm({ ...form, date_resolved: e.target.value })}
              />
            </div>
          )}
          {form.status === 'Ruled Out' && (
            <div className="form-group">
              <label>Date ruled out</label>
              <input
                type="date"
                value={form.date_ruled_out}
                onChange={(e) => setForm({ ...form, date_ruled_out: e.target.value })}
              />
            </div>
          )}

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
            {statusFilter === 'Active' ? 'No active diagnoses yet. Use the quick add chips above!' : statusFilter === 'Closed' ? 'No closed diagnoses yet.' : 'No diagnoses yet.'}
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
                    {r.status === 'Resolved' && r.date_resolved && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>Resolved on: {r.date_resolved}</div>
                    )}
                    {r.status === 'Ruled Out' && r.date_ruled_out && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>Ruled out on: {r.date_ruled_out}</div>
                    )}
                    {r.how_or_why && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                        <strong style={{ fontWeight: 600 }}>{howOrWhyFieldLabel(r.status as DiagnosisDirectoryStatus)}</strong>
                        {' '}
                        {r.how_or_why}
                      </div>
                    )}
                    {r.status === 'Confirmed' && r.treatment_plan && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                        <strong style={{ fontWeight: 600 }}>Treatment plan</strong>
                        {' '}
                        {r.treatment_plan}
                      </div>
                    )}
                    {r.status === 'Confirmed' && r.care_plan && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>
                        <strong style={{ fontWeight: 600 }}>Care plan</strong>
                        {' '}
                        {r.care_plan}
                      </div>
                    )}


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
