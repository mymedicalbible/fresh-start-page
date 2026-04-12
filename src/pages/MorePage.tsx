import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { PlushiesSparkles } from '../components/more'

type PolaroidNavCardProps = {
  to: string
  title: string
  caption: string
  photoClass: 'more-polaroid__photo--account' | 'more-polaroid__photo--plushies'
  tapeClass: '' | 'more-polaroid__tape--rose'
  frameRotateClass: string
  ariaLabel: string
  sparkles?: boolean
}

function PolaroidNavCard ({
  to,
  title,
  caption,
  photoClass,
  tapeClass,
  frameRotateClass,
  ariaLabel,
  sparkles = false,
}: PolaroidNavCardProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className="more-polaroid-link group relative block w-[min(92vw,300px)] shrink-0 outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-rose-300/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--more-hub-paper)]"
    >
      <div
        className={`more-polaroid__frame ${frameRotateClass} relative rounded-[2px] border border-black/[0.06] bg-white shadow-[0_14px_32px_rgba(45,38,42,0.22),0_4px_12px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_rgba(45,38,42,0.26),0_6px_14px_rgba(0,0,0,0.1)] group-active:translate-y-0`}
      >
        <span
          className={`more-polaroid__tape ${tapeClass}`.trim()}
          aria-hidden
        />
        <div className={`more-polaroid__photo ${photoClass}`}>
          {sparkles ? <PlushiesSparkles compact /> : null}
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

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-12 px-4 py-8 sm:flex-row sm:gap-16 md:gap-20 sm:py-10">
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
          sparkles
        />
      </div>
    </div>
  )
}
