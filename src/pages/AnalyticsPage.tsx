import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, subDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { parsePainAreas, parseSideEffectTokens, parseTriggerTokens } from '../lib/parse'

const DAYS = 120

type PainRow = {
  id: string
  entry_date: string
  entry_time: string | null
  location: string | null
  intensity: number | null
  pain_type: string | null
  notes: string | null
  triggers: string | null
}

type McasRow = {
  id: string
  episode_date: string
  trigger: string
  severity: string | null
  symptoms: string
  notes: string | null
}

type MedRow = {
  id: string
  updated_at: string
  medication: string
  side_effects: string | null
}

type ReactionRow = {
  id: string
  reaction_date: string
  medication: string
  effect_score: number | null
}

function safeNum (n: any) {
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

function toDayKey (isoDate: string) {
  // isoDate is yyyy-mm-dd already; return it.
  return isoDate
}

export function AnalyticsPage () {
  const { user } = useAuth()

  const [pain, setPain] = useState<PainRow[]>([])
  const [mcas, setMcas] = useState<McasRow[]>([])
  const [meds, setMeds] = useState<MedRow[]>([])
  const [reactions, setReactions] = useState<ReactionRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const [selectedArea, setSelectedArea] = useState<string>('Back')

  useEffect(() => {
    if (!user) return
    setError(null)

    void (async () => {
      try {
        const since = format(subDays(new Date(), DAYS), 'yyyy-MM-dd')
        const [p, m, c, r] = await Promise.all([
          supabase
            .from('pain_entries')
            .select('id, entry_date, entry_time, location, intensity, pain_type, notes, triggers')
            .eq('user_id', user.id)
            .gte('entry_date', since)
            .order('entry_date', { ascending: true }),
          supabase
            .from('mcas_episodes')
            .select('id, episode_date, trigger, severity, symptoms, notes')
            .eq('user_id', user.id)
            .gte('episode_date', since)
            .order('episode_date', { ascending: true }),
          supabase
            .from('current_medications')
            .select('id, updated_at, medication, side_effects')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: true }),
          supabase
            .from('med_reactions')
            .select('id, reaction_date, medication, effect_score')
            .eq('user_id', user.id)
            .gte('reaction_date', since)
            .order('reaction_date', { ascending: true }),
        ])

        if (p.error) throw new Error(p.error.message)
        if (m.error) throw new Error(m.error.message)
        if (c.error) throw new Error(c.error.message)
        if (r.error) throw new Error(r.error.message)

        setPain((p.data ?? []) as PainRow[])
        setMcas((m.data ?? []) as McasRow[])
        setMeds((c.data ?? []) as MedRow[])
        setReactions((r.data ?? []) as ReactionRow[])
      } catch (e: any) {
        setError(e?.message ?? String(e))
      }
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
        cur.sum += inten
        cur.n += 1
        map.set(a, cur)
      }
    }
    const entries = [...map.entries()].map(([area, v]) => ({ area, avg: v.sum / v.n, n: v.n }))
    entries.sort((a, b) => b.n - a.n)
    return entries
  }, [pain])

  const topAreas = useMemo(() => {
    const list = areaStats.slice(0, 5)
    const hasSelected = list.some((x) => x.area === selectedArea)
    if (!hasSelected && list.length > 0) return list[0].area
    return selectedArea
  }, [areaStats, selectedArea])

  const selected = topAreas

  const painSeries = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>()
    for (const row of pain) {
      const inten = safeNum(row.intensity)
      if (inten === null) continue
      const areas = parsePainAreas(row.location ?? '')
      if (!areas.includes(selected)) continue
      const day = toDayKey(row.entry_date)
      const cur = map.get(day) ?? { sum: 0, n: 0 }
      cur.sum += inten
      cur.n += 1
      map.set(day, cur)
    }
    return [...map.entries()]
      .map(([date, { sum, n }]) => ({ date, avg: Math.round((sum / n) * 10) / 10, n }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [pain, selected])

  const mcasTopTriggers = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of mcas) {
      const tokens = parseTriggerTokens(row.trigger)
      for (const t of tokens) map.set(t, (map.get(t) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([trigger, n]) => ({ trigger, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
  }, [mcas])

  const medSideEffectsTop = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of meds) {
      if (!row.side_effects) continue
      const tokens = parseSideEffectTokens(row.side_effects)
      for (const t of tokens) map.set(t, (map.get(t) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([effect, n]) => ({ effect, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 10)
  }, [meds])

  const mcasTopForChart = useMemo(() => {
    return mcasTopTriggers.slice(0, 3).map((x) => x.trigger)
  }, [mcasTopTriggers])

  const mcasDailyCounts = useMemo(() => {
    const top = new Set(mcasTopForChart)
    const dayMap = new Map<string, Record<string, number>>()

    for (const row of mcas) {
      const day = row.episode_date
      const tokens = parseTriggerTokens(row.trigger)
      if (!dayMap.has(day)) dayMap.set(day, {})
      const existing = dayMap.get(day)!
      for (const t of tokens) {
        if (!top.has(t)) continue
        existing[t] = (existing[t] ?? 0) + 1
      }
    }

    const days = [...dayMap.keys()].sort((a, b) => a.localeCompare(b))
    return days.map((date) => {
      const rec = dayMap.get(date) ?? {}
      const out: Record<string, any> = { date }
      for (const t of mcasTopForChart) out[t] = rec[t] ?? 0
      return out
    })
  }, [mcas, mcasTopForChart])

  const sideEffectsTopForChart = useMemo(() => {
    return medSideEffectsTop.slice(0, 3).map((x) => x.effect)
  }, [medSideEffectsTop])

  const sideEffectsDailyCounts = useMemo(() => {
    const top = new Set(sideEffectsTopForChart)
    const dayMap = new Map<string, Record<string, number>>()

    for (const row of meds) {
      const day = row.updated_at ? new Date(row.updated_at).toISOString().slice(0, 10) : null
      if (!day) continue
      if (!row.side_effects) continue
      const tokens = parseSideEffectTokens(row.side_effects)
      if (tokens.length === 0) continue
      if (!dayMap.has(day)) dayMap.set(day, {})
      const existing = dayMap.get(day)!
      for (const t of tokens) {
        if (!top.has(t)) continue
        existing[t] = (existing[t] ?? 0) + 1
      }
    }

    const days = [...dayMap.keys()].sort((a, b) => a.localeCompare(b))
    return days.map((date) => {
      const rec = dayMap.get(date) ?? {}
      const out: Record<string, any> = { date }
      for (const t of sideEffectsTopForChart) out[t] = rec[t] ?? 0
      return out
    })
  }, [meds, sideEffectsTopForChart])

  const medEffectiveness = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>()
    for (const r of reactions) {
      if (!r.medication) continue
      const s = r.effect_score
      if (s === null || s === undefined) continue
      const cur = map.get(r.medication) ?? { sum: 0, n: 0 }
      cur.sum += Number(s)
      cur.n += 1
      map.set(r.medication, cur)
    }
    const arr = [...map.entries()].map(([medication, v]) => ({
      medication,
      avg: Math.round((v.sum / v.n) * 10) / 10,
      n: v.n,
    }))
    arr.sort((a, b) => b.avg - a.avg)
    return arr.slice(0, 10)
  }, [reactions])

  if (!user) return null

  return (
    <div>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Pain by area</h2>
        <p className="muted">We classify your free-text pain locations into consistent areas, so trends stay readable.</p>

        <div className="form-row" style={{ marginTop: 10 }}>
          <div className="form-group">
            <label>Pick an area</label>
            <select value={selected} onChange={(e) => setSelectedArea(e.target.value)}>
              {areaStats.slice(0, 8).map((a) => (
                <option key={a.area} value={a.area}>{a.area} (n={a.n})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Window</label>
            <input disabled value={`${DAYS} days`} />
          </div>
        </div>

        <div className="charts-wrap" style={{ height: 320, marginTop: 12 }}>
          {painSeries.length === 0 ? (
            <p className="muted">Add a few pain entries to see trends.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={painSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avg" name={`Avg intensity: ${selected}`} stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Top pain areas (average)</h2>
        {areaStats.length === 0 ? <p className="muted">No pain data yet.</p> : null}
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {areaStats.slice(0, 6).map((a) => (
            <div key={a.area} className="list-item" style={{ cursor: 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <strong>{a.area}</strong>
                <span className="muted">Avg: {Math.round(a.avg * 10) / 10}/10 · n={a.n}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>MCAS: most common triggers</h2>
        <p className="muted">Charts count your trigger text phrases (comma/semicolon splitting + keyword mapping).</p>
        {mcasTopTriggers.length === 0 ? <p className="muted">No MCAS episodes yet.</p> : null}
        {mcasTopTriggers.length > 0 ? (
          <div className="charts-wrap" style={{ height: 320, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mcasTopTriggers} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="trigger" width={140} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="n" fill="#60a5fa" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>MCAS trigger trend (top 3)</h2>
        <p className="muted">Counts per day, using your normalized trigger tokens.</p>
        {mcasTopForChart.length === 0 || mcasDailyCounts.length === 0 ? <p className="muted">No MCAS data yet.</p> : (
          <div className="charts-wrap" style={{ height: 320, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mcasDailyCounts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                {mcasTopForChart.map((t, idx) => (
                  <Line key={t} type="monotone" dataKey={t} name={t} dot={false} stroke={idx === 0 ? '#60a5fa' : idx === 1 ? '#a78bfa' : '#34d399'} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Medication side effects (from your current list)</h2>
        <p className="muted">This uses the “Side effects” text in your current medications. Update it any time side effects change.</p>
        {medSideEffectsTop.length === 0 ? <p className="muted">No side effects recorded yet.</p> : null}
        {medSideEffectsTop.length > 0 ? (
          <div className="charts-wrap" style={{ height: 320, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={medSideEffectsTop} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="effect" width={140} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="n" fill="#fb7185" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Side effects trend (top 3)</h2>
        <p className="muted">Counts per day based on when you last updated your medication side effects.</p>
        {sideEffectsTopForChart.length === 0 || sideEffectsDailyCounts.length === 0 ? <p className="muted">No side effect data yet.</p> : (
          <div className="charts-wrap" style={{ height: 320, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sideEffectsDailyCounts} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                {sideEffectsTopForChart.map((t, idx) => (
                  <Line key={t} type="monotone" dataKey={t} name={t} dot={false} stroke={idx === 0 ? '#fb7185' : idx === 1 ? '#a78bfa' : '#f59e0b'} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Medication effectiveness (from reaction logs)</h2>
        <p className="muted">Uses your effect score (1–10) in medication reactions.</p>
        {medEffectiveness.length === 0 ? <p className="muted">No scored reactions yet.</p> : null}
        {medEffectiveness.length > 0 ? (
          <div className="charts-wrap" style={{ height: 320, marginTop: 10 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={medEffectiveness.map((x) => ({ medication: x.medication, avg: x.avg, n: x.n }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="category" dataKey="medication" tick={{ fontSize: 10 }} interval={0} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="avg" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </div>
  )
}

