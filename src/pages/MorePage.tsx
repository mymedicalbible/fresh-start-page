import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'

/**
 * PNGs cropped from the PSD `Object` layer (real alpha). The flat JPG in the zip has no transparency;
 * the opaque `Background` layer was omitted when exporting.
 */
function PressedFlowerPhotos () {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <img
        src="/flowers/flower1.png"
        alt=""
        style={{ position: 'absolute', top: '10%', left: '3%', width: 60, transform: 'rotate(-20deg)', opacity: 0.85, pointerEvents: 'none' }}
      />
      <img
        src="/flowers/flower2.png"
        alt=""
        style={{ position: 'absolute', top: '8%', right: '5%', width: 50, transform: 'rotate(25deg)', opacity: 0.85, pointerEvents: 'none' }}
      />
      <img
        src="/flowers/flower3.png"
        alt=""
        style={{ position: 'absolute', top: '50%', right: '6%', width: 55, transform: 'rotate(15deg)', opacity: 0.85, pointerEvents: 'none' }}
      />
      <img
        src="/flowers/flower4.png"
        alt=""
        style={{ position: 'absolute', bottom: '20%', left: '5%', width: 55, transform: 'rotate(-15deg)', opacity: 0.85, pointerEvents: 'none' }}
      />
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
        <PressedFlowerPhotos />

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
