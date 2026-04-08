import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BackButton } from '../components/BackButton'
import { DoctorPickOrNew } from '../components/DoctorPickOrNew'
import { ensureDoctorProfile } from '../lib/ensureDoctorProfile'


type TestRow = {
  id: string
  test_date: string
  doctor: string | null
  test_name: string
  reason: string | null
  status: string
  results: string | null
  notes: string | null
}


type Doctor = { id: string; name: string; specialty: string | null }


function todayISO () { return new Date().toISOString().slice(0, 10) }

function uniqueFileKey (file: File, testId: string, salt: number) {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : String(Math.random()).slice(2, 10)
  const safe = file.name.replace(/[^\w.\-]+/g, '_').replace(/\s+/g, '-').slice(0, 120)
  const tid = testId.replace(/-/g, '').slice(0, 12)
  return `${tid}-${salt}-${Date.now()}-${rand}-${safe}`
}


export function TestsOrderedPage () {
  const { user } = useAuth()
  const [tests, setTests] = useState<TestRow[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [view, setView] = useState<'current' | 'archived'>('current')
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [docMap, setDocMap] = useState<Record<string, { name: string; signedUrl: string }[]>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [testEntries, setTestEntries] = useState([{ test_name: '', reason: '' }])
  const [formDoctor, setFormDoctor] = useState('')
  const [formDoctorSpecialty, setFormDoctorSpecialty] = useState('')
  const [formDate, setFormDate] = useState(todayISO())
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)


  useEffect(() => {
    if (!user) return
    loadTests()
    loadDoctors()
  }, [user])


  async function loadDoctors () {
    const { data } = await supabase.from('doctors').select('id, name, specialty')
      .eq('user_id', user!.id).order('name')
    setDoctors((data ?? []) as Doctor[])
  }


  async function loadTests () {
    const { data, error: e } = await supabase.from('tests_ordered')
      .select('*').eq('user_id', user!.id)
      .order('test_date', { ascending: false })
    if (e) setError(e.message)
    else setTests((data ?? []) as TestRow[])
  }


  async function saveTests () {
    const valid = testEntries.filter((t) => t.test_name.trim())
    if (valid.length === 0) { setError('Enter at least one test name.'); return }
    setBusy(true)

    const insertPayload = valid.map((t) => ({
      user_id: user!.id,
      test_date: formDate,
      doctor: formDoctor.trim() || null,
      test_name: t.test_name.trim(),
      reason: t.reason || null,
      status: 'Pending',
    }))
    const { data: insertedRows, error: insertErr } = await supabase
      .from('tests_ordered')
      .insert(insertPayload)
      .select('id')
    if (insertErr) {
      setError(insertErr.message)
      setBusy(false)
      return
    }
    const insertedIds = (insertedRows ?? []).map((r) => r.id as string).filter(Boolean)
    if (insertedIds.length !== valid.length) {
      setError(
        `We could not confirm all ${valid.length} test(s) were saved (${insertedIds.length} saved). Refresh the list or try again; if it keeps happening, contact support.`,
      )
      setBusy(false)
      loadTests()
      return
    }

    let uploadFailHint = ''
    if (pendingFiles.length > 0 && insertedIds.length > 0) {
      const uploadErrors: string[] = []
      let salt = 0
      for (const testId of insertedIds) {
        for (const file of pendingFiles) {
          salt += 1
          const folder = `${user!.id}/tests/${testId}`
          const safeName = uniqueFileKey(file, testId, salt)
          const { error: upErr } = await supabase.storage.from('visit-docs')
            .upload(`${folder}/${safeName}`, file, {
              contentType: file.type || 'application/octet-stream',
              upsert: true,
            })
          if (upErr) uploadErrors.push(`${file.name} → ${testId.slice(0, 8)}…: ${upErr.message}`)
        }
      }
      if (uploadErrors.length) {
        setError(`Tests saved, but some file uploads failed. ${uploadErrors[0]}`)
        uploadFailHint = ' Some uploads failed — see message above.'
      }
      for (const testId of insertedIds) await loadDocs(testId)
    }

    if (formDoctor.trim()) void ensureDoctorProfile(user!.id, formDoctor, formDoctorSpecialty || null)
    setBusy(false)
    setBanner(
      pendingFiles.length > 0 && !uploadFailHint
        ? `${valid.length} test(s) saved. Files attached to each new test.`
        : pendingFiles.length > 0
          ? `${valid.length} test(s) saved.${uploadFailHint}`
          : `${valid.length} test(s) saved!`,
    )
    setShowForm(false)
    setTestEntries([{ test_name: '', reason: '' }])
    setFormDoctor('')
    setFormDoctorSpecialty('')
    setFormDate(todayISO())
    setPendingFiles([])
    setTimeout(() => setBanner(null), 4000)
    loadTests()
  }


  async function updateStatus (id: string, status: string) {
    const { error: e } = await supabase.from('tests_ordered')
      .update({ status }).eq('id', id).eq('user_id', user!.id)
    if (e) { setError(e.message); return }
    setTests((prev) => prev.map((t) => t.id === id ? { ...t, status } : t))
  }


  async function loadDocs (testId: string) {
    if (!user) return
    const folder = `${user.id}/tests/${testId}`
    const { data, error: listErr } = await supabase.storage
      .from('visit-docs').list(folder, { limit: 50 })
    if (listErr) {
      setError(`Could not load documents: ${listErr.message}`)
      return
    }
    const files = data ?? []
    if (files.length === 0) {
      setDocMap((prev) => ({ ...prev, [testId]: [] }))
      return
    }
    const signed = await Promise.all(files.map(async (f) => {
      const { data: sd, error: signErr } = await supabase.storage
        .from('visit-docs').createSignedUrl(`${folder}/${f.name}`, 3600)
      if (signErr) return { name: f.name, signedUrl: '' }
      return { name: f.name, signedUrl: sd?.signedUrl ?? '' }
    }))
    setDocMap((prev) => ({ ...prev, [testId]: signed }))
  }


  async function uploadDoc (testId: string, file: File) {
    if (!user) return
    setUploadingId(testId)
    try {
      const folder = `${user.id}/tests/${testId}`
      const safeName = uniqueFileKey(file, testId, Date.now())
      const { error: upErr } = await supabase.storage.from('visit-docs')
        .upload(`${folder}/${safeName}`, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        })
      if (upErr) throw new Error(upErr.message)
      await loadDocs(testId)
      setBanner('Document uploaded!')
      setTimeout(() => setBanner(null), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingId(null)
    }
  }


  const filtered = tests.filter((t) =>
    view === 'current' ? t.status === 'Pending' : t.status === 'Completed' || t.status === 'Archived'
  )


  if (!user) return null


  return (
    <div style={{ paddingBottom: 40 }}>
      <BackButton />
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}
      {banner && <div className="banner success">{banner}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>🧪 Tests & Orders</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ Add orders'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="button"
            className={`btn ${view === 'current' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('current')}>Current</button>
          <button type="button"
            className={`btn ${view === 'archived' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setView('archived')}>Archived</button>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add test orders</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Date ordered</label>
              <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <DoctorPickOrNew
              doctors={doctors}
              value={formDoctor}
              onChange={(v) => {
                setFormDoctor(v)
                const doc = doctors.find((d) => d.name === v)
                setFormDoctorSpecialty(doc?.specialty ?? '')
              }}
              specialty={formDoctorSpecialty}
              onSpecialtyChange={setFormDoctorSpecialty}
              showSpecialtyForNew
              label="Ordered by (optional)"
            />
          </div>

          <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>Tests / orders</label>
          {testEntries.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input style={{ flex: 2 }} value={t.test_name}
                placeholder="Test name (e.g. CBC, MRI knee)"
                onChange={(e) => setTestEntries((prev) => prev.map((x, idx) => idx === i ? { ...x, test_name: e.target.value } : x))} />
              <input style={{ flex: 2 }} value={t.reason} placeholder="Reason (optional)"
                onChange={(e) => setTestEntries((prev) => prev.map((x, idx) => idx === i ? { ...x, reason: e.target.value } : x))} />
              {testEntries.length > 1 && (
                <button type="button" className="btn btn-ghost" style={{ color: 'red' }}
                  onClick={() => setTestEntries((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary" style={{ marginBottom: 12 }}
            onClick={() => setTestEntries((prev) => [...prev, { test_name: '', reason: '' }])}>
            + Add another test
          </button>

          <div className="form-group">
            <label style={{ fontWeight: 600 }}>Attach documents / photos (optional)</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              ref={fileInputRef}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                setPendingFiles((prev) => [...prev, ...files])
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
            />
            {pendingFiles.length > 0 && (
              <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>{f.name}</span>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.75rem', color: 'red' }}
                      onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="button" className="btn btn-primary btn-block" onClick={saveTests} disabled={busy}>
            {busy ? 'Saving…' : 'Save orders'}
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="card">
          <p className="muted">{view === 'current' ? 'No current orders.' : 'No archived orders.'}</p>
        </div>
      )}

      {filtered.map((t) => {
        const isOpen = expandedId === t.id
        const docs = docMap[t.id] ?? []
        const statusStyle = t.status === 'Completed'
          ? { background: '#d1fae5', color: '#065f46' }
          : t.status === 'Archived'
            ? { background: '#e5e7eb', color: '#6b7280' }
            : { background: '#fef3c7', color: '#92400e' }

        return (
          <div key={t.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => {
                setExpandedId(isOpen ? null : t.id)
                if (!isOpen && !docMap[t.id]) loadDocs(t.id)
              }}>
              <div>
                <div style={{ fontWeight: 700 }}>{t.test_name}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {t.test_date}{t.doctor ? ` · ${t.doctor}` : ''}
                </div>
                <span style={{
                  fontSize: '0.75rem', padding: '2px 8px', borderRadius: 20,
                  fontWeight: 600, marginTop: 4, display: 'inline-block', ...statusStyle,
                }}>{t.status}</span>
              </div>
              <span>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 10 }}>
                {t.reason && <div className="muted" style={{ fontSize: '0.85rem' }}>Reason: {t.reason}</div>}
                {t.results && <div className="muted" style={{ fontSize: '0.85rem' }}>Results: {t.results}</div>}
                {t.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>Notes: {t.notes}</div>}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {t.status === 'Pending' && (
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.8rem' }}
                      onClick={async () => { await updateStatus(t.id, 'Completed'); setView('archived') }}>✓ Mark complete</button>
                  )}
                  {(t.status === 'Completed' || t.status === 'Archived') && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8rem' }}
                      onClick={() => updateStatus(t.id, 'Pending')}>Restore to pending</button>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>Documents / photos</div>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={uploadingId === t.id}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      await uploadDoc(t.id, file)
                      e.target.value = ''
                    }}
                  />
                  {uploadingId === t.id && (
                    <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>Uploading…</div>
                  )}
                  <button type="button" className="btn btn-ghost"
                    style={{ fontSize: '0.8rem', marginTop: 6 }}
                    onClick={() => loadDocs(t.id)}>
                    {docs.length > 0 ? 'Refresh docs' : 'Load docs'}
                  </button>
                  {docs.length === 0 && docMap[t.id] !== undefined && (
                    <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>No documents uploaded yet.</div>
                  )}
                  {docs.map((d) => (
                    <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                      <span className="muted" style={{ fontSize: '0.85rem' }}>{d.name}</span>
                      {d.signedUrl && (
                        <a className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                          href={d.signedUrl} target="_blank" rel="noreferrer">View</a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
