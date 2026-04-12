import type { WeatherSnapshot } from './weatherSnapshot'
import { grassPollenBucketLabel } from './weatherDisplay'

type PainRow = {
  intensity: number | null
  weather_snapshot: unknown
}

export type SymptomLogRow = {
  symptoms: unknown
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

function symptomCount (symptoms: unknown): number {
  if (Array.isArray(symptoms)) return symptoms.length
  return 0
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
  lines: string[]
  pollenAlert: PollenAlertLevel
  grassPollenMedianHistory: number | null
}

/**
 * Compares the current forecast snapshot to historical pain + episode (symptom) logs that stored weather.
 */
export function buildWeatherCorrelationInsights (
  current: WeatherSnapshot,
  painRows: PainRow[],
  symptomRows: SymptomLogRow[] = [],
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

  for (const row of symptomRows) {
    const ws = parseSnapshot(row.weather_snapshot)
    if (ws?.grass_pollen != null && Number.isFinite(ws.grass_pollen)) {
      grassValues.push(ws.grass_pollen)
    }
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
      `At barometric pressure within ±${PRESSURE_BAND_HPA} hPa of this forecast, your average logged pain intensity was ${avg}/10 (${pressureIntensities.length} pain logs).`,
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
        `When grass pollen was ${label} (like this forecast), your average logged pain intensity was ${avg}/10 (${pollenIntensities.length} pain logs).`,
      )
    }
  }

  const symParsed: { count: number; p: number | null; g: number | null }[] = []
  for (const row of symptomRows) {
    const ws = parseSnapshot(row.weather_snapshot)
    if (!ws) continue
    symParsed.push({
      count: symptomCount(row.symptoms),
      p: ws.pressure_hpa,
      g: ws.grass_pollen,
    })
  }

  const symPressure = symParsed.filter((x) => x.p != null && Math.abs(x.p - P) <= PRESSURE_BAND_HPA)
  const symPressureNonEmpty = symPressure.filter((x) => x.count > 0)
  if (symPressureNonEmpty.length >= 3) {
    const avg = Math.round(mean(symPressureNonEmpty.map((x) => x.count)) * 10) / 10
    lines.push(
      `At similar pressure to this forecast, your average symptom count on episode logs was ${avg} (${symPressureNonEmpty.length} logs).`,
    )
  }

  if (curBucket != null) {
    const symPollen = symParsed.filter((x) => grassBucket(x.g) === curBucket)
    const symPollenNonEmpty = symPollen.filter((x) => x.count > 0)
    if (symPollenNonEmpty.length >= 3) {
      const avg = Math.round(mean(symPollenNonEmpty.map((x) => x.count)) * 10) / 10
      const label = grassPollenBucketLabel(
        curBucket === 'low' ? 5 : curBucket === 'mod' ? 25 : 60,
      )
      lines.push(
        `When grass pollen was ${label} (like this forecast), your average symptom count on episode logs was ${avg} (${symPollenNonEmpty.length} logs).`,
      )
    }
  }

  if (lines.length === 0 && (parsed.length >= 1 || symParsed.length >= 1)) {
    lines.push(
      'Not enough logs yet at similar pressure or pollen to this forecast to show a stable average.',
    )
  } else if (lines.length === 0) {
    lines.push(
      'Log pain or episodes with weather enabled a few times to see how you line up with conditions like this forecast.',
    )
  }

  return {
    lines,
    pollenAlert,
    grassPollenMedianHistory: grassMedian,
  }
}
