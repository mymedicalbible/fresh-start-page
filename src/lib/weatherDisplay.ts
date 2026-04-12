/** Display-only conversions — source data stays metric in `WeatherSnapshot`. */

export function celsiusToFahrenheit (c: number): number {
  return (c * 9) / 5 + 32
}

export function kmhToMph (kmh: number): number {
  return kmh * 0.621371
}

export function mmToInches (mm: number): number {
  return mm / 25.4
}

/** US barometric pressure (mercury inches). */
export function hPaToInHg (hpa: number): number {
  return hpa * 0.029529983071445
}

export function formatTempF (c: number): string {
  return `${Math.round(celsiusToFahrenheit(c))}°F`
}

export function formatWindMph (kmh: number): string {
  return `${kmhToMph(kmh).toFixed(1)} mph`
}

function uvCategory (uv: number): string {
  const u = Math.max(0, uv)
  if (u < 3) return 'Low'
  if (u < 6) return 'Moderate'
  if (u < 8) return 'High'
  if (u < 11) return 'Very High'
  return 'Extreme'
}

/** Full sentence for tooltips / one-line exports. */
export function formatUvLabel (uv: number): string {
  const rounded = Math.round(uv)
  return `UV Index: ${rounded} (${uvCategory(uv)})`
}

/** Value column only: `2 (Low)` — pair with label "UV Index". */
export function formatUvIndexDetail (uv: number): string {
  return `${Math.round(uv)} (${uvCategory(uv)})`
}

function aqiCategory (aqi: number): string {
  const a = Math.round(aqi)
  if (a <= 50) return 'Good'
  if (a <= 100) return 'Moderate'
  if (a <= 150) return 'Unhealthy for Sensitive Groups'
  if (a <= 200) return 'Unhealthy'
  if (a <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

/** Full sentence for one-line exports. */
export function formatAqiLabel (aqi: number): string {
  const a = Math.round(aqi)
  return `Air Quality: ${a} (${aqiCategory(a)})`
}

/** Value column only: `82 (Moderate)` — pair with label "Air quality". */
export function formatAqiDetail (aqi: number): string {
  const a = Math.round(aqi)
  return `${a} (${aqiCategory(a)})`
}

export function formatPrecipitationDisplay (mm: number): string {
  if (mm <= 0) return 'No precipitation'
  const inches = mmToInches(mm)
  if (inches < 0.01) return 'Trace'
  return `${inches.toFixed(2)} in`
}

/** Same ±3 hPa rule as the compact chip arrow. */
export function formatPressureTrendWord (deltaHpa: number | null): 'rising' | 'falling' | 'steady' | null {
  if (deltaHpa === null) return null
  if (deltaHpa > 3) return 'rising'
  if (deltaHpa < -3) return 'falling'
  return 'steady'
}

export function formatBarometerLine (hpa: number, deltaHpa: number | null): string {
  const inHg = hPaToInHg(hpa)
  const trend = formatPressureTrendWord(deltaHpa)
  const base = `${inHg.toFixed(2)} inHg`
  if (!trend) return base
  return `${base} (${trend})`
}

/** Grass pollen bucket copy for summaries. */
export function grassPollenBucketLabel (g: number): 'Low' | 'Moderate' | 'High' {
  if (g < 10) return 'Low'
  if (g <= 50) return 'Moderate'
  return 'High'
}

/** Open-Meteo pollen units: grains/m³ */
export function formatPollenGrainsPerM3 (n: number): string {
  const r = Math.abs(n) >= 100 ? Math.round(n).toString() : n.toFixed(1)
  return `${r} grains/m³`
}

export function treeWeedPollenBucketLabel (g: number): 'Low' | 'Moderate' | 'High' {
  return grassPollenBucketLabel(g)
}

/** Icon set for future condition-based art — default sun per product request. */
export type WeatherDisplayIconId = 'sun' | 'partlyCloudy' | 'cloud' | 'rain' | 'snow' | 'thunder' | 'fog'

export function weatherIconIdForConditions (conditionsLabel: string): WeatherDisplayIconId {
  const l = conditionsLabel.toLowerCase()
  if (l.includes('thunder')) return 'thunder'
  if (l.includes('snow')) return 'snow'
  if (l.includes('rain') || l.includes('drizzle') || l.includes('shower')) return 'rain'
  if (l.includes('fog')) return 'fog'
  if (l.includes('partly')) return 'partlyCloudy'
  if (l.includes('cloud')) return 'cloud'
  return 'sun'
}
