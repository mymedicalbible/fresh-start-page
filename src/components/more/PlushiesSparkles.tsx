type PlushiesSparklesProps = {
  /** Polaroid styling on the More page (same six shapes as default, with tighter polaroid glow). */
  compact?: boolean
}

/** Soft animated sparkles around the Plushies note — subtle, not flashy. */
export function PlushiesSparkles ({ compact = false }: PlushiesSparklesProps) {
  const keys = [1, 2, 3, 4, 5, 6] as const
  return (
    <span
      className={`cork-sparkles${compact ? ' cork-sparkles--polaroid' : ''}`}
      aria-hidden
    >
      {keys.map((n) => (
        <span key={n} className={`cork-sparkles__shape cork-sparkles__shape--${n}`} />
      ))}
    </span>
  )
}
