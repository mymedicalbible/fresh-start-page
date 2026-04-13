import { useEffect, useRef } from 'react'
import { plushieNextMondayMidnightLocalMs } from './gameTokens'

const DEFAULT_POLL_MS = 90_000

/** Fire refetch shortly after local Monday 00:00 so the new weekly plushie appears without waiting for the poll interval. */
const ROTATION_REFETCH_LAG_MS = 750

/**
 * Periodically refetches game state and when the tab becomes visible again,
 * so weekly plushie rotation (Monday in the browser’s IANA zone) is reflected without a full reload.
 * Also schedules a one-shot refetch at the next local Monday midnight (aligned with `game_get_state(p_tz)`).
 */
export function useGameStateRefresh (
  enabled: boolean,
  refetch: () => void | Promise<void>,
  pollMs: number = DEFAULT_POLL_MS,
): void {
  const ref = useRef(refetch)
  ref.current = refetch
  useEffect(() => {
    if (!enabled) return
    const run = () => {
      void ref.current()
    }
    const id = window.setInterval(run, pollMs)
    const onVis = () => {
      if (document.visibilityState === 'visible') run()
    }
    document.addEventListener('visibilitychange', onVis)

    let rotationTimer: number | undefined
    const scheduleMondayRefetch = () => {
      if (rotationTimer !== undefined) {
        window.clearTimeout(rotationTimer)
        rotationTimer = undefined
      }
      const next = plushieNextMondayMidnightLocalMs()
      const delay = Math.max(0, next - Date.now()) + ROTATION_REFETCH_LAG_MS
      if (delay > 0 && delay < 8 * 24 * 60 * 60 * 1000) {
        rotationTimer = window.setTimeout(() => {
          run()
          scheduleMondayRefetch()
        }, delay)
      }
    }
    scheduleMondayRefetch()

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      if (rotationTimer !== undefined) window.clearTimeout(rotationTimer)
    }
  }, [enabled, pollMs])
}
