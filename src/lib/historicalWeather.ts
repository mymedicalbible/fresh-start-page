import type { PainCorrelationRow, SymptomLogRow } from './weatherCorrelationInsights'

/** How far back we try Open-Meteo archive to fill missing `weather_snapshot` for correlations. */
export const WEATHER_CORRELATION_LOOKBACK_DAYS = 30

function num (v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseIsoMs (iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : NaN
}

/** Closest index in `times` to `targetMs` (same idea as `weatherSnapshot.ts`). */
function closestTimeIndex (times: string[], targetMs: number): number | null {
  if (times.length === 0) return null
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < times.length; i++) {
    const ms = parseIsoMs(times[i]!)
    if (!Number.isFinite(ms)) continue
    const d = Math.abs(ms - targetMs)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  return bestDiff === Infinity ? null : best
}

function isoDateOnly (d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Minimum `pain_entries.entry_date` (YYYY-MM-DD) for correlation queries. */
export function correlationLookbackMinEntryDate (): string {
  const d = new Date()
  d.setDate(d.getDate() - WEATHER_CORRELATION_LOOKBACK_DAYS)
  return isoDateOnly(d)
}

/** Minimum `symptom_logs.logged_at` for correlation queries. */
export function correlationLookbackMinLoggedAtIso (): string {
  return new Date(Date.now() - WEATHER_CORRELATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Local wall-clock instant for a pain row (entry_date + optional entry_time).
 */
export function painEntryToMs (entry_date: string, entry_time: string | null): number {
  let tail = '12:00:00'
  if (entry_time && entry_time.trim()) {
    const s = entry_time.trim()
    tail = s.length === 5 && /^\d{2}:\d{2}$/.test(s) ? `${s}:00` : s
  }
  return Date.parse(`${entry_date}T${tail}`)
}

export type PainRowForHistoricalEnrich = PainCorrelationRow & {
  entry_date: string
  entry_time: string | null
}

export type SymptomRowForHistoricalEnrich = SymptomLogRow & {
  logged_at: string
}

type HourlySeries = { times: string[]; values: (number | null)[] }

async function fetchArchivePressure (
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<HourlySeries> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: startDate,
    end_date: endDate,
    hourly: 'surface_pressure',
    timezone: 'auto',
  })
  const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params.toString()}`)
  if (!r.ok) throw new Error(`archive forecast ${r.status}`)
  const j = (await r.json()) as {
    hourly?: { time?: string[]; surface_pressure?: (number | null)[] }
  }
  const h = j.hourly ?? {}
  return {
    times: h.time ?? [],
    values: h.surface_pressure ?? [],
  }
}

async function fetchArchiveGrassPollen (
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<HourlySeries> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: startDate,
    end_date: endDate,
    hourly: 'grass_pollen',
    timezone: 'auto',
  })
  const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`)
  if (!r.ok) throw new Error(`archive air quality ${r.status}`)
  const j = (await r.json()) as {
    hourly?: { time?: string[]; grass_pollen?: (number | null)[] }
  }
  const h = j.hourly ?? {}
  return {
    times: h.time ?? [],
    values: h.grass_pollen ?? [],
  }
}

function lookupSeries (series: HourlySeries, targetMs: number): number | null {
  const idx = closestTimeIndex(series.times, targetMs)
  if (idx === null || idx >= series.values.length) return null
  return num(series.values[idx])
}

/**
 * For logs in the last {@link WEATHER_CORRELATION_LOOKBACK_DAYS} without `weather_snapshot`,
 * fills `pressure_hpa` / `grass_pollen` from Open-Meteo archive APIs (in-memory only).
 * Rows that already have a snapshot are unchanged. Fails soft: on network/parse errors, returns originals.
 */
export async function enrichCorrelationRowsWithHistoricalWeather (args: {
  lat: number
  lng: number
  painRows: PainRowForHistoricalEnrich[]
  symptomRows: SymptomRowForHistoricalEnrich[]
}): Promise<{ pain: PainCorrelationRow[]; symptom: SymptomLogRow[] }> {
  const now = Date.now()
  const cutoff = now - WEATHER_CORRELATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000

  const painNeed = args.painRows.filter((r) => r.weather_snapshot == null)
  const symNeed = args.symptomRows.filter((r) => r.weather_snapshot == null)

  let minMs = Infinity
  let maxMs = -Infinity

  for (const r of painNeed) {
    const t = painEntryToMs(r.entry_date, r.entry_time)
    if (Number.isFinite(t) && t >= cutoff && t <= now) {
      minMs = Math.min(minMs, t)
      maxMs = Math.max(maxMs, t)
    }
  }
  for (const r of symNeed) {
    const t = Date.parse(r.logged_at)
    if (Number.isFinite(t) && t >= cutoff && t <= now) {
      minMs = Math.min(minMs, t)
      maxMs = Math.max(maxMs, t)
    }
  }

  if (minMs === Infinity || maxMs === -Infinity || minMs > maxMs) {
    return {
      pain: args.painRows.map(({ intensity, weather_snapshot }) => ({ intensity, weather_snapshot })),
      symptom: args.symptomRows.map(({ symptoms, weather_snapshot }) => ({ symptoms, weather_snapshot })),
    }
  }

  const startDate = isoDateOnly(new Date(minMs))
  const endDate = isoDateOnly(new Date(maxMs))

  let pressureSeries: HourlySeries = { times: [], values: [] }
  let pollenSeries: HourlySeries = { times: [], values: [] }

  try {
    ;[pressureSeries, pollenSeries] = await Promise.all([
      fetchArchivePressure(args.lat, args.lng, startDate, endDate),
      fetchArchiveGrassPollen(args.lat, args.lng, startDate, endDate),
    ])
  } catch {
    return {
      pain: args.painRows.map(({ intensity, weather_snapshot }) => ({ intensity, weather_snapshot })),
      symptom: args.symptomRows.map(({ symptoms, weather_snapshot }) => ({ symptoms, weather_snapshot })),
    }
  }

  const painOut: PainCorrelationRow[] = args.painRows.map((r) => {
    if (r.weather_snapshot != null) {
      return { intensity: r.intensity, weather_snapshot: r.weather_snapshot }
    }
    const t = painEntryToMs(r.entry_date, r.entry_time)
    if (!Number.isFinite(t) || t < cutoff || t > now) {
      return { intensity: r.intensity, weather_snapshot: r.weather_snapshot }
    }
    const p = lookupSeries(pressureSeries, t)
    const g = lookupSeries(pollenSeries, t)
    if (p === null && g === null) {
      return { intensity: r.intensity, weather_snapshot: r.weather_snapshot }
    }
    return {
      intensity: r.intensity,
      weather_snapshot: {
        pressure_hpa: p,
        grass_pollen: g,
      },
    }
  })

  const symptomOut: SymptomLogRow[] = args.symptomRows.map((r) => {
    if (r.weather_snapshot != null) {
      return { symptoms: r.symptoms, weather_snapshot: r.weather_snapshot }
    }
    const t = Date.parse(r.logged_at)
    if (!Number.isFinite(t) || t < cutoff || t > now) {
      return { symptoms: r.symptoms, weather_snapshot: r.weather_snapshot }
    }
    const p = lookupSeries(pressureSeries, t)
    const g = lookupSeries(pollenSeries, t)
    if (p === null && g === null) {
      return { symptoms: r.symptoms, weather_snapshot: r.weather_snapshot }
    }
    return {
      symptoms: r.symptoms,
      weather_snapshot: {
        pressure_hpa: p,
        grass_pollen: g,
      },
    }
  })

  return { pain: painOut, symptom: symptomOut }
}
