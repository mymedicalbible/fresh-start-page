import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

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
  status: string | null
}

export function VisitsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'pending' ? 'pending' : 'all'

  const [visits, setVisits] = useState<VisitRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    loadVisits()
  }, [user])

  async function loadVisits () {
    const { data, error: e } = await supabase
      .from('doctor_visits').select('*')
      .eq('user_id', user!.id)
      .order('visit_date', { ascending: false })
      .limit(80)
    if (e) setError(e.message)
    else setVisits((data ?? []) as VisitRow[])
  }

  const filtered = useMemo(() => {
    if (tab === 'pending') return visits.filter((v) => (v.status ?? 'complete') === 'pending')
    return visits
  }, [visits, tab])

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      <button type="button" className="btn btn-ghost" onClick={() => navigate('/dashboard')}>← Home</button>
      {error && <div className="banner error" onClick={() => setError(null)}>{error} ✕</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Doctor visits</h2>
          <button type="button" className="btn btn-primary"
            onClick={() => navigate('/log?tab=visit')}>
            + Log visit
          </button>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Use the guided log (same as Quick Log → Visit). Pending visits can be finished anytime.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className={`btn ${tab === 'all' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '0.85rem' }}
            onClick={() => navigate('/visits')}>All</button>
          <button type="button" className={`btn ${tab === 'pending' ? 'btn-primary' : 'btn-secondary'}`} style={{ fontSize: '0.85rem' }}
            onClick={() => navigate('/visits?tab=pending')}>Pending</button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="card"><p className="muted">{tab === 'pending' ? 'No pending visits.' : 'No visits logged yet.'}</p></div>
      )}

      {filtered.map((v) => {
        const isOpen = expandedId === v.id
        const isPending = (v.status ?? 'complete') === 'pending'
        return (
          <div key={v.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => setExpandedId(isOpen ? null : v.id)}>
              <div>
                <div style={{ fontWeight: 700 }}>
                  {v.visit_date}{v.visit_time ? ` · ${v.visit_time}` : ''}
                  {isPending && (
                    <span style={{ marginLeft: 8, fontSize: '0.7rem', padding: '2px 8px', borderRadius: 12, background: '#fef3c7', color: '#92400e' }}>Pending</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {v.doctor ?? '—'}{v.specialty ? ` · ${v.specialty}` : ''}
                </div>
                {v.reason && (
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{v.reason}</div>
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
                {v.notes && <div className="muted" style={{ fontSize: '0.85rem' }}>Notes: {v.notes}</div>}
                {isPending && (
                  <button type="button" className="btn btn-primary" style={{ marginTop: 8 }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/log?tab=visit&resume=${v.id}`) }}>
                    Continue logging
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
