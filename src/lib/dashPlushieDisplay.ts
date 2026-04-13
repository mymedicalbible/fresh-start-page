/**
 * Dashboard plush visibility is stored on-device only (localStorage).
 * Which plush is “this week’s” in the shop (e.g. slot 0 / Meditating Turtle) comes from `game_get_state` after DB migrations.
 */
import { supabase } from './supabase'
import type { ActivePlushie } from './gameTokens'

const STORAGE_KEY = 'mb-dash-plushie-display'

/** Fired when the user changes dashboard plush preference (same tab). */
export const DASH_PLUSHIE_DISPLAY_EVENT = 'mb-dash-plushie-display-changed'

export type DashPlushieDisplayPref =
  | { kind: 'none' }
  | { kind: 'weekly' }
  | { kind: 'plushie'; plushieId: string }

export function loadDashPlushieDisplay (): DashPlushieDisplayPref | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { kind?: string; plushieId?: string }
    if (o.kind === 'none') return { kind: 'none' }
    if (o.kind === 'weekly') return { kind: 'weekly' }
    if (o.kind === 'plushie' && typeof o.plushieId === 'string' && o.plushieId.trim()) {
      return { kind: 'plushie', plushieId: o.plushieId.trim() }
    }
  } catch { /* ignore */ }
  return null
}

/** Default when unset: follow this week’s rotating plush in the shop. */
export function effectiveDashPlushieDisplay (): DashPlushieDisplayPref {
  return loadDashPlushieDisplay() ?? { kind: 'weekly' }
}

export function saveDashPlushieDisplay (pref: DashPlushieDisplayPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref))
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent(DASH_PLUSHIE_DISPLAY_EVENT))
  } catch { /* ignore */ }
}

export type ResolvedDashPlushie = {
  plushie: ActivePlushie
  /** Whether the user owns this plushie and we should load its Lottie. */
  showLottie: boolean
}

/**
 * Which plushie to show on the dashboard mast, from preference + game state.
 * Weekly: uses `game_get_state` active plush; lottie only if they own this week’s.
 * Fixed: a specific unlocked catalog id; lottie if unlock exists (falls back to weekly if invalid).
 */
export async function resolveDashboardPlushie (
  userId: string,
  game: { active_plushie: ActivePlushie | null; owned_active: boolean } | null,
): Promise<ResolvedDashPlushie | null> {
  const pref = effectiveDashPlushieDisplay()
  if (pref.kind === 'none') return null
  if (!game?.active_plushie) return null

  if (pref.kind === 'weekly') {
    return {
      plushie: game.active_plushie,
      showLottie: game.owned_active,
    }
  }

  const { data: row, error } = await supabase
    .from('plushie_catalog')
    .select('id, slug, name, lottie_path, slot_index')
    .eq('id', pref.plushieId)
    .maybeSingle()

  if (error || !row) {
    return {
      plushie: game.active_plushie,
      showLottie: game.owned_active,
    }
  }

  const { data: unlock } = await supabase
    .from('user_plushie_unlocks')
    .select('plushie_id')
    .eq('user_id', userId)
    .eq('plushie_id', pref.plushieId)
    .maybeSingle()

  if (!unlock) {
    return {
      plushie: game.active_plushie,
      showLottie: game.owned_active,
    }
  }

  return {
    plushie: row as ActivePlushie,
    showLottie: true,
  }
}
