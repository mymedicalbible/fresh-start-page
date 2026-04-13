import type { ActivePlushie } from './gameTokens'

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
    /* Weekly slot: same Lottie as the shop hero for the current rotation — visible whether or not purchased; when the slot rotates, server sends a new active_plushie. */
    if (!weeklyActive?.lottie_path) return null
    return weeklyActive.lottie_path
  }
  if (pref.mode === 'plushie') {
    if (!unlockedIds.has(pref.plushieId)) return null
    return catalogById.get(pref.plushieId)?.lottie_path ?? null
  }
  return null
}
