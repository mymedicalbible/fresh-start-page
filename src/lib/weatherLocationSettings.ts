import { clearWeatherSnapshotCache } from './weatherCache'

const LS_MODE = 'mb-weather-location-mode'
const LS_MANUAL = 'mb-weather-manual-json'

export type WeatherLocationMode = 'exact' | 'manual'

export type ManualWeatherLocation = {
  lat: number
  lng: number
  /** Display label, e.g. "Peoria, Arizona, United States" */
  label: string
}

export function getWeatherLocationMode (): WeatherLocationMode {
  try {
    const v = localStorage.getItem(LS_MODE)
    if (v === 'manual' || v === 'exact') return v
  } catch {
    /* ignore */
  }
  return 'exact'
}

export function setWeatherLocationMode (mode: WeatherLocationMode): void {
  try {
    localStorage.setItem(LS_MODE, mode)
  } catch {
    /* ignore */
  }
  notifyWeatherLocationChanged()
}

export function getManualWeatherLocation (): ManualWeatherLocation | null {
  try {
    const raw = localStorage.getItem(LS_MANUAL)
    if (!raw) return null
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object') return null
    const o = j as Record<string, unknown>
    const lat = typeof o.lat === 'number' ? o.lat : Number(o.lat)
    const lng = typeof o.lng === 'number' ? o.lng : Number(o.lng)
    const label = typeof o.label === 'string' ? o.label.trim() : ''
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !label) return null
    return { lat, lng, label }
  } catch {
    return null
  }
}

export function setManualWeatherLocation (loc: ManualWeatherLocation): void {
  try {
    localStorage.setItem(LS_MANUAL, JSON.stringify(loc))
  } catch {
    /* ignore */
  }
  notifyWeatherLocationChanged()
}

export function clearManualWeatherLocation (): void {
  try {
    localStorage.removeItem(LS_MANUAL)
  } catch {
    /* ignore */
  }
  notifyWeatherLocationChanged()
}

/**
 * Busts session weather cache when mode/coords change so the dashboard refetches.
 */
export function getWeatherLocationFingerprint (): string {
  const mode = getWeatherLocationMode()
  if (mode === 'manual') {
    const m = getManualWeatherLocation()
    if (!m) return 'manual:unset'
    return `manual:${m.lat.toFixed(4)}:${m.lng.toFixed(4)}`
  }
  return 'exact'
}

export function notifyWeatherLocationChanged (): void {
  clearWeatherSnapshotCache()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mb-weather-location-changed'))
  }
}

/** Open-Meteo geocoding — free, no key. */
export async function searchPlaces (
  query: string,
): Promise<{ lat: number; lng: number; label: string }[]> {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
      '&count=8&language=en&format=json'
    const r = await fetch(url)
    if (!r.ok) return []
    const j = (await r.json()) as { results?: unknown[] }
    const rows = j.results ?? []
    const out: { lat: number; lng: number; label: string }[] = []
    for (const raw of rows) {
      if (!raw || typeof raw !== 'object') continue
      const o = raw as Record<string, unknown>
      const lat = typeof o.latitude === 'number' ? o.latitude : Number(o.latitude)
      const lng = typeof o.longitude === 'number' ? o.longitude : Number(o.longitude)
      const name = typeof o.name === 'string' ? o.name.trim() : ''
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !name) continue
      const admin1 = typeof o.admin1 === 'string' ? o.admin1.trim() : ''
      const country = typeof o.country === 'string' ? o.country.trim() : ''
      const label =
        admin1 && country
          ? `${name}, ${admin1}, ${country}`
          : admin1
            ? `${name}, ${admin1}`
            : country
              ? `${name}, ${country}`
              : name
      out.push({ lat, lng, label })
    }
    return out
  } catch {
    return []
  }
}
