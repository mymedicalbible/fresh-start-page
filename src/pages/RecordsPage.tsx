import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { deleteSummaryArchiveItem, loadSummaryArchive, type ArchivedHandoffSummary } from '../lib/summaryArchive'
import { downloadHealthSummaryPdf } from '../lib/summaryPdf'

type Tab = 'pain' | 'symptoms' | 'summaries'

type PainRow = {
  id: string; entry_date: string; entry_time: string | null
  location: string | null; intensity: number | null
  pain_type: string | null; triggers: string | null
  relief_methods: string | null; notes: string | null
}

type SymptomRow = {
  id: string; episode_date: string; episode_time: string | null
  activity: string | null; symptoms: string | null
  severity: string | null; relief: string | null; notes: string | null
}

function tabFromParams (sp: URLSearchParams): Tab {
  const t = sp.get('tab')
  if (t === 'visits') return 'pain'
  if (t === 'pain' || t === 'symptoms' || t === 'summaries') return t
  return 'pain'
}

export function RecordsPage () {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = tabFromParams(searchParams)

  const [q, setQ] = useState('')
  const [pain, setPain] = useState<PainRow[]>([])
  const [symptoms, setSymptoms] = useState<SymptomRow[]>([])
  const [summaries, setSummaries] = useState<ArchivedHandoffSummary[]>([])
  const [expandedSummaryId, setExpandedSummaryId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removingFeature, setRemovingFeature] = useState<string | null>(null)

  function setTab (next: Tab) {
    setSearchParams({ tab: next }, { replace: true })
  }

  useEffect(() => {
    if (!user) return
    setError(null)
    async function load () {
      const [p, s] = await Promise.all([
        supabase.from('pain_entries').select('*').eq('user_id', user!.id)
          .order('entry_date', { ascending: false })
          .order('entry_time', { ascending: false, nullsFirst: false })
          .limit(100),
        supabase.from('mcas_episodes')
          .select('id, episode_date, episode_time, activity, symptoms, severity, relief, notes')
          .eq('user_id', user!.id)
          .order('episode_date', { ascending: false }).limit(100),
      ])
      if (p.error) setError(p.error.message); else setPain((p.data ?? []) as PainRow[])
      if (s.error) setError(s.error.message); else setSymptoms((s.data ?? []) as SymptomRow[])
    }
    load().catch((e) => setError(String(e)))
  }, [user])

  useEffect(() => {
    if (tab === 'summaries') {
      setSummaries(loadSummaryArchive())
    }
  }, [tab])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return { pain, symptoms }
    const f = (s: string | null) => (s ?? '').toLowerCase().includes(term)
    return {
      pain: pain.filter((r) => f(r.location) || f(String(r.intensity ?? '')) || f(r.pain_type) || f(r.notes) || f(r.relief_methods)),
      symptoms: symptoms.filter((r) => f(r.symptoms) || f(r.activity) || f(r.notes) || f(r.relief) || f(r.severity)),
    }
  }, [q, pain, symptoms])

  async function removeFeature (episodeId: string, sym: string) {
    const key = `${episodeId}::${sym}`
    setRemovingFeature(key)
    const episode = symptoms.find((r) => r.id === episodeId)
    if (!episode) { setRemovingFeature(null); return }
    const updated = (episode.symptoms ?? '')
      .split(',').map((s) => s.trim()).filter((s) => s && s !== sym).join(', ') || null
    const { error: e } = await supabase.from('mcas_episodes').update({ symptoms: updated }).eq('id', episodeId)
    setRemovingFeature(null)
    if (e) { setError(e.message); return }
    setSymptoms((prev) => prev.map((r) => r.id === episodeId ? { ...r, symptoms: updated } : r))
  }

  function removeArchivedSummary (id: string) {
    deleteSummaryArchiveItem(id)
    setSummaries(loadSummaryArchive())
    if (expandedSummaryId === id) setExpandedSummaryId(null)
  }

  if (!user) return null

  const tabLabels: [Tab, string][] = [
    ['pain', 'Pain'],
    ['symptoms', 'Episodes'],
    ['summaries', 'Summaries'],
  ]

  return (
    <div>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <BackButton />
          <h2 style={{ margin: 0 }}>Records</h2>
        </div>

        <div className="tabs">
          {tabLabels.map(([id, label]) => (
            <button key={id} type="button"
              className={`tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <Link to="/app/visits" className="btn btn-ghost">View all visits →</Link>

        <div className="form-group" style={{ marginBottom: 6, marginTop: 10 }}>
          <label>Search</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entries…" />
        </div>
      </div>

      {/* PAIN */}
      {tab === 'pain' && (
        <div className="card">
          <h3>Pain log</h3>
          {filtered.pain.length === 0 ? <p className="muted">No pain entries yet.</p> : null}
          {filtered.pain.map((r) => (
            <div key={r.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{r.entry_date}{r.entry_time ? ` · ${r.entry_time}` : ''}</strong>
                <span className="muted">Intensity: {r.intensity ?? '—'}</span>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                {r.location ?? '—'}{r.pain_type ? ` · ${r.pain_type}` : ''}
              </div>
              {r.triggers && <div className="muted" style={{ marginTop: 4 }}>Triggers: {r.triggers}</div>}
              {r.relief_methods && <div className="muted" style={{ marginTop: 4 }}>Relief: {r.relief_methods}</div>}
              {r.notes && <div className="muted" style={{ marginTop: 4 }}>Notes: {r.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* SYMPTOMS */}
      {tab === 'symptoms' && (
        <div className="card">
          <h3>Episode log</h3>
          {filtered.symptoms.length === 0 ? <p className="muted">No episode entries yet.</p> : null}
          {filtered.symptoms.map((r) => (
            <div key={r.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{r.episode_date}{r.episode_time ? ` · ${r.episode_time}` : ''}</strong>
                <span className="muted">{r.severity ? `${r.severity}` : ''}</span>
              </div>
              {r.symptoms && (
                <div style={{ marginTop: 6 }}>
                  <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Features</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {r.symptoms.split(',').map(s => s.trim()).filter(Boolean).map((sym, i) => {
                      const key = `${r.id}::${sym}`
                      return (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', padding: '2px 6px 2px 8px', borderRadius: 20, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#065f46' }}>
                          {sym}
                          <button
                            type="button"
                            disabled={removingFeature === key}
                            onClick={() => removeFeature(r.id, sym)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: '#6b7280', fontSize: '0.7rem', display: 'flex', alignItems: 'center' }}
                            title="Remove feature"
                          >
                            ✕
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
              {r.activity && <div className="muted" style={{ marginTop: 6, fontSize: '0.85rem' }}>Activity: {r.activity}</div>}
              {r.relief && <div className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>Relief: {r.relief}</div>}
              {r.notes && <div className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>Notes: {r.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {/* GENERATED SUMMARIES */}
      {tab === 'summaries' && (
        <div className="card">
          <h3>Generated summary archive</h3>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            Clinical handoff summaries from the dashboard (each <strong>Generate</strong> is kept here). This device only — same list as in the handoff modal.
            {' '}
            <Link to="/app?handoff=1">Open handoff</Link> to run a new one.
          </p>
          {summaries.length === 0 ? (
            <p className="muted">
              No summaries in this archive yet. Open <Link to="/app?handoff=1">Doctor handoff</Link> on the dashboard and tap <strong>Generate</strong> — each run is saved here automatically (this device).
            </p>
          ) : null}
          {summaries.map((a) => {
            const open = expandedSummaryId === a.id
            return (
              <div key={a.id} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div>
                    <strong style={{ fontSize: '0.92rem' }}>{new Date(a.savedAtIso).toLocaleString()}</strong>
                    <div className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                      {a.generatedLabel}
                      {a.sourceAi
                        ? (a.aiKind === 'ollama' ? ' · Ollama' : ' · AI')
                        : ' · App'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                      onClick={() => setExpandedSummaryId(open ? null : a.id)}>
                      {open ? 'Collapse' : 'Read'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                      onClick={() => { void downloadHealthSummaryPdf(a.text, a.generatedLabel) }}>
                      PDF
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '4px 8px', color: 'var(--danger)' }}
                      onClick={() => removeArchivedSummary(a.id)}>
                      Delete
                    </button>
                  </div>
                </div>
                {open && (
                  <div
                    className="summary-readable"
                    style={{
                      marginTop: 12,
                      padding: '12px 14px',
                      background: 'var(--bg)',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      fontSize: '0.88rem',
                      whiteSpace: 'pre-wrap',
                      maxHeight: 360,
                      overflowY: 'auto',
                      lineHeight: 1.45,
                    }}
                  >
                    {a.text}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
