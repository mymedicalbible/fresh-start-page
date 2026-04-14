import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'

type PolaroidNavCardProps = {
  to: string
  title: string
  caption: string
  photoClass:
    | 'more-polaroid__photo--account'
    | 'more-polaroid__photo--diagnoses'
    | 'more-polaroid__photo--transcripts'
  tapeClass: '' | 'more-polaroid__tape--rose'
  frameRotateClass: string
  ariaLabel: string
  /** Entire polaroid frame is square (image area + caption fit inside). */
  squarePhoto?: boolean
}

function PolaroidNavCard ({
  to,
  title,
  caption,
  photoClass,
  tapeClass,
  frameRotateClass,
  ariaLabel,
  squarePhoto = false,
}: PolaroidNavCardProps) {
  return (
    <Link
      to={to}
      aria-label={ariaLabel}
      className={`more-polaroid-link group relative block shrink-0 outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-rose-300/90 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--more-hub-paper)] ${
        squarePhoto
          ? 'aspect-square w-[min(44vw,180px)]'
          : 'w-[min(44vw,180px)]'
      }`}
    >
      <div
        className={`more-polaroid__frame ${frameRotateClass} relative rounded-[2px] border border-black/[0.06] bg-white shadow-[0_8px_20px_rgba(45,38,42,0.18),0_2px_8px_rgba(0,0,0,0.07)] ${
          squarePhoto
            ? 'flex h-full min-h-0 flex-col overflow-hidden pt-2.5 px-2.5 pb-2'
            : ''
        }`}
      >
        <span
          className={`more-polaroid__tape ${tapeClass}`.trim()}
          aria-hidden
        />
        <div
          className={`more-polaroid__photo ${photoClass} ${
            squarePhoto
              ? 'flex-1 min-h-0 !m-0 !min-h-0'
              : 'h-[100px] min-h-[100px]'
          }`}
        >
          <span className="more-polaroid__title !text-[0.85rem]">{title}</span>
        </div>
        <div
          className={`more-polaroid__caption-strip py-2 px-3 !min-h-0 ${
            squarePhoto ? 'shrink-0' : ''
          }`}
        >
          <span className="more-polaroid__caption text-[0.7rem]">{caption}</span>
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

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-8 sm:py-10">
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-row gap-6">
            <PolaroidNavCard
              to="/app/transcripts"
              title="Transcripts"
              caption="visit recordings"
              photoClass="more-polaroid__photo--transcripts"
              tapeClass=""
              frameRotateClass="-rotate-[2deg]"
              ariaLabel="Transcripts — visit recordings"
            />
            <PolaroidNavCard
              to="/app/diagnoses"
              title="Diagnoses"
              caption="your list"
              photoClass="more-polaroid__photo--diagnoses"
              tapeClass=""
              frameRotateClass="rotate-[2deg]"
              ariaLabel="Diagnoses — your list"
            />
          </div>
          <div className="-translate-y-2">
            <PolaroidNavCard
              to="/app/profile"
              title="Account"
              caption="profile & settings"
              photoClass="more-polaroid__photo--account"
              tapeClass=""
              frameRotateClass="-rotate-[1deg]"
              ariaLabel="Account — profile and settings"
              squarePhoto
            />
          </div>
        </div>
      </div>
    </div>
  )
}
