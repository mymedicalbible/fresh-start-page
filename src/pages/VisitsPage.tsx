import { useEffect, useState, useRef } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { safeAppReturnPath } from '../lib/safeReturnPath'
import { normDoctorKey as normDoctorName } from '../lib/doctorNameNorm'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { VisitLogWizard, type VisitLogWizardRef } from '../components/VisitLogWizard'
import {
  deleteVisitDocument,
  listVisitDocuments,
  uploadVisitDocument,
  type VisitDocItem,
} from '../lib/visitDocsStorage'
import { formatTime12h } from '../lib/formatTime12h'
import { VisitNotesWithTranscriptFold } from '../components/VisitNotesWithTranscriptFold'

type Doctor = { id: string; name: string; specialty: string | null }

type VisitRow = {
  id: string
  visit_date: string
  visit_time: string | null
  doctor: string | null
  specialty: string | null
  reason: string | null
  findings: string | null
  tests_ordered: string | null
  new_meds: string | null
  instructions: string | null
  follow_up: string | null
  notes: string | null
  status?: string | null
}

export function VisitsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { pathname, search: locSearch } = useLocation()
  const [searchParams] = useSearchParams()
  const wizardNew = searchParams.get('new') === '1'
  const resumeId = searchParams.get('resume')
  const prefillDoctor = searchParams.get('doctor') ?? ''
  /** With `tab=pending`, restricts the list to this doctor (dashboard upcoming card). */
  const pendingDoctorFilter = prefillDoctor.trim()
  // FIX: read ?tab=pending from URL so dashboard badge works
  const tabParam = searchParams.get('tab')
  const returnRaw = searchParams.get('returnTo')
  const wizardBackPath = safeAppReturnPath(returnRaw, '/app/visits')
  const wizardDonePath = safeAppReturnPath(returnRaw, '/app')

  const [visits, setVisits] = useState<VisitRow[]>([])
  const [listTab, setListTab] = useState<'all' | 'pending'>(
    tabParam === 'pending' ? 'pending' : 'all'
  )
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [visitDocMap, setVisitDocMap] = useState<Record<string, VisitDocItem[]>>({})
  const [visitDocUploading, setVisitDocUploading] = useState<string | null>(null)
  const visitWizardRef = useRef<VisitLogWizardRef>(null)

  useEffect(() => {
    if (!user) return
    loadVisits()
    supabase.from('doctors').select('id, name, specialty')
      .eq('user_id', user.id).order('name')
      .then(({ data }) => setDoctors((data ?? []) as Doctor[]))
  }, [user])

  async function loadVisits () {
    const { data, error: e } = await supabase
      .from('doctor_visits').select('*')
      .eq('user_id', user!.id)
      .order('visit_date', { ascending: false })
      .limit(50)
    if (e) setError(e.message)
    else setVisits((data ?? []) as VisitRow[])
  }

  async function loadVisitDocsForVisit (visitId: string) {
    if (!user) return
    const { docs } = await listVisitDocuments(user.id, visitId)
    setVisitDocMap((prev) => ({ ...prev, [visitId]: docs }))
  }

  if (!user) return null

  if (wizardNew || resumeId) {
    return (
      <div style={{ paddingBottom: 40 }}>
        <VisitLogWizard
          ref={visitWizardRef}
          resumeVisitId={resumeId}
          initialDoctorName={prefillDoctor}
          backPath={wizardBackPath}
          onDone={() => navigate(wizardDonePath)}
        />
      </div>
    )
  }


  return (
    <div style={{ paddingBottom: 40 }}>
      <BackButton label="Back" />
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>🏥 Doctor visits</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate(`/app/visits?new=1&returnTo=${encodeURIComponent(`${pathname}${locSearch}`)}`)}
          >
            Log visit
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button"
            className={`btn ${listTab === 'all' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            onClick={() => setListTab('all')}>All</button>
          <button type="button"
            className={`btn ${listTab === 'pending' ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            onClick={() => setListTab('pending')}>Pending</button>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: '0.88rem', lineHeight: 1.45 }}>
          Tap <strong>Log visit</strong> to add a visit step by step. <strong>Pending</strong> lists visits you have not finished yet (tests, follow-up, etc.).
        </p>
      </div>

      {(() => {
        const listVisits = visits.filter((v) => {
          if (listTab === 'pending') {
            if ((v.status ?? 'complete') !== 'pending') return false
            if (pendingDoctorFilter) {
              const vn = normDoctorName(v.doctor ?? '')
              const fn = normDoctorName(pendingDoctorFilter)
              if (vn !== fn) return false
            }
            return true
          }
          return true
        })
        if (listVisits.length === 0) {
          return (
            <div className="card">
              <p className="muted">
                {listTab === 'pending'
                  ? (pendingDoctorFilter
                      ? `No pending visits for ${pendingDoctorFilter}.`
                      : 'No pending visits. All caught up!')
                  : 'No visits logged yet.'}
              </p>
            </div>
          )
        }
        return listVisits.map((v) => {
          const isOpen = expandedId === v.id
          const isPending = (v.status ?? 'complete') === 'pending'
          const doctorProfileId = v.doctor
            ? doctors.find((d) => d.name === v.doctor)?.id
            : undefined
          return (
            <div key={v.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => {
                  if (isOpen) setExpandedId(null)
                  else {
                    setExpandedId(v.id)
                    void loadVisitDocsForVisit(v.id)
                  }
                }}>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {v.visit_date}{v.visit_time ? ` · ${formatTime12h(v.visit_time)}` : ''}
                    {isPending && (
                      <span style={{ marginLeft: 8, fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#fef3c7', color: '#92400e', verticalAlign: 'middle' }}>
                        Pending
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {doctorProfileId
                      ? (
                        <Link
                          to={`/app/doctors/${doctorProfileId}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}
                        >
                          {v.doctor}
                        </Link>
                        )
                      : (v.doctor ?? '—')}
                    {v.specialty ? ` · ${v.specialty}` : ''}
                  </div>
                  {v.reason && <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{v.reason}</div>}
                  {isPending && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.78rem', marginTop: 8 }}
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(`/app/visits?resume=${v.id}&returnTo=${encodeURIComponent(`${pathname}${locSearch}`)}`)
                      }}
                    >
                      Continue visit
                    </button>
                  )}
                </div>
                <span>{isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'grid', gap: 6 }}>
                  {v.findings && <div className="muted" style={{ fontSize: '0.85rem' }}>Findings: {v.findings}</div>}
                  {v.tests_ordered && <div className="muted" style={{ fontSize: '0.85rem' }}>Tests: {v.tests_ordered}</div>}
                  {v.instructions && <div className="muted" style={{ fontSize: '0.85rem' }}>Instructions: {v.instructions}</div>}
                  {v.follow_up && <div className="muted" style={{ fontSize: '0.85rem' }}>Next appt: {v.follow_up}</div>}
                  <VisitNotesWithTranscriptFold notes={v.notes} />

                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Documents / photos</div>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      disabled={visitDocUploading === v.id}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file || !user) return
                        setVisitDocUploading(v.id)
                        const { error: upErr } = await uploadVisitDocument(user.id, v.id, file, Date.now())
                        if (upErr) setError(upErr.message)
                        await loadVisitDocsForVisit(v.id)
                        setVisitDocUploading(null)
                        e.target.value = ''
                      }}
                    />
                    {visitDocUploading === v.id && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>Uploading…</div>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '0.8rem', marginTop: 6 }}
                      onClick={() => void loadVisitDocsForVisit(v.id)}
                    >
                      Refresh list
                    </button>
                    {(visitDocMap[v.id] ?? []).length === 0 && visitDocMap[v.id] !== undefined && (
                      <div className="muted" style={{ fontSize: '0.85rem', marginTop: 4 }}>No documents yet.</div>
                    )}
                    {(visitDocMap[v.id] ?? []).map((d) => (
                      <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 6, alignItems: 'center' }}>
                        <span className="muted" style={{ fontSize: '0.85rem' }}>{d.name}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {d.signedUrl && (
                            <a className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} href={d.signedUrl} target="_blank" rel="noreferrer">View</a>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: '0.78rem', color: '#b91c1c' }}
                            disabled={visitDocUploading === v.id}
                            onClick={async () => {
                              if (!user) return
                              setVisitDocUploading(v.id)
                              await deleteVisitDocument(user.id, v.id, d.name)
                              await loadVisitDocsForVisit(v.id)
                              setVisitDocUploading(null)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })
      })()}
    </div>
  )
}