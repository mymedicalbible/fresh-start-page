import type { WeatherSnapshot } from './weatherSnapshot'
import { grassPollenBucketLabel } from './weatherDisplay'

type PainRow = {
  intensity: number | null
  weather_snapshot: unknown
}

function safeNum (n: unknown): number | null {
  const x = Number(n)
  return Number.isFinite(x) ? x : null
}

function parseSnapshot (raw: unknown): {
  pressure_hpa: number | null
  grass_pollen: number | null
} | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    pressure_hpa: safeNum(o.pressure_hpa),
    grass_pollen: o.grass_pollen === null || o.grass_pollen === undefined
      ? null
      : safeNum(o.grass_pollen),
  }
}

function grassBucket (g: number | null): 'low' | 'mod' | 'high' | null {
  if (g === null || !Number.isFinite(g)) return null
  if (g < 10) return 'low'
  if (g <= 50) return 'mod'
  return 'high'
}

function mean (xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function median (xs: number[]): number {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

const PRESSURE_BAND_HPA = 5

export type PollenAlertLevel = 'high' | 'moderate' | 'above_your_usual' | null

export type WeatherCorrelationResult = {
  /** Short lines derived from this user’s pain logs vs similar snapshot bands. */
  lines: string[]
  pollenAlert: PollenAlertLevel
  /** Median grass pollen across past logged snapshots (for “above usual”). */
  grassPollenMedianHistory: number | null
}

/**
 * Compares the current forecast snapshot to historical pain entries that stored weather.
 * Only uses rows already in the DB — no “go to Charts” hand‑waving.
 */
export function buildWeatherCorrelationInsights (
  current: WeatherSnapshot,
  painRows: PainRow[],
): WeatherCorrelationResult {
  const lines: string[] = []
  const P = current.pressure_hpa
  const G = current.grass_pollen

  const parsed: { inten: number | null; p: number | null; g: number | null }[] = []
  const grassValues: number[] = []

  for (const row of painRows) {
    const ws = parseSnapshot(row.weather_snapshot)
    if (!ws) continue
    const inten = safeNum(row.intensity)
    if (ws.grass_pollen != null && Number.isFinite(ws.grass_pollen)) {
      grassValues.push(ws.grass_pollen)
    }
    parsed.push({
      inten: inten,
      p: ws.pressure_hpa,
      g: ws.grass_pollen,
    })
  }

  const grassMedian = grassValues.length >= 3 ? median(grassValues) : null

  let pollenAlert: PollenAlertLevel = null
  if (G != null && Number.isFinite(G)) {
    if (G > 50) {
      pollenAlert = 'high'
    } else if (
      grassMedian != null &&
      grassValues.length >= 5 &&
      G > grassMedian * 1.15 &&
      G >= 8
    ) {
      pollenAlert = 'above_your_usual'
    } else if (G > 10) {
      pollenAlert = 'moderate'
    }
  }

  const curBucket = grassBucket(G)

  const pressureMatches = parsed.filter((x) => x.p != null && Math.abs(x.p - P) <= PRESSURE_BAND_HPA)
  const pressureIntensities = pressureMatches
    .map((x) => x.inten)
    .filter((x): x is number => x !== null && Number.isFinite(x))
  if (pressureIntensities.length >= 3) {
    const avg = Math.round(mean(pressureIntensities) * 10) / 10
    lines.push(
      `At barometric pressure within ±${PRESSURE_BAND_HPA} hPa of right now, your average logged pain is ${avg}/10 (${pressureIntensities.length} pain entries).`,
    )
  }

  if (curBucket != null) {
    const pollenMatches = parsed.filter((x) => grassBucket(x.g) === curBucket)
    const pollenIntensities = pollenMatches
      .map((x) => x.inten)
      .filter((x): x is number => x !== null && Number.isFinite(x))
    if (pollenIntensities.length >= 3) {
      const avg = Math.round(mean(pollenIntensities) * 10) / 10
      const label = grassPollenBucketLabel(
        curBucket === 'low' ? 5 : curBucket === 'mod' ? 25 : 60,
      )
      lines.push(
        `When grass pollen was ${label} (like now), your average logged pain is ${avg}/10 (${pollenIntensities.length} pain entries).`,
      )
    }
  }

  if (lines.length === 0 && parsed.length >= 1) {
    lines.push(
      'Not enough pain logs yet at similar pressure or pollen level to show a stable average for this window.',
    )
  } else if (lines.length === 0) {
    lines.push('Log pain with weather enabled a few times to see how your pain lines up with conditions like this.')
  }

  return {
    lines,
    pollenAlert,
    grassPollenMedianHistory: grassMedian,
  }
}
