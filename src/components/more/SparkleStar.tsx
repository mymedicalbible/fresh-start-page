import { useId } from 'react'

export type SparkleStarVariant = 'polaroid' | 'mystery'

type SparkleStarProps = {
  size?: number
  variant?: SparkleStarVariant
  className?: string
}

/**
 * Illustration-style sparkle: crossed rays + diagonals, soft radial fill — not a round “dot”.
 */
export function SparkleStar ({ size = 14, variant = 'polaroid', className }: SparkleStarProps) {
  const uid = useId().replace(/:/g, '')
  const gradId = `sparkle-rad-${uid}`

  const core =
    variant === 'mystery'
      ? (
        <>
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#f5f3ff" />
          <stop offset="72%" stopColor="#ddd6fe" />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.25" />
        </>
        )
      : (
        <>
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="38%" stopColor="#fff7fb" />
          <stop offset="72%" stopColor="#fbcfe8" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#f9a8d4" stopOpacity="0.2" />
        </>
        )

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient id={gradId} cx="50%" cy="42%" r="58%">
          {core}
        </radialGradient>
      </defs>
      <g>
        {/* Primary four rays */}
        <rect x="14" y="3" width="4" height="26" rx="2" fill={`url(#${gradId})`} />
        <rect x="3" y="14" width="26" height="4" rx="2" fill={`url(#${gradId})`} />
        {/* Diagonal rays (thinner) — reads as a real sparkle, not a disc */}
        <g opacity="0.55" transform="rotate(45 16 16)">
          <rect x="15" y="5" width="2" height="22" rx="1" fill={`url(#${gradId})`} />
          <rect x="5" y="15" width="22" height="2" rx="1" fill={`url(#${gradId})`} />
        </g>
        {/* Center glint */}
        <circle cx="16" cy="16" r="3.2" fill="#ffffff" opacity="0.92" />
        <circle cx="16" cy="16" r="1.6" fill="#ffffff" opacity="0.55" />
      </g>
    </svg>
  )
}
