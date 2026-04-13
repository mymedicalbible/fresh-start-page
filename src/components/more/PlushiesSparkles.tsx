import { Sparkles } from 'lucide-react'

type PlushiesSparklesProps = {
  /** Polaroid styling on the More page (same six shapes as default, with tighter polaroid glow). */
  compact?: boolean
}

const SIZES_FULL = [14, 16, 12, 16, 14, 16] as const
const SIZES_POLAROID_DENSE = [14, 16, 12, 16, 14, 16, 12, 16, 14, 16, 12, 16] as const

/** Lucide `Sparkles` + `animate-pulse` — soft shimmer (see Tailwind pulse). One icon uses `animate-bounce` for a bit of life. */
export function PlushiesSparkles ({ compact = false }: PlushiesSparklesProps) {
  const keys = compact
    ? ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const)
    : ([1, 2, 3, 4, 5, 6] as const)
  const sizes = compact ? SIZES_POLAROID_DENSE : SIZES_FULL
  const pulseClass =
    'text-yellow-400 animate-pulse motion-reduce:animate-none motion-reduce:opacity-70'
  const bounceClass =
    'text-yellow-400 animate-bounce rotate-12 motion-reduce:animate-none motion-reduce:opacity-70'

  return (
    <span
      className={`cork-sparkles${compact ? ' cork-sparkles--polaroid cork-sparkles--polaroid-dense' : ''}`}
      aria-hidden
    >
      {keys.map((n, i) => (
        <span key={n} className={`cork-sparkles__shape cork-sparkles__shape--${n}`}>
          <Sparkles
            size={sizes[i]}
            strokeWidth={1.75}
            className={n === 5 ? bounceClass : pulseClass}
          />
        </span>
      ))}
    </span>
  )
}
