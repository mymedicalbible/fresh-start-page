import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, subDays } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parsePainAreas, parseTriggerTokens } from '../lib/parse'

const DAYS = 120

type PainRow = { id: string; entry_date: string; location: string | null; intensity: number | null }
type McasRow = { id: string; episode_date: string; trigger: string }

function safeNum (n: any) {
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

export function AnalyticsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pain, setPain] = useState<PainRow[]>([])
  const [mcas, setMcas] = useState<McasRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    void (async () => {
      try {
        const since = format(subDays(new Date(), DAYS), 'yyyy-MM-dd')
        const [p, m] = await Promise.all([
          supabase.from('pain_entries').select('id, entry_date, location, intensity')
            .eq('user_id', user.id).gte('entry_date', since).order('entry_date', { ascending: true }),
          supabase.from('mcas_episodes').select('id, episode_date, trigger')
            .eq('user_id', user.id).gte('episode_date', since).order('episode_date', { ascending: true }),
        ])
        if (p.error) throw new Error(p.error.message)
        if (m.error) throw new Error(m.error.message)
        setPain((p.data ?? []) as PainRow[])
        setMcas((m.data ?? []) as McasRow[])
      } catch (e: any) { setError(e?.message ?? String(e)) }
    })()
  }, [user])

  const areaStats = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>()
    for (const row of pain) {
      const inten = safeNum(row.intensity)
      if (inten === null) continue
      const areas = parsePainAreas(row.location ?? '')
      for (const a of areas) {
        const cur = map.get(a) ?? { sum: 0, n: 0 }
        cur.sum += inten; cur.n += 1
        map.set(a, cur)
      }
    }
    return [...map.entries()]
      .map(([area, v]) => ({ area, avg: Math.round((v.sum / v.n) * 10) / 10, n: v.n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
  }, [pain])

  const mcasTopTriggers = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of mcas) {
      for (const t of parseTriggerTokens(row.trigger)) map.set(t, (map.get(t) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([trigger, n]) => ({ trigger, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
  }, [mcas])

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
          <h2 style={{ margin: 0 }}>Charts & trends</h2>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>Last {DAYS} days</p>
      </div>

      {/* TOP PAIN AREAS */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Top pain areas</h2>
        {areaStats.length === 0 ? <p className="muted">No pain data yet.</p> : null}
        <div style={{ display: 'grid', gap: 10 }}>
          {areaStats.map((a) => (
            <div key={a.area} className="list-item" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{a.area}</strong>
                <span className="muted">Avg: {a.avg}/10 · {a.n} {a.n === 1 ? 'entry' : 'entries'}</span>
              </div>
              <div style={{ marginTop: 6, background: 'var(--border)', borderRadius: 4, height: 6 }}>
                <div style={{ width: `${(a.avg / 10) * 100}%`, background: '#a78bfa', borderRadius: 4, height: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MCAS TRIGGERS */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>MCAS most common triggers</h2>
        {mcasTopTriggers.length === 0 ? <p className="muted">No MCAS episodes yet.</p> : null}
        <div style={{ display: 'grid', gap: 10 }}>
          {mcasTopTriggers.map((a) => (
            <div key={a.trigger} className="list-item" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{a.trigger}</strong>
                <span className="muted">{a.n} {a.n === 1 ? 'episode' : 'episodes'}</span>
              </div>
              <div style={{ marginTop: 6, background: 'var(--border)', borderRadius: 4, height: 6 }}>
                <div style={{ width: `${(a.n / (mcasTopTriggers[0]?.n || 1)) * 100}%`, background: '#60a5fa', borderRadius: 4, height: 6 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}