export type PainChartPoint = { label: string; sortKey: string; intensity: number; date: string }
export type EpisodeChartPoint = { label: string; sortKey: string; score: number; date: string }

function severityToScore (s: unknown): number {
  const t = String(s ?? '').toLowerCase()
  if (t.includes('severe')) return 9
  if (t.includes('moderate')) return 6
  if (t.includes('mild')) return 3
  return 5
}

function formatLabel (iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

/** Pain entries for chart (~60 days max recommended) */
export function buildPainChartSeries (painRows: Array<Record<string, unknown>>, days = 60): PainChartPoint[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const rows = painRows
    .filter((r) => String(r.entry_date ?? '') >= cutoffStr)
    .map((r) => ({
      date: String(r.entry_date ?? ''),
      time: String(r.entry_time ?? ''),
      intensity: typeof r.intensity === 'number' ? r.intensity : Number(r.intensity) || 0,
    }))
    .filter((r) => r.date)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  return rows.map((r) => ({
    label: formatLabel(r.date),
    sortKey: `${r.date}T${r.time || '00:00'}`,
    intensity: Math.min(10, Math.max(0, r.intensity)),
    date: r.date,
  }))
}

export function buildEpisodeChartSeries (sympRows: Array<Record<string, unknown>>, days = 60): EpisodeChartPoint[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const rows = sympRows
    .filter((r) => String(r.episode_date ?? '') >= cutoffStr)
    .map((r) => ({
      date: String(r.episode_date ?? ''),
      time: String(r.episode_time ?? ''),
      score: severityToScore(r.severity),
    }))
    .filter((r) => r.date)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

  return rows.map((r) => ({
    label: formatLabel(r.date),
    sortKey: `${r.date}T${r.time || '00:00'}`,
    score: Math.min(10, Math.max(0, r.score)),
    date: r.date,
  }))
}
