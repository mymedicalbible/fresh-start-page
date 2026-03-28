import { useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parseTriggerTokens } from '../lib/parse'

type PainRow = {
  id: string
  entry_date: string
  entry_time: string | null
  location: string | null
  intensity: number | null
}

type McasRow = {
  id: string
  episode_date: string
  episode_time: string | null
  trigger: string
}

type DayRange = '7' | '30' | '60' | '90' | '120' | 'all'

function safeNum (n: any) {
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

function hourFromTime (time: string | null): number | null {
  if (!time) return null
  const parts = time.split(':')
  if (parts.length < 2) return null
  const h = parseInt(parts[0], 10)
  return Number.isNaN(h) ? null : h
}

export function AnalyticsPage () {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [pain, setPain] = useState<PainRow[]>([])
  const [mcas, setMcas] = useState<McasRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<DayRange>('120')

  useEffect(() => {
    if (!user) return
    void (async () => {
      try {
        const since = range === 'all'
          ? null
          : format(subDays(new Date(), Number(range)), 'yyyy-MM-dd')

        let pq = supabase.from('pain_entries')
          .select('id, entry_date, entry_time, location, intensity')
          .eq('user_id', user.id).order('entry_date', { ascending: true })
        if (since) pq = pq.gte('entry_date', since)

        let mq = supabase.from('mcas_episodes')
          .select('id, episode_date, episode_time, trigger')
          .eq('user_id', user.id).order('episode_date', { ascending: true })
        if (since) mq = mq.gte('episode_date', since)

        const [p, m] = await Promise.all([pq, mq])
        if (p.error) throw new Error(p.error.message)
        if (m.error) throw new Error(m.error.message)
        setPain((p.data ?? []) as PainRow[])
        setMcas((m.data ?? []) as McasRow[])
      } catch (e: any) { setError(e?.message ?? String(e)) }
    })()
  }, [user, range])

  // Parse location into individual labeled areas e.g. "Left Knee", "Right Knee"
  function parseLocationToAreas (location: string): string[] {
    if (!location) return []
    return location.split(',').map((p) => p.trim()).filter(Boolean)
  }

  const areaStats = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>()
    for (const row of pain) {
      const inten = safeNum(row.intensity)
      if (inten === null) continue
      const areas = parseLocationToAreas(row.location ?? '')
      for (const a of areas) {
        const cur = map.get(a) ?? { sum: 0, n: 0 }
        cur.sum += inten; cur.n += 1
        map.set(a, cur)
      }
    }
    return [...map.entries()]
      .map(([area, v]) => ({ area, avg: Math.round((v.sum / v.n) * 10) / 10, n: v.n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
  }, [pain])

  const mcasTopTriggers = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of mcas) {
      for (const t of parseTriggerTokens(row.trigger)) map.set(t, (map.get(t) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([trigger, n]) => ({ trigger, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
  }, [mcas])

  // Time heatmap — pain by hour
  const painByHour = useMemo(() => {
    const map = new Map<number, number>()
    for (let i = 0; i < 24; i++) map.set(i, 0)
    for (const row of pain) {
      const h = hourFromTime(row.entry_time)
      if (h !== null) map.set(h, (map.get(h) ?? 0) + 1)
    }
    return [...map.entries()].map(([hour, count]) => ({ hour, count }))
  }, [pain])

  // Time heatmap — MCAS by hour
  const mcasByHour = useMemo(() => {
    const map = new Map<number, number>()
    for (let i = 0; i < 24; i++) map.set(i, 0)
    for (const row of mcas) {
      const h = hourFromTime(row.episode_time)
      if (h !== null) map.set(h, (map.get(h) ?? 0) + 1)
    }
    return [...map.entries()].map(([hour, count]) => ({ hour, count }))
  }, [mcas])

  const maxPainHour = Math.max(...painByHour.map((h) => h.count), 1)
  const maxMcasHour = Math.max(...mcasByHour.map((h) => h.count), 1)

  function formatHour (h: number) {
    if (h === 0) return '12am'
    if (h < 12) return `${h}am`
    if (h === 12) return '12pm'
    return `${h - 12}pm`
  }

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/app')}>← Home</button>
          <h2 style={{ margin: 0 }}>Charts & trends</h2>
        </div>
        <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
          <label>Date range</label>
          <select value={range} onChange={(e) => setRange(e.target.value as DayRange)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
            <option value="120">Last 120 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {/* TOP PAIN AREAS */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Top pain areas</h2>
        <p className="muted" style={{ fontSize: '0.85rem' }}>Left and right are tracked separately.</p>
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

      {/* PAIN TIME HEATMAP */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Pain by time of day</h2>
        <p className="muted" style={{ fontSize: '0.85rem' }}>Only entries with a logged time are shown.</p>
        {painByHour.every((h) => h.count === 0)
          ? <p className="muted">No timed pain entries yet.</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginTop: 10 }}>
              {painByHour.map(({ hour, count }) => (
                <div key={hour} style={{ textAlign: 'center' }}>
                  <div style={{
                    height: 36, borderRadius: 6,
                    background: count === 0 ? 'var(--border)' : `rgba(167,139,250,${0.2 + (count / maxPainHour) * 0.8})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: count > 0 ? 700 : 400,
                    color: count > 0 ? '#5b21b6' : '#aaa',
                  }}>
                    {count > 0 ? count : ''}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2 }}>{formatHour(hour)}</div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* MCAS TIME HEATMAP */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>MCAS episodes by time of day</h2>
        <p className="muted" style={{ fontSize: '0.85rem' }}>Only episodes with a logged time are shown.</p>
        {mcasByHour.every((h) => h.count === 0)
          ? <p className="muted">No timed MCAS entries yet.</p>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginTop: 10 }}>
              {mcasByHour.map(({ hour, count }) => (
                <div key={hour} style={{ textAlign: 'center' }}>
                  <div style={{
                    height: 36, borderRadius: 6,
                    background: count === 0 ? 'var(--border)' : `rgba(96,165,250,${0.2 + (count / maxMcasHour) * 0.8})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: count > 0 ? 700 : 400,
                    color: count > 0 ? '#1d4ed8' : '#aaa',
                  }}>
                    {count > 0 ? count : ''}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2 }}>{formatHour(hour)}</div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}