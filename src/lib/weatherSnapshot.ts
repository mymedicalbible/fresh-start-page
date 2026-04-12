const CACHE_KEY = 'mb-weather-snapshot'
const CACHE_MS = 30 * 60 * 1000

export interface WeatherSnapshot {
  fetched_at: string
  latitude: number
  longitude: number
  /** Human-readable place name when reverse geocoding succeeds; omit from UI if missing. */
  location_label?: string | null
  temperature_c: number
  /** Apparent / “feels like” °C; omitted on older stored rows. */
  feels_like_c?: number
  humidity_pct: number
  pressure_hpa: number
  pressure_change_24h: number | null
  precipitation_mm: number
  uv_index: number
  wind_kph: number
  grass_pollen: number | null
  tree_pollen: number | null
  weed_pollen: number | null
  aqi: number | null
  conditions_label: string
}

function weatherCodeToLabel (code: number): string {
  if (code === 0) return 'Clear sky'
  if ([1, 2, 3].includes(code)) return 'Partly cloudy'
  if ([45, 48].includes(code)) return 'Foggy'
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain'
  if ([71, 73, 75, 77].includes(code)) return 'Snow'
  if ([80, 81, 82].includes(code)) return 'Showers'
  if ([85, 86].includes(code)) return 'Snow showers'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Unknown'
}

function parseIsoMs (iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : NaN
}

/** Closest index in `times` to `targetMs`. */
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

function num (v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function sumPollenPair (a: unknown, b: unknown): number | null {
  const na = num(a)
  const nb = num(b)
  if (na === null && nb === null) return null
  return (na ?? 0) + (nb ?? 0)
}

/** Reject corrupt / partial cache so callers never read invalid snapshots. */
function isValidWeatherSnapshot (x: unknown): x is WeatherSnapshot {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  const needNum = (k: string) => {
    const v = o[k]
    return typeof v === 'number' && Number.isFinite(v)
  }
  if (typeof o.fetched_at !== 'string' || !Number.isFinite(Date.parse(o.fetched_at))) return false
  if (!needNum('latitude') || !needNum('longitude')) return false
  if (!needNum('temperature_c') || !needNum('humidity_pct') || !needNum('pressure_hpa')) return false
  if (!needNum('precipitation_mm') || !needNum('uv_index') || !needNum('wind_kph')) return false
  const pc = o.pressure_change_24h
  if (pc !== null && pc !== undefined && (typeof pc !== 'number' || !Number.isFinite(pc))) return false
  for (const k of ['grass_pollen', 'tree_pollen', 'weed_pollen', 'aqi'] as const) {
    const v = o[k]
    if (v !== null && v !== undefined && (typeof v !== 'number' || !Number.isFinite(v))) return false
  }
  if ('feels_like_c' in o && o.feels_like_c !== null && o.feels_like_c !== undefined) {
    if (typeof o.feels_like_c !== 'number' || !Number.isFinite(o.feels_like_c)) return false
  }
  if ('location_label' in o) {
    const ll = o.location_label
    if (ll !== null && ll !== undefined && typeof ll !== 'string') return false
  }
  return typeof o.conditions_label === 'string'
}

/** Client-side reverse geocode (no key). Returns null on failure — hide location in UI. */
export async function fetchLocationLabel (lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lng)}&localityLanguage=en`
    const r = await fetch(url)
    if (!r.ok) return null
    const j = (await r.json()) as Record<string, unknown>
    const city = [j.city, j.locality, j.village].find(
      (x) => typeof x === 'string' && String(x).trim().length > 0,
    ) as string | undefined
    const rawCode = j.principalSubdivisionCode
    let state = ''
    if (typeof rawCode === 'string') {
      const parts = rawCode.split('-')
      state = parts[parts.length - 1] ?? ''
    }
    if (city && state.length === 2 && /^[A-Za-z]{2}$/.test(state)) {
      return `${city.trim()}, ${state.toUpperCase()}`
    }
    if (city) return city.trim()
    return null
  } catch {
    return null
  }
}

function getPosition (): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 20_000, maximumAge: 300_000 },
    )
  })
}

export async function fetchWeatherSnapshot (): Promise<WeatherSnapshot | null> {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      const at =
        parsed &&
        typeof parsed === 'object' &&
        'fetched_at' in parsed &&
        typeof (parsed as { fetched_at: unknown }).fetched_at === 'string'
          ? Date.parse((parsed as { fetched_at: string }).fetched_at)
          : NaN
      if (Number.isFinite(at) && Date.now() - at < CACHE_MS && isValidWeatherSnapshot(parsed)) {
        const snap = parsed as WeatherSnapshot
        if (!snap.location_label?.trim()) {
          const label = await fetchLocationLabel(snap.latitude, snap.longitude)
          if (label) {
            const next: WeatherSnapshot = { ...snap, location_label: label }
            try {
              sessionStorage.setItem(CACHE_KEY, JSON.stringify(next))
            } catch { /* ignore */ }
            if (import.meta.env.DEV) {
              console.debug('[mb-weather]', { latitude: snap.latitude, longitude: snap.longitude, location_label: label })
            }
            return next
          }
        }
        return snap
      }
    }
  } catch {
    /* ignore cache */
  }

  const pos = await getPosition()
  if (!pos) return null

  const { latitude: lat, longitude: lng } = pos

  const forecastParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current:
      'temperature_2m,apparent_temperature,relative_humidity_2m,surface_pressure,precipitation,wind_speed_10m,uv_index,weather_code',
    hourly: 'surface_pressure',
    timezone: 'auto',
    forecast_days: '2',
  })
  const aqParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'pm2_5,us_aqi',
    hourly: 'birch_pollen,alder_pollen,grass_pollen,ragweed_pollen,mugwort_pollen',
    timezone: 'auto',
    forecast_days: '1',
  })

  let forecastJson: unknown
  let aqJson: unknown
  try {
    const [fr, ar] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${aqParams.toString()}`),
    ])
    if (!fr.ok || !ar.ok) return null
    forecastJson = await fr.json()
    aqJson = await ar.json()
  } catch {
    return null
  }

  try {
    const fc = forecastJson as {
      current?: Record<string, unknown>
      hourly?: { time?: string[]; surface_pressure?: (number | null)[] }
    }
    const aq = aqJson as {
      current?: Record<string, unknown>
      hourly?: {
        time?: string[]
        birch_pollen?: (number | null)[]
        alder_pollen?: (number | null)[]
        grass_pollen?: (number | null)[]
        ragweed_pollen?: (number | null)[]
        mugwort_pollen?: (number | null)[]
      }
    }

    const cur = fc.current ?? {}
    const temp = num(cur.temperature_2m)
    const apparent = num(cur.apparent_temperature)
    const humidity = num(cur.relative_humidity_2m)
    const pressureNow = num(cur.surface_pressure)
    // Open-Meteo can omit or null some current fields; use safe defaults so we still return a snapshot.
    const precip = num(cur.precipitation) ?? 0
    const wind = num(cur.wind_speed_10m) ?? 0
    const uv = num(cur.uv_index) ?? 0
    const wcode = num(cur.weather_code)

    if (temp === null || humidity === null || pressureNow === null) {
      return null
    }

    const feelsLikeC = apparent ?? temp

    const conditionsLabel =
      wcode === null ? 'Unknown' : weatherCodeToLabel(Math.round(wcode))

    const hourlyTimes = fc.hourly?.time ?? []
    const hourlyPress = fc.hourly?.surface_pressure ?? []
    const target24hAgo = Date.now() - 24 * 60 * 60 * 1000
    const idx24 = closestTimeIndex(hourlyTimes, target24hAgo)
    let pressureChange24h: number | null = null
    if (idx24 !== null && idx24 < hourlyTimes.length && idx24 < hourlyPress.length) {
      const pPast = num(hourlyPress[idx24])
      if (pPast !== null) pressureChange24h = pressureNow - pPast
    }

    const aqHourly = aq.hourly ?? {}
    const aqTimes = aqHourly.time ?? []
    const birch = aqHourly.birch_pollen ?? []
    const alder = aqHourly.alder_pollen ?? []
    const grass = aqHourly.grass_pollen ?? []
    const ragweed = aqHourly.ragweed_pollen ?? []
    const mugwort = aqHourly.mugwort_pollen ?? []

    const nowIdx = closestTimeIndex(aqTimes, Date.now())
    let grassPollen: number | null = null
    let treePollen: number | null = null
    let weedPollen: number | null = null
    if (nowIdx !== null && nowIdx < aqTimes.length) {
      grassPollen = num(grass[nowIdx])
      treePollen = sumPollenPair(birch[nowIdx], alder[nowIdx])
      weedPollen = sumPollenPair(ragweed[nowIdx], mugwort[nowIdx])
    }

    const aqCur = aq.current ?? {}
    const aqiVal = num(aqCur.us_aqi)

    const locationLabel = await fetchLocationLabel(lat, lng)

    if (import.meta.env.DEV) {
      console.debug('[mb-weather]', { latitude: lat, longitude: lng, location_label: locationLabel })
    }

    const snapshot: WeatherSnapshot = {
      fetched_at: new Date().toISOString(),
      latitude: lat,
      longitude: lng,
      location_label: locationLabel,
      temperature_c: temp,
      feels_like_c: feelsLikeC,
      humidity_pct: humidity,
      pressure_hpa: pressureNow,
      pressure_change_24h: pressureChange24h,
      precipitation_mm: precip,
      uv_index: uv,
      wind_kph: wind,
      grass_pollen: grassPollen,
      tree_pollen: treePollen,
      weed_pollen: weedPollen,
      aqi: aqiVal,
      conditions_label: conditionsLabel,
    }

    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(snapshot))
    } catch {
      /* ignore */
    }

    return snapshot
  } catch {
    return null
  }
}
