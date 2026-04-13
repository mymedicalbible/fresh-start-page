import { useId, type CSSProperties } from 'react'

export type FlickerSparkleVariant = 'polaroid' | 'gift'

export type FlickerSparkleProps = {
  size: number
  variant?: FlickerSparkleVariant
  /** Passed to the flickering wrapper (e.g. animationDelay, animationDuration). */
  style?: CSSProperties
  className?: string
}

/**
 * Filled SVG star-burst (not a stroke icon) + CSS `sparkle-flicker` animation on the wrapper.
 * Rotation should be applied by a parent wrapper so scale/opacity on this node stay independent.
 */
export function FlickerSparkle ({ size, variant = 'polaroid', style, className }: FlickerSparkleProps) {
  const uid = useId().replace(/:/g, '')
  const gradId = `flicker-sparkle-grad-${uid}`

  const stops =
    variant === 'gift'
      ? (
        <>
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#fffbeb" />
          <stop offset="68%" stopColor="#fde68a" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.35" />
        </>
        )
      : (
        <>
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#fff7fb" />
          <stop offset="72%" stopColor="#fbcfe8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#f9a8d4" stopOpacity="0.25" />
        </>
        )

  const mod = variant === 'gift' ? 'sparkle-flicker--gift' : 'sparkle-flicker--polaroid'

  return (
    <span
      className={`sparkle-flicker ${mod}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        className="sparkle-flicker__svg"
        aria-hidden
      >
        <defs>
          <radialGradient id={gradId} cx="50%" cy="42%" r="58%">
            {stops}
          </radialGradient>
        </defs>
        <g fill={`url(#${gradId})`}>
          <rect x="14" y="3" width="4" height="26" rx="2" />
          <rect x="3" y="14" width="26" height="4" rx="2" />
          <g opacity="0.58" transform="rotate(45 16 16)">
            <rect x="15" y="5" width="2" height="22" rx="1" />
            <rect x="5" y="15" width="22" height="2" rx="1" />
          </g>
          <circle cx="16" cy="16" r="3.2" fill="#ffffff" opacity="0.95" />
          <circle cx="16" cy="16" r="1.5" fill="#ffffff" opacity="0.55" />
        </g>
      </svg>
    </span>
  )
}
