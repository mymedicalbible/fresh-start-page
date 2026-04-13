import { supabase } from './supabase'

/** Plushie tokens are on by default; set `VITE_GAME_TOKENS_ENABLED=false` to disable earns + RPC calls. */
export function gameTokensEnabled (): boolean {
  return import.meta.env.VITE_GAME_TOKENS_ENABLED !== 'false'
}

/** IANA zone for weekly plushie rotation (must match `game_get_state` / `game_purchase_active_plushie`). */
export function plushieRotationTimezone (): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Next Monday 00:00:00.000 in the browser’s local timezone (matches shop countdown and Postgres
 * `game_get_state(p_tz)` week boundaries).
 */
export function plushieNextMondayMidnightLocalMs (from = Date.now()): number {
  const now = new Date(from)
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = d.getDay()
  let daysToMonday = (8 - dow) % 7
  if (daysToMonday === 0) daysToMonday = 7
  d.setDate(d.getDate() + daysToMonday)
  d.setHours(0, 0, 0, 0)
  if (d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 7)
  }
  return d.getTime()
}

export type ActivePlushie = {
  id: string
  slug: string
  name: string
  lottie_path: string
  slot_index: number
}

export type GameStateResult =
  | {
      ok: true
      balance: number
      rotation_slot: number
      active_plushie: ActivePlushie
      next_price: number
      unlock_count: number
      owned_active: boolean
    }
  | { ok: false; error: string }

/** PostgREST when no RPC matches the requested name/signature (e.g. DB missing `20260413103000_plushie_rotation_monday_local_tz.sql`). */
function isRpcMissingFunctionError (err: { message?: string; code?: string }): boolean {
  const code = err.code ?? ''
  if (code === 'PGRST202' || code === '42883') return true
  const m = (err.message ?? '').toLowerCase()
  return m.includes('could not find the function') || m.includes('schema cache')
}

export async function fetchGameState (): Promise<GameStateResult> {
  const tz = plushieRotationTimezone()
  let res = await supabase.rpc('game_get_state', { p_tz: tz })
  let usedLegacyGameStateRpc = false
  if (res.error && isRpcMissingFunctionError(res.error)) {
    usedLegacyGameStateRpc = true
    res = await supabase.rpc('game_get_state')
  }
  const { data, error } = res
  if (error) return { ok: false, error: error.message }
  const row = data as { ok?: boolean; error?: string; balance?: number } | null
  if (!row || row.ok === false) return { ok: false, error: (row as { error?: string }).error ?? 'Unknown' }
  if (usedLegacyGameStateRpc && import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- intentional dev-only migration hint
    console.warn(
      '[Medical Bible] Using legacy game_get_state() without local timezone. '
      + 'Apply plushie rotation migrations so weekly plush matches the shop countdown.',
    )
  }
  return row as GameStateResult
}

export async function purchaseActivePlushie (): Promise<
  | { ok: true; spent: number; balance_after: number }
  | { ok: false; error: string; balance?: number; needed?: number }
> {
  const tz = plushieRotationTimezone()
  let res = await supabase.rpc('game_purchase_active_plushie', { p_tz: tz })
  let usedLegacyPurchaseRpc = false
  if (res.error && isRpcMissingFunctionError(res.error)) {
    usedLegacyPurchaseRpc = true
    res = await supabase.rpc('game_purchase_active_plushie')
  }
  const { data, error } = res
  if (error) return { ok: false, error: error.message }
  const row = data as Record<string, unknown>
  if (row.ok === false) {
    return {
      ok: false,
      error: String(row.error ?? 'purchase_failed'),
      balance: typeof row.balance === 'number' ? row.balance : undefined,
      needed: typeof row.needed === 'number' ? row.needed : undefined,
    }
  }
  if (usedLegacyPurchaseRpc && import.meta.env.DEV) {
    // eslint-disable-next-line no-console -- intentional dev-only migration hint
    console.warn(
      '[Medical Bible] Using legacy game_purchase_active_plushie() without local timezone. '
      + 'Apply plushie rotation migrations for consistent weekly unlocks.',
    )
  }
  return {
    ok: true,
    spent: Number(row.spent),
    balance_after: Number(row.balance_after),
  }
}

export async function tryGrantHandoffSummaryTokens (): Promise<{ granted: number; dailyCap: boolean }> {
  const { data, error } = await supabase.rpc('game_try_grant_handoff_summary_tokens')
  if (error) return { granted: 0, dailyCap: false }
  const row = data as { granted?: number; daily_cap?: boolean }
  return { granted: row.granted ?? 0, dailyCap: !!row.daily_cap }
}

export async function grantTranscriptVisitTokens (visitId: string): Promise<{ granted: number }> {
  const { data, error } = await supabase.rpc('game_grant_transcript_visit', { p_visit_id: visitId })
  if (error) return { granted: 0 }
  const row = data as { granted?: number }
  return { granted: row.granted ?? 0 }
}
