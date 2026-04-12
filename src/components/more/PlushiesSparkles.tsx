type PlushiesSparklesProps = {
  /** Fewer, softer sparkles for the More-page polaroid. */
  compact?: boolean
}

/** Soft animated sparkles around the Plushies note — subtle, not flashy. */
export function PlushiesSparkles ({ compact = false }: PlushiesSparklesProps) {
  const keys = compact ? ([1, 2, 3, 4] as const) : ([1, 2, 3, 4, 5, 6] as const)
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
