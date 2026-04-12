import { useId } from 'react'

/** Small daisy push-pin for sticky notes (top center). */
export function DaisyPin () {
  const gid = useId().replace(/:/g, '')
  const gradId = `daisy-g-${gid}`
  return (
    <svg
      className="cork-daisy-pin"
      viewBox="0 0 48 48"
      width={48}
      height={48}
      aria-hidden
    >
      <defs>
        <radialGradient id={gradId} cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="70%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#ca8a04" />
        </radialGradient>
      </defs>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <ellipse
          key={deg}
          cx="24"
          cy="12"
          rx="6"
          ry="11"
          fill="#fefce8"
          stroke="#e7e5e4"
          strokeWidth="0.35"
          transform={`rotate(${deg} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="6.5" fill={`url(#${gradId})`} stroke="#a16207" strokeWidth="0.3" />
    </svg>
  )
}
