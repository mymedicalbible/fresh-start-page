import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'

/** Flat pressed-flower decorations (muted, low opacity). */
function PressedFlowerDecor () {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      {/* Lavender sprig — top left */}
      <svg
        className="absolute -left-1 top-[12%] h-24 w-20 opacity-[0.26] sm:h-28 sm:w-24"
        viewBox="0 0 80 100"
        fill="none"
        style={{ transform: 'rotate(-18deg)' }}
      >
        <path d="M40 96V18" stroke="#7c6b8a" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="34" cy="22" rx="5" ry="7" fill="#9b8ab8" transform="rotate(-25 34 22)" opacity="0.85" />
        <ellipse cx="46" cy="18" rx="5" ry="7" fill="#a898c4" transform="rotate(18 46 18)" opacity="0.8" />
        <ellipse cx="38" cy="12" rx="4" ry="6" fill="#8a7aa8" transform="rotate(-8 38 12)" opacity="0.75" />
        <path d="M36 38c-4-2-6-8-4-12" stroke="#6b5d7a" strokeWidth="1" fill="none" />
        <ellipse cx="32" cy="32" rx="4" ry="5" fill="#9b8ab8" opacity="0.7" />
        <ellipse cx="44" cy="36" rx="4" ry="5" fill="#8f7eaa" opacity="0.65" />
      </svg>

      {/* Tiny daisy — bottom right */}
      <svg
        className="absolute -bottom-2 right-2 h-20 w-20 opacity-[0.24] sm:right-6 sm:h-24 sm:w-24"
        viewBox="0 0 64 64"
        style={{ transform: 'rotate(14deg)' }}
      >
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
          <ellipse
            key={i}
            cx="32"
            cy="20"
            rx="5"
            ry="9"
            fill="#e8e0dc"
            transform={`rotate(${deg} 32 32)`}
            opacity="0.92"
          />
        ))}
        <circle cx="32" cy="32" r="5" fill="#d4c4b8" />
        <circle cx="32" cy="32" r="2.5" fill="#b8a898" />
      </svg>

      {/* Small leaf — upper right edge */}
      <svg
        className="absolute right-0 top-[22%] h-16 w-14 opacity-[0.22] sm:right-4"
        viewBox="0 0 56 48"
        style={{ transform: 'rotate(32deg)' }}
      >
        <path
          d="M28 44c-8-12-10-28 2-38 12 8 10 24 2 38"
          fill="#8faa8a"
          opacity="0.75"
        />
        <path d="M28 44V12" stroke="#6b8a62" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      </svg>
    </div>
  )
}

type PolaroidNavCardProps = {
  to: string
  title: string
  caption: string
  photoClass: 'more-polaroid__photo--account' | 'more-polaroid__photo--plushies'
  tapeClass: '' | 'more-polaroid__tape--rose'
  frameRotateClass: string
  ariaLabel: string
}

function PolaroidNavCard ({
  to,
  title,
  caption,
  photoClass,
  tapeClass,
  frameRotateClass,
  ariaLabel,
}: PolaroidNavCardProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className="more-polaroid-link group relative block w-[min(88vw,220px)] shrink-0 outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-rose-300/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--more-hub-paper)]"
    >
      <div
        className={`more-polaroid__frame ${frameRotateClass} relative rounded-[2px] border border-black/[0.06] bg-white shadow-[0_14px_32px_rgba(45,38,42,0.22),0_4px_12px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_rgba(45,38,42,0.26),0_6px_14px_rgba(0,0,0,0.1)] group-active:translate-y-0`}
      >
        <span
          className={`more-polaroid__tape ${tapeClass}`.trim()}
          aria-hidden
        />
        <div className={`more-polaroid__photo ${photoClass}`}>
          <span className="more-polaroid__title">{title}</span>
        </div>
        <div className="more-polaroid__caption-strip">
          <span className="more-polaroid__caption">{caption}</span>
        </div>
      </div>
    </Link>
  )
}

export function MorePage () {
  return (
    <div className="scrapbook-inner scrap-more-page scrap-more-page--hub flex min-h-0 flex-1 flex-col">
      <div className="scrap-more-hub-back shrink-0 px-4 pb-2.5 pt-1">
        <BackButton fallbackTo="/app" />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <PressedFlowerDecor />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-10 px-4 py-8 sm:flex-row sm:gap-14 sm:py-10">
          <PolaroidNavCard
            to="/app/profile"
            title="Account"
            caption="profile & settings"
            photoClass="more-polaroid__photo--account"
            tapeClass=""
            frameRotateClass="-rotate-[2.5deg]"
            ariaLabel="Account — profile and settings"
          />
          <PolaroidNavCard
            to="/app/plushies"
            title="Plushies"
            caption="shop & collect"
            photoClass="more-polaroid__photo--plushies"
            tapeClass="more-polaroid__tape--rose"
            frameRotateClass="rotate-[2.5deg]"
            ariaLabel="Plushies — shop and collect"
          />
        </div>
      </div>
    </div>
  )
}
