import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'


type Tab = 'pain' | 'mcas'


type PainRow = {
  id: string; entry_date: string; entry_time: string | null
  location: string | null; intensity: number | null
  pain_type: string | null; triggers: string | null
  relief_methods: string | null; notes: string | null
}


type McasRow = {
  id: string; episode_date: string; episode_time: string | null
  trigger: string; symptoms: string; severity: string | null
  relief: string | null; notes: string | null
}


export function RecordsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('pain')
  const [q, setQ] = useState('')
  const [pain, setPain] = useState<PainRow[]>([])
  const [mcas, setMcas] = useState<McasRow[]>([])
  const [error, setError] = useState<string | null>(null)


  useEffect(() => {
    if (!user) return
    setError(null)
    async function load () {
      const [p, mm] = await Promise.all([
        supabase.from('pain_entries').select('*').eq('user_id', user!.id)
          .order('entry_date', { ascending: false }).limit(100),
        supabase.from('mcas_episodes').select('*').eq('user_id', user!.id)
          .order('episode_date', { ascending: false }).limit(100),
      ])
      if (p.error) setError(p.error.message); else setPain((p.data ?? []) as PainRow[])
      if (mm.error) setError(mm.error.message); else setMcas((mm.data ?? []) as McasRow[])
    }
    load().catch((e) => setError(String(e)))
  }, [user])


  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return { pain, mcas }
    const f = (s: string | null) => (s ?? '').toLowerCase().includes(term)
    return {
      pain: pain.filter((r) => f(r.location) || f(String(r.intensity ?? '')) || f(r.pain_type) || f(r.notes) || f(r.relief_methods)),
      mcas: mcas.filter((r) => f(r.trigger) || f(r.symptoms) || f(r.notes) || f(r.relief)),
    }
  }, [q, pain, mcas])


  if (!user) return null


  return (
    <div>
      {error && <div className="banner error">{error}</div>}


      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
          <h2 style={{ margin: 0 }}>Pain & MCAS summary</h2>
        </div>


        <div className="tabs">
          {([['pain', 'Pain'], ['mcas', 'MCAS']] as [Tab, string][]).map(([id, label]) => (
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


      {/* MCAS */}
      {tab === 'mcas' && (
        <div className="card">
          <h3>MCAS episodes</h3>
          {filtered.mcas.length === 0 ? <p className="muted">No MCAS episodes yet.</p> : null}
          {filtered.mcas.map((r) => (
            <div key={r.id} className="list-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{r.episode_date}{r.episode_time ? ` · ${r.episode_time}` : ''}</strong>
                <span className="muted">{r.severity ? `Severity: ${r.severity}` : ''}</span>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>Triggers: {r.trigger}</div>
              <div className="muted" style={{ marginTop: 4 }}>Symptoms: {r.symptoms}</div>
              {r.relief && <div className="muted" style={{ marginTop: 4 }}>Relief: {r.relief}</div>}
              {r.notes && <div className="muted" style={{ marginTop: 4 }}>Notes: {r.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
