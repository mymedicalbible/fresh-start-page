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

export async function fetchGameState (): Promise<GameStateResult> {
  const { data, error } = await supabase.rpc('game_get_state', { p_tz: plushieRotationTimezone() })
  if (error) return { ok: false, error: error.message }
  const row = data as { ok?: boolean; error?: string; balance?: number } | null
  if (!row || row.ok === false) return { ok: false, error: (row as { error?: string }).error ?? 'Unknown' }
  return row as GameStateResult
}

export async function purchaseActivePlushie (): Promise<
  | { ok: true; spent: number; balance_after: number }
  | { ok: false; error: string; balance?: number; needed?: number }
> {
  const { data, error } = await supabase.rpc('game_purchase_active_plushie', { p_tz: plushieRotationTimezone() })
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
