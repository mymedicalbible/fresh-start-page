import { useRef, useCallback } from 'react'

type Options = {
  delay?: number
  onLongPress: () => void
  onClick?: () => void
}

/**
 * Returns props to spread on a button / div.
 * `onLongPress` fires after `delay` ms of continuous press.
 * `onClick` fires only if the press was short (not a long press).
 */
export function useLongPress ({ delay = 600, onLongPress, onClick }: Options) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)

  const start = useCallback(() => {
    firedRef.current = false
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLongPress()
    }, delay)
  }, [delay, onLongPress])

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const handleClick = useCallback(() => {
    if (!firedRef.current && onClick) {
      onClick()
    }
  }, [onClick])

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onClick: handleClick,
    style: { userSelect: 'none' as const, WebkitUserSelect: 'none' as const },
  }
}
