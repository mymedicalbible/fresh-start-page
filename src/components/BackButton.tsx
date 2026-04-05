import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'

type Props = {
  label?: string
  className?: string
  style?: CSSProperties
  /** When there is no earlier entry in the router stack (e.g. first open), use this route */
  fallbackTo?: string
}

/**
 * Browser-style Back for in-app navigation. Uses React Router history index when available.
 */
export function BackButton ({ label = 'Back', className = 'btn btn-ghost', style, fallbackTo = '/app' }: Props) {
  const navigate = useNavigate()

  function handle () {
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
