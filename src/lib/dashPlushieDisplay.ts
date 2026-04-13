import type { ActivePlushie } from './gameTokens'

/** Trial seed Lotties under `/lottie/plushie-0.json` … `plushie-4.json` are not real plush art (single-shape placeholders). Never show them as plushies. */
export function isPlaceholderLottiePath (path: string | null | undefined): boolean {
  if (path == null || typeof path !== 'string') return false
  const t = path.trim().toLowerCase()
  return /^\/lottie\/plushie-[0-4]\.json$/.test(t)
}

function slugToDisplayTitle (slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Human-facing name for shop, dashboard, and collection.
 */
export function plushieCatalogDisplayName (slug: string | null | undefined, name: string | null | undefined): string {
  const s = (slug ?? '').toLowerCase().trim()
  const n = (name ?? '').trim()
  if (s === 'meditating-turtle') return "O'Neal the Om Turtle"
  if (n.length > 0) {
    const lower = n.toLowerCase()
    if (lower === 'mystery friend' || lower === 'coming soon' || /mystery\s*friend/.test(lower)) {
      return s.length > 0 ? slugToDisplayTitle(s) : 'Plushie'
    }
    if (s === 'rustle-plant' || (/rustle/.test(lower) && /plant/.test(lower))) {
      return s.length > 0 ? slugToDisplayTitle(s) : 'Plushie'
    }
    return n
  }
  return s.length > 0 ? slugToDisplayTitle(s) : 'Plushie'
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

/** Which unlocked plush is featured on the profile account collection strip (separate from dashboard). */
export type AccountPlushieDisplayPref =
  | { mode: 'none' }
  | { mode: 'plushie'; plushieId: string }

const ACCOUNT_STORAGE_KEY = 'mb-account-plushie-display'

export function loadAccountPlushieDisplay (): AccountPlushieDisplayPref {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    if (!raw) return { mode: 'none' }
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object') return { mode: 'none' }
    const o = v as { mode?: string; plushieId?: string }
    if (o.mode === 'none') return { mode: 'none' }
    if (o.mode === 'plushie' && typeof o.plushieId === 'string' && o.plushieId.length > 0) {
      return { mode: 'plushie', plushieId: o.plushieId }
    }
  } catch {
    /* ignore */
  }
  return { mode: 'none' }
}

export function saveAccountPlushieDisplay (pref: AccountPlushieDisplayPref): void {
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(pref))
    window.dispatchEvent(new CustomEvent('mb-account-plushie-display-changed'))
  } catch {
    /* ignore */
  }
}

/** Derive catalog slug from a resolved dashboard Lottie URL (e.g. `/lottie/meditating-turtle.json`). */
export function slugFromDashboardLottiePath (path: string): string | null {
  const m = path.trim().match(/\/lottie\/([^/]+)\.json$/i)
  return m?.[1] ?? null
}

/** Lottie URL to load for the appointment-banner plush (profile / account avatar is separate). */
export function resolveDashboardPlushieLottiePath (args: {
  pref: DashPlushieDisplayPref
  weeklyActive: ActivePlushie | null
  catalogById: Map<string, { lottie_path: string; slug?: string }>
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
