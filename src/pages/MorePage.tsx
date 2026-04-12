import { useId } from 'react'
import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'

/** Decorative daisy “push pin” above each sticky note */
function DaisyPin () {
  const gid = useId().replace(/:/g, '')
  const gradId = `daisy-c-${gid}`
  return (
    <svg
      className="scrap-more-daisy-pin"
      viewBox="0 0 48 48"
      width={44}
      height={44}
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
          strokeWidth="0.4"
          transform={`rotate(${deg} 24 24)`}
        />
      ))}
      <circle cx="24" cy="24" r="7" fill={`url(#${gradId})`} stroke="#a16207" strokeWidth="0.35" />
    </svg>
  )
}

export function MorePage () {
  return (
    <div className="scrapbook-inner scrap-more-page scrap-more-page--hub">
      <div className="scrap-more-hub-back">
        <BackButton fallbackTo="/app" />
      </div>
      <div className="scrap-more-sticky-stack">
        <Link to="/app/profile" className="scrap-more-sticky scrap-more-sticky--account">
          <span className="scrap-more-sticky-pin-wrap" aria-hidden>
            <DaisyPin />
          </span>
          <span className="scrap-more-sticky-title">Account</span>
          <span className="scrap-more-sticky-sub">profile & export</span>
        </Link>
        <Link to="/app/plushies" className="scrap-more-sticky scrap-more-sticky--plushies">
          <span className="scrap-more-sticky-pin-wrap" aria-hidden>
            <DaisyPin />
          </span>
          <span className="scrap-more-sticky-title">Plushies</span>
          <span className="scrap-more-sticky-sub">tokens & shop</span>
        </Link>
      </div>
    </div>
  )
}
