/** Session cache for live weather card (invalidated when location prefs change). */
export const WEATHER_SNAPSHOT_CACHE_KEY = 'mb-weather-snapshot'
export const WEATHER_SNAPSHOT_FP_KEY = 'mb-weather-snapshot-fp'

export function clearWeatherSnapshotCache (): void {
  try {
    sessionStorage.removeItem(WEATHER_SNAPSHOT_CACHE_KEY)
    sessionStorage.removeItem(WEATHER_SNAPSHOT_FP_KEY)
  } catch {
    /* ignore */
  }
}
