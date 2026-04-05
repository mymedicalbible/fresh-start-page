import { useEffect, useMemo, useState } from 'react'
import { format, subDays } from 'date-fns'
import { BackButton } from '../components/BackButton'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type PainRow = {
  id: string
  entry_date: string
  entry_time: string | null
  location: string | null
  intensity: number | null
}

type SymptomRow = {
  id: string
  episode_date: string
  episode_time: string | null
  activity: string | null
  symptoms: string | null
  severity: string | null
}

type DayRange = '7' | '30' | '60' | '90' | '120' | 'all'

type HourPopup = {
  type: 'pain' | 'symptoms'
  hour: number
  items: { label: string; sub: string }[]
  avgIntensity?: number
} | null

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

function formatHour (h: number) {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function parseLocationToAreas (location: string): string[] {
  if (!location) return []
  return location.split(',').map((p) => p.trim()).filter(Boolean)
}

function parseSymptomTokens (text: string | null): string[] {
  if (!text) return []
  return text.split(',').map(s => s.trim()).filter(Boolean)
}

export function AnalyticsPage () {
  const { user } = useAuth()
  const [pain, setPain] = useState<PainRow[]>([])
  const [symptomEpisodes, setSymptomEpisodes] = useState<SymptomRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<DayRange>('120')
  const [popup, setPopup] = useState<HourPopup>(null)
  const [loading, setLoading] = useState(true)
  const [expandPainAreas, setExpandPainAreas] = useState(false)
  const [expandSymptoms, setExpandSymptoms] = useState(false)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    void (async () => {
      try {
        const since = range === 'all'
          ? null
          : format(subDays(new Date(), Number(range)), 'yyyy-MM-dd')

        let pq = supabase.from('pain_entries')
          .select('id, entry_date, entry_time, location, intensity')
          .eq('user_id', user.id).order('entry_date', { ascending: true })
        if (since) pq = pq.gte('entry_date', since)

        let sq = supabase.from('mcas_episodes')
          .select('id, episode_date, episode_time, activity, symptoms, severity')
          .eq('user_id', user.id).order('episode_date', { ascending: true })
        if (since) sq = sq.gte('episode_date', since)

        const [p, s] = await Promise.all([pq, sq])
        if (p.error) throw new Error(p.error.message)
        if (s.error) throw new Error(s.error.message)
        setPain((p.data ?? []) as PainRow[])
        setSymptomEpisodes((s.data ?? []) as SymptomRow[])
      } catch (e: any) { setError(e?.message ?? String(e)) }
      finally { setLoading(false) }
    })()
  }, [user, range])

  // Top pain areas
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
      .sort((a, b) => b.n - a.n).slice(0, 10)
  }, [pain])

  // Top symptoms by frequency (replaces MCAS triggers)
  const topSymptoms = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of symptomEpisodes) {
      for (const s of parseSymptomTokens(row.symptoms)) {
        map.set(s, (map.get(s) ?? 0) + 1)
      }
    }
    return [...map.entries()]
      .map(([symptom, n]) => ({ symptom, n }))
      .sort((a, b) => b.n - a.n).slice(0, 10)
  }, [symptomEpisodes])

  // Pain by hour
  const painByHour = useMemo(() => {
    const map = new Map<number, { count: number; entries: PainRow[] }>()
    for (let i = 0; i < 24; i++) map.set(i, { count: 0, entries: [] })
    for (const row of pain) {
      const h = hourFromTime(row.entry_time)
      if (h !== null) {
        const cur = map.get(h)!
        cur.count += 1
        cur.entries.push(row)
        map.set(h, cur)
      }
    }
    return [...map.entries()].map(([hour, data]) => ({ hour, ...data }))
  }, [pain])

  // Symptoms by hour (replaces MCAS by hour)
  const symptomsByHour = useMemo(() => {
    const map = new Map<number, { count: number; entries: SymptomRow[] }>()
    for (let i = 0; i < 24; i++) map.set(i, { count: 0, entries: [] })
    for (const row of symptomEpisodes) {
      const h = hourFromTime(row.episode_time)
      if (h !== null) {
        const cur = map.get(h)!
        cur.count += 1
        cur.entries.push(row)
        map.set(h, cur)
      }
    }
    return [...map.entries()].map(([hour, data]) => ({ hour, ...data }))
  }, [symptomEpisodes])

  const maxPainHour = Math.max(...painByHour.map((h) => h.count), 1)
  const maxSympHour = Math.max(...symptomsByHour.map((h) => h.count), 1)
  const hasPainHourData = painByHour.some((h) => h.count > 0)
  const hasSympHourData = symptomsByHour.some((h) => h.count > 0)

  function openPainPopup (hour: number, entries: PainRow[]) {
    if (entries.length === 0) return
    const intensities = entries.map((e) => safeNum(e.intensity)).filter((x): x is number => x !== null)
    const avg = intensities.length > 0
      ? Math.round((intensities.reduce((a, b) => a + b, 0) / intensities.length) * 10) / 10
      : undefined
    setPopup({
      type: 'pain', hour, avgIntensity: avg,
      items: entries.map((e) => ({
        label: e.location ?? 'Unknown area',
        sub: `${e.entry_date} · Intensity: ${e.intensity ?? '—'}`,
      })),
    })
  }

  function openSymptomsPopup (hour: number, entries: SymptomRow[]) {
    if (entries.length === 0) return
    setPopup({
      type: 'symptoms', hour,
      items: entries.map((e) => ({
        label: e.symptoms ?? 'No episode features listed',
        sub: `${e.episode_date}${e.severity ? ` · ${e.severity}` : ''}${e.activity ? ` · ${e.activity}` : ''}`,
      })),
    })
  }

  const visiblePainAreas = expandPainAreas ? areaStats : areaStats.slice(0, 3)
  const visibleSymptoms = expandSymptoms ? topSymptoms : topSymptoms.slice(0, 3)

  if (!user) return null

  return (
    <div style={{ paddingBottom: 40 }}>
      {error && <div className="banner error">{error}</div>}

      {/* POPUP */}
      {popup && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={() => setPopup(null)}>
          <div className="card" style={{ maxWidth: 360, width: '100%', maxHeight: '70vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>
                {popup.type === 'pain' ? '🩹 Pain' : '🩺 Episodes'} at {formatHour(popup.hour)}
              </h3>
              <button type="button" className="btn btn-ghost" onClick={() => setPopup(null)}>✕</button>
            </div>
            {popup.avgIntensity !== undefined && (
              <div style={{ marginBottom: 10, padding: '6px 12px', background: '#f5f3ff', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, color: '#5b21b6' }}>
                Avg intensity: {popup.avgIntensity}/10
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              {popup.items.map((item, i) => (
                <div key={i} className="list-item">
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.label}</div>
                  <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HEADER + DATE RANGE */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <BackButton label="Back" style={{ marginBottom: 0 }} className="btn btn-ghost" />
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

      {loading && <div className="card"><p className="muted">Loading data…</p></div>}

      {!loading && (
        <>
          {/* TOP PAIN AREAS — collapsible, top 3 default */}
          <div className="card">
            <button type="button" onClick={() => setExpandPainAreas(v => !v)}
              style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <h2 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>Top pain areas</span>
                <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400 }}>{expandPainAreas ? '▲' : '▼'}</span>
              </h2>
            </button>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: -8 }}>Left and right tracked separately.</p>
            {areaStats.length === 0
              ? <p className="muted">No pain data yet.</p>
              : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {visiblePainAreas.map((a) => (
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
              )}
            {!expandPainAreas && areaStats.length > 3 && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: '0.85rem' }}
                onClick={() => setExpandPainAreas(true)}>
                Show all ({areaStats.length})
              </button>
            )}
          </div>

          {/* TOP SYMPTOMS — replaces MCAS triggers */}
          <div className="card">
            <button type="button" onClick={() => setExpandSymptoms(v => !v)}
              style={{ width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <h2 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>Most common episode features</span>
                <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 400 }}>{expandSymptoms ? '▲' : '▼'}</span>
              </h2>
            </button>
            {topSymptoms.length === 0
              ? <p className="muted">No episodes logged yet.</p>
              : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {visibleSymptoms.map((s) => (
                    <div key={s.symptom} className="list-item" style={{ cursor: 'default' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <strong>{s.symptom}</strong>
                        <span className="muted">{s.n} {s.n === 1 ? 'time' : 'times'}</span>
                      </div>
                      <div style={{ marginTop: 6, background: 'var(--border)', borderRadius: 4, height: 6 }}>
                        <div style={{ width: `${(s.n / (topSymptoms[0]?.n || 1)) * 100}%`, background: '#34d399', borderRadius: 4, height: 6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            {!expandSymptoms && topSymptoms.length > 3 && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 8, fontSize: '0.85rem' }}
                onClick={() => setExpandSymptoms(true)}>
                Show all ({topSymptoms.length})
              </button>
            )}
          </div>

          {/* PAIN TIME HEATMAP */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Pain by time of day</h2>
            <p className="muted" style={{ fontSize: '0.85rem' }}>Tap a cell to see what was logged at that time.</p>
            {!hasPainHourData
              ? <p className="muted">No timed pain entries yet.</p>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginTop: 10 }}>
                  {painByHour.map(({ hour, count, entries }) => (
                    <div key={hour} style={{ textAlign: 'center' }}>
                      <button type="button" onClick={() => openPainPopup(hour, entries)}
                        style={{
                          width: '100%', height: 36, borderRadius: 6, border: 'none',
                          background: count === 0 ? 'var(--border)' : `rgba(167,139,250,${0.2 + (count / maxPainHour) * 0.8})`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', fontWeight: count > 0 ? 700 : 400,
                          color: count > 0 ? '#5b21b6' : '#aaa',
                          cursor: count > 0 ? 'pointer' : 'default',
                        }}>
                        {count > 0 ? count : ''}
                      </button>
                      <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2 }}>{formatHour(hour)}</div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* SYMPTOMS TIME HEATMAP — replaces MCAS by time */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Episodes by time of day</h2>
            <p className="muted" style={{ fontSize: '0.85rem' }}>Tap a cell to see what was logged in episode entries at that time.</p>
            {!hasSympHourData
              ? <p className="muted">No timed episode entries yet.</p>
              : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginTop: 10 }}>
                  {symptomsByHour.map(({ hour, count, entries }) => (
                    <div key={hour} style={{ textAlign: 'center' }}>
                      <button type="button" onClick={() => openSymptomsPopup(hour, entries)}
                        style={{
                          width: '100%', height: 36, borderRadius: 6, border: 'none',
                          background: count === 0 ? 'var(--border)' : `rgba(52,211,153,${0.2 + (count / maxSympHour) * 0.8})`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', fontWeight: count > 0 ? 700 : 400,
                          color: count > 0 ? '#065f46' : '#aaa',
                          cursor: count > 0 ? 'pointer' : 'default',
                        }}>
                        {count > 0 ? count : ''}
                      </button>
                      <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2 }}>{formatHour(hour)}</div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </>
      )}
    </div>
  )
}