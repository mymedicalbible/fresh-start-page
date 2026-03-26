import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { subDays, format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const DAYS = 90

export function AnalyticsPage () {
  const { user } = useAuth()
  const [pain, setPain] = useState<
    { entry_date: string; intensity: number | null; location: string | null }[]
  >([])
  const [reactions, setReactions] = useState<
    { medication: string; effect_score: number | null; reaction_date: string }[]
  >([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const since = format(subDays(new Date(), DAYS), 'yyyy-MM-dd')

    ;(async () => {
      const [p, r] = await Promise.all([
        supabase
          .from('pain_entries')
          .select('entry_date, intensity, location')
          .eq('user_id', user.id)
          .gte('entry_date', since)
          .order('entry_date', { ascending: true }),
        supabase
          .from('med_reactions')
          .select('medication, effect_score, reaction_date')
          .eq('user_id', user.id)
          .gte('reaction_date', since)
          .order('reaction_date', { ascending: true }),
      ])

      if (p.error) setError(p.error.message)
      else setPain((p.data ?? []) as typeof pain)

      if (r.error) setError(r.error.message)
      else setReactions((r.data ?? []) as typeof reactions)
    })()
  }, [user])

  const painSeries = useMemo(() => {
    return pain
      .filter((row) => row.intensity !== null && row.intensity !== undefined)
      .map((row) => ({
        date: row.entry_date,
        intensity: row.intensity as number,
        label: row.location ?? '',
      }))
  }, [pain])

  const painByDay = useMemo(() => {
    const map = new Map<string, { sum: number; n: number }>()
    for (const row of pain) {
      if (row.intensity === null || row.intensity === undefined) continue
      const cur = map.get(row.entry_date) ?? { sum: 0, n: 0 }
      cur.sum += row.intensity
      cur.n += 1
      map.set(row.entry_date, cur)
    }
    return [...map.entries()]
      .map(([date, { sum, n }]) => ({ date, avg: Math.round((sum / n) * 10) / 10 }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [pain])

  const medBars = useMemo(() => {
    const map = new Map<string, { total: number; n: number }>()
    for (const row of reactions) {
      if (!row.medication || row.effect_score === null) continue
      const cur = map.get(row.medication) ?? { total: 0, n: 0 }
      cur.total += row.effect_score
      cur.n += 1
      map.set(row.medication, cur)
    }
    return [...map.entries()]
      .map(([name, { total, n }]) => ({
        medication: name.length > 18 ? `${name.slice(0, 16)}…` : name,
        fullName: name,
        avg: Math.round((total / n) * 10) / 10,
        n,
      }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 12)
  }, [reactions])

  if (!user) return null

  return (
    <div>
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Pain trends</h2>
        <p className="muted">Daily average intensity (last {DAYS} days). Lower is not always “better” without clinical context.</p>
        {painByDay.length === 0
          ? (
            <p className="muted">No pain entries in this window yet.</p>
            )
          : (
            <div className="charts-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={painByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg" name="Avg intensity" stroke="#4f46e5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Pain entries (each log)</h2>
        {painSeries.length === 0
          ? (
            <p className="muted">No numeric intensity values yet.</p>
            )
          : (
            <div className="charts-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={painSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number, _name, item) => {
                      const payload = item?.payload as { label?: string } | undefined
                      const label = payload?.label ? `Intensity (${payload.label})` : 'Intensity'
                      return [value, label]
                    }}
                  />
                  <Line type="monotone" dataKey="intensity" name="Intensity" stroke="#f97316" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Medication reaction effectiveness</h2>
        <p className="muted">Average 1–10 score from your reaction logs (higher ≈ more helpful in your own ratings).</p>
        {medBars.length === 0
          ? (
            <p className="muted">No scored reactions in this window yet.</p>
            )
          : (
            <div className="charts-wrap" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={medBars} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 10]} />
                  <YAxis type="category" dataKey="medication" width={100} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number, _l, p) => [`${v} (n=${(p?.payload as { n: number }).n})`, 'Avg score']} />
                  <Bar dataKey="avg" name="Avg score" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
      </div>
    </div>
  )
}
