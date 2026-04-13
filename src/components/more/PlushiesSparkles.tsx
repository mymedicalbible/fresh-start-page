import { SparkleStar } from './SparkleStar'

type PlushiesSparklesProps = {
  /** Polaroid styling on the More page (same six shapes as default, with tighter polaroid glow). */
  compact?: boolean
}

const SIZES_FULL = [11, 13, 10, 14, 12, 11] as const
const SIZES_POLAROID_DENSE = [11, 13, 10, 14, 12, 11, 10, 12, 11, 13, 10, 12] as const

/** Soft shimmer on illustration-style sparkles (crossed rays), not pulsing dots. */
export function PlushiesSparkles ({ compact = false }: PlushiesSparklesProps) {
  const keys = compact
    ? ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const)
    : ([1, 2, 3, 4, 5, 6] as const)
  const sizes = compact ? SIZES_POLAROID_DENSE : SIZES_FULL
  return (
    <span
      className={`cork-sparkles${compact ? ' cork-sparkles--polaroid cork-sparkles--polaroid-dense' : ''}`}
      aria-hidden
    >
      {keys.map((n, i) => (
        <span
          key={n}
          className={`cork-sparkles__shape cork-sparkles__shape--${n}${n === 5 ? ' cork-sparkles__shape--tilted' : ''}`}
        >
          <SparkleStar size={sizes[i]} variant="polaroid" />
        </span>
      ))}
    </span>
  )
}
