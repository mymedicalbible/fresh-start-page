/**
 * Vertical spiral coil (SVG pattern) for notebook gutter — decorative only.
 */
export function SpiralBinding () {
  return (
    <svg
      className="spiral-binding-svg"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
      preserveAspectRatio="none"
      width="100%"
      height="100%"
    >
      <defs>
        <linearGradient id="spiral-coil-metal" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9ca3af" />
          <stop offset="40%" stopColor="#f3f4f6" />
          <stop offset="55%" stopColor="#d1d5db" />
          <stop offset="100%" stopColor="#6b7280" />
        </linearGradient>
        {/* Stacked wire loops bulging into the gutter (left of paper) */}
        <pattern
          id="spiral-coil-pattern"
          patternUnits="userSpaceOnUse"
          width="36"
          height="22"
        >
          <path
            d="M 33 2 C 16 2 12 11 33 11 C 12 11 16 20 33 20"
            fill="none"
            stroke="url(#spiral-coil-metal)"
            strokeWidth="2.35"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#e8e4dc" />
      <rect width="100%" height="100%" fill="url(#spiral-coil-pattern)" />
    </svg>
  )
}
