import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'


type Doctor = {
  id: string; name: string; specialty: string | null
  clinic: string | null; phone: string | null
  address: string | null; notes: string | null
  archived_at: string | null; archive_reason: string | null
}

type QuestionCount = { doctor: string; count: number }


function emptyForm () {
  return { name: '', specialty: '', clinic: '', phone: '', address: '', notes: '' }
}

function initials (name: string) {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('')
}


export function DoctorsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prefillName = searchParams.get('prefill') ?? ''

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ ...emptyForm(), name: prefillName })
  const [showForm, setShowForm] = useState(!!prefillName)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [archiveModal, setArchiveModal] = useState<{ id: string; name: string } | null>(null)
  const [archiveReason, setArchiveReason] = useState('')


  useEffect(() => {
    if (!user) return
    loadDoctors()
    loadQuestionCounts()
  }, [user])


  async function loadDoctors () {
    const { data, error: e } = await supabase.from('doctors').select('*')
      .eq('user_id', user!.id).order('name', { ascending: true })
    if (e) setError(e.message)
    else setDoctors((data ?? []) as Doctor[])
  }


  async function loadQuestionCounts () {
    const { data } = await supabase.from('doctor_questions')
      .select('doctor')
      .eq('user_id', user!.id)
      .eq('status', 'Unanswered')
    const counts: Record<string, number> = {}
    for (const row of (data ?? []) as QuestionCount[]) {
      if (row.doctor) counts[row.doctor] = (counts[row.doctor] ?? 0) + 1
    }
    setOpenCounts(counts)
  }


  async function saveDoctor () {
    if (!form.name.trim()) { setError('Doctor name is required.'); return }
    setBusy(true)
    if (editingId) {
      const { error: e } = await supabase.from('doctors').update({
        name: form.name.trim(), specialty: form.specialty || null,
        clinic: form.clinic || null, phone: form.phone || null,
        address: form.address || null, notes: form.notes || null,
      }).eq('id', editingId)
      if (e) { setError(e.message); setBusy(false); return }
    } else {
      const { error: e } = await supabase.from('doctors').insert({
        user_id: user!.id, name: form.name.trim(),
        specialty: form.specialty || null, clinic: form.clinic || null,
        phone: form.phone || null, address: form.address || null,
        notes: form.notes || null,
      })
      if (e) { setError(e.message); setBusy(false); return }
    }
    setBusy(false)
    setShowForm(false); setEditingId(null); setForm(emptyForm())
    loadDoctors()
  }


  async function archiveDoctor (id: string, reason: string) {
    const { error: e } = await supabase.from('doctors').update({
      archived_at: new Date().toISOString(),
      archive_reason: reason || null,
    }).eq('id', id)
    if (e) {
      setError(e.message)
      return
    }
    setDoctors((prev) => prev.map((d) => d.id === id
      ? { ...d, archived_at: new Date().toISOString(), archive_reason: reason || null }
      : d
    ))
    setArchiveModal(null)
    setArchiveReason('')
  }

  async function restoreDoctor (id: string) {
    const { error: e } = await supabase.from('doctors').update({ archived_at: null, archive_reason: null }).eq('id', id)
    if (e) {
      setError(e.message)
      return
    }
    setDoctors((prev) => prev.map((d) => d.id === id ? { ...d, archived_at: null, archive_reason: null } : d))
  }


  function startEdit (doc: Doctor) {
    setEditingId(doc.id)
    setForm({
      name: doc.name, specialty: doc.specialty ?? '',
      clinic: doc.clinic ?? '', phone: doc.phone ?? '',
      address: doc.address ?? '', notes: doc.notes ?? '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }


  if (!user) return null


  return (
    <div style={{ paddingBottom: 40 }}>
      <BackButton label="Back" />
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>My Doctors</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(emptyForm()) }}>
            {showForm && !editingId ? 'Cancel' : '+ Add doctor'}
          </button>
        </div>
      </div>


      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editingId ? 'Edit doctor' : 'Add doctor'}</h3>
          <div className="form-group">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dr. Smith" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Specialty</label>
              <input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="Rheumatology" />
            </div>
            <div className="form-group">
              <label>Clinic</label>
              <input value={form.clinic} onChange={(e) => setForm({ ...form, clinic: e.target.value })} placeholder="UCLA Medical" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 000-0000" />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" />
            </div>
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" onClick={saveDoctor} disabled={busy}>Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
          </div>
        </div>
      )}


      {/* ARCHIVE MODAL */}
      {archiveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ maxWidth: 380, width: '100%' }}>
            <h3 style={{ marginTop: 0 }}>Archive {archiveModal.name}?</h3>
            <div className="form-group">
              <label>Reason (optional)</label>
              <input
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="e.g. No longer seeing, retired, moved…"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button type="button" className="btn btn-primary"
                onClick={() => archiveDoctor(archiveModal.id, archiveReason)}>
                Archive
              </button>
              <button type="button" className="btn btn-ghost"
                onClick={() => { setArchiveModal(null); setArchiveReason('') }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(() => {
        const active = doctors.filter((d) => !d.archived_at)
        const archived = doctors.filter((d) => !!d.archived_at)

        return (
          <>
            {active.length === 0 && !showForm && (
              <div className="card"><p className="muted">No doctors added yet.</p></div>
            )}

            {active.map((doc) => {
              const openQ = openCounts[doc.name] ?? 0
              return (
                <div
                  key={doc.id}
                  className="card"
                  style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => navigate(`/app/doctors/${doc.id}`)}>

                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: '50%',
                      background: '#e8f0e0', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontWeight: 700, fontSize: '0.95rem',
                      color: '#4a7a32', flexShrink: 0,
                    }}>
                      {initials(doc.name)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 2 }}>{doc.name}</div>
                      {(doc.specialty || doc.clinic) && (
                        <div className="muted" style={{ fontSize: '0.85rem' }}>
                          {[doc.specialty, doc.clinic].filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {doc.phone && (
                        <div style={{ fontSize: '0.8rem', marginTop: 2 }}>
                          <a
                            href={`tel:${doc.phone.replace(/\s/g, '')}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: '#4a7a32', textDecoration: 'none' }}
                          >
                            📞 {doc.phone}
                          </a>
                        </div>
                      )}
                      {openQ > 0 && (
                        <div style={{
                          display: 'inline-block', marginTop: 6,
                          fontSize: '0.72rem', fontWeight: 700,
                          background: '#fef3c7', color: '#92400e',
                          padding: '2px 8px', borderRadius: 20,
                        }}>
                          {openQ} open question{openQ !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                      <button type="button" className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={(e) => { e.stopPropagation(); startEdit(doc) }}>Edit</button>
                      <button type="button" className="btn btn-ghost"
                        style={{ padding: '4px 10px', fontSize: '0.8rem', color: '#b45309' }}
                        onClick={(e) => { e.stopPropagation(); setArchiveModal({ id: doc.id, name: doc.name }); setArchiveReason('') }}>
                        Archive
                      </button>
                      <span style={{ color: '#aaa', fontSize: '1rem' }}>›</span>
                    </div>
                  </div>
                </div>
              )
            })}

            {archived.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <button type="button"
                  style={{ width: '100%', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onClick={() => setShowArchived((v) => !v)}>
                  <span className="muted" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    📦 Archived doctors ({archived.length})
                  </span>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>{showArchived ? '▲' : '▼'}</span>
                </button>

                {showArchived && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '8px 16px 12px', display: 'grid', gap: 8 }}>
                    {archived.map((doc) => (
                      <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#9ca3af' }}>{doc.name}</div>
                          {doc.archive_reason && (
                            <div className="muted" style={{ fontSize: '0.8rem' }}>Reason: {doc.archive_reason}</div>
                          )}
                          {doc.archived_at && (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              Archived {new Date(doc.archived_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                        <button type="button" className="btn btn-ghost"
                          style={{ fontSize: '0.78rem', padding: '3px 10px', flexShrink: 0 }}
                          onClick={() => restoreDoctor(doc.id)}>
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
