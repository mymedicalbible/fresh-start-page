import { useEffect, useRef } from 'react'

const DEFAULT_POLL_MS = 90_000

/**
 * Periodically refetches game state and when the tab becomes visible again,
 * so weekly plushie rotation (Monday in the browser’s IANA zone) is reflected without a full reload.
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
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [enabled, pollMs])
}
