import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type Tab = 'pain' | 'symptoms'

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

export function RecordsPage () {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    return (t === 'pain' || t === 'symptoms') ? t : 'pain'
  })
  const [q, setQ] = useState('')
  const [pain, setPain] = useState<PainRow[]>([])
  const [symptoms, setSymptoms] = useState<SymptomRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setError(null)
    async function load () {
      const [p, s] = await Promise.all([
        supabase.from('pain_entries').select('*').eq('user_id', user!.id)
          .order('entry_date', { ascending: false }).limit(100),
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

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return { pain, symptoms }
    const f = (s: string | null) => (s ?? '').toLowerCase().includes(term)
    return {
      pain: pain.filter((r) => f(r.location) || f(String(r.intensity ?? '')) || f(r.pain_type) || f(r.notes) || f(r.relief_methods)),
      symptoms: symptoms.filter((r) => f(r.symptoms) || f(r.activity) || f(r.notes) || f(r.relief) || f(r.severity)),
    }
  }, [q, pain, symptoms])

  if (!user) return null

  return (
    <div>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <BackButton />
          <h2 style={{ margin: 0 }}>Pain & episodes</h2>
        </div>

        <div className="tabs">
          {([['pain', 'Pain'], ['symptoms', 'Episodes']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} type="button"
              className={`tab ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

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
                    {r.symptoms.split(',').map(s => s.trim()).filter(Boolean).map((sym, i) => (
                      <span key={i} style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: 20, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#065f46' }}>
                        {sym}
                      </span>
                    ))}
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
    </div>
  )
}