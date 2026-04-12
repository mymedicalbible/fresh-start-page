import type { CSSProperties } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

type Props = {
  label?: string
  className?: string
  style?: CSSProperties
  /** When there is no earlier entry in the router stack (e.g. first open), use this route */
  fallbackTo?: string
}

/**
 * Browser-style Back for in-app navigation. Uses React Router history index when available.
 * If navigation was made with `state: { backTo: '/path' }`, that path wins over history (-1).
 */
export function BackButton ({ label = 'Back', className = 'btn btn-ghost', style, fallbackTo = '/app' }: Props) {
  const navigate = useNavigate()
  const location = useLocation()

  function handle () {
    const backTo = (location.state as { backTo?: string } | null)?.backTo
    if (typeof backTo === 'string' && backTo.startsWith('/')) {
      navigate(backTo)
      return
    }
    const idx = (history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate(fallbackTo)
  }

  return (
    <button type="button" className={className} onClick={handle} style={{ marginBottom: 12, ...style }}>
      {label.startsWith('←') ? label : `← ${label}`}
    </button>
  )
}
