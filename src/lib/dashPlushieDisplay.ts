import type { ActivePlushie } from './gameTokens'

/** Trial seed Lotties under `/lottie/plushie-0.json` … `plushie-4.json` are not real plush art (single-shape placeholders). Never show them as plushies. */
export function isPlaceholderLottiePath (path: string | null | undefined): boolean {
  if (path == null || typeof path !== 'string') return false
  const t = path.trim().toLowerCase()
  return /^\/lottie\/plushie-[0-4]\.json$/.test(t)
}

/**
 * Human-facing name for shop, dashboard, and collection.
 * Neutralizes deprecated trial seed slug `rustle-plant` (and similar copy) if the DB was not yet migrated.
 */
export function plushieCatalogDisplayName (slug: string | null | undefined, name: string | null | undefined): string {
  const s = (slug ?? '').toLowerCase().trim()
  const n = (name ?? '').trim()
  if (s === 'rustle-plant') return 'Coming soon'
  if (/rustle/.test(n.toLowerCase()) && /plant/.test(n.toLowerCase())) return 'Coming soon'
  if (n.length > 0) return n
  return 'Plushie'
}

/** User preference for which plush (if any) appears on the home dashboard — set only from My Plushies. */
export type DashPlushieDisplayPref =
  | { mode: 'none' }
  | { mode: 'weekly' }
  | { mode: 'plushie'; plushieId: string }

const STORAGE_KEY = 'mb-dash-plushie-display'

export function loadDashPlushieDisplay (): DashPlushieDisplayPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { mode: 'weekly' }
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object') return { mode: 'weekly' }
    const o = v as { mode?: string; plushieId?: string }
    if (o.mode === 'none') return { mode: 'none' }
    if (o.mode === 'weekly') return { mode: 'weekly' }
    if (o.mode === 'plushie' && typeof o.plushieId === 'string' && o.plushieId.length > 0) {
      return { mode: 'plushie', plushieId: o.plushieId }
    }
  } catch {
    /* ignore */
  }
  return { mode: 'weekly' }
}

export function saveDashPlushieDisplay (pref: DashPlushieDisplayPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref))
    window.dispatchEvent(new CustomEvent('mb-dash-plushie-display-changed'))
  } catch {
    /* ignore */
  }
}

/** Lottie URL to load for the appointment-banner plush (profile / account avatar is separate). */
export function resolveDashboardPlushieLottiePath (args: {
  pref: DashPlushieDisplayPref
  weeklyActive: ActivePlushie | null
  catalogById: Map<string, { lottie_path: string }>
  unlockedIds: Set<string>
}): string | null {
  const { pref, weeklyActive, catalogById, unlockedIds } = args
  if (pref.mode === 'none') return null
  if (pref.mode === 'weekly') {
    if (!weeklyActive?.lottie_path) return null
    if (!unlockedIds.has(weeklyActive.id)) return null
    if (isPlaceholderLottiePath(weeklyActive.lottie_path)) return null
    return weeklyActive.lottie_path
  }
  if (pref.mode === 'plushie') {
    if (!unlockedIds.has(pref.plushieId)) return null
    const p = catalogById.get(pref.plushieId)?.lottie_path ?? null
    if (isPlaceholderLottiePath(p)) return null
    return p
  }
  return null
}
