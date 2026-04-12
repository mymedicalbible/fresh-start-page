import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'

function ScrapSticker ({
  to, title, sub, tone, titleClassName,
}: {
  to: string
  title: string
  sub?: string
  tone: 'pink' | 'mint' | 'sky' | 'cream' | 'lavender'
  /** e.g. crayon variants on More hub */
  titleClassName?: string
}) {
  return (
    <Link to={to} className={`scrap-sticker scrap-sticker--${tone}`}>
      <span className={`scrap-sticker-title${titleClassName ? ` ${titleClassName}` : ''}`}>{title}</span>
      {sub ? <span className="scrap-sticker-sub">{sub}</span> : null}
    </Link>
  )
}

export function MorePage () {
  return (
    <div className="scrapbook-inner scrap-more-page scrap-more-page--hub">
      <div className="scrap-more-hub-back">
        <BackButton fallbackTo="/app" />
      </div>
      <div className="scrap-more-notebook-sheet">
        <div className="scrap-more-notebook-holes" aria-hidden>
          <span /><span /><span />
        </div>
        <div className="scrap-sticker-grid">
          <ScrapSticker
            to="/app/profile"
            title="Account"
            sub="profile & export"
            tone="cream"
            titleClassName="scrap-sticker-title--crayon-a"
          />
          <ScrapSticker
            to="/app/plushies"
            title="Plushies"
            sub="tokens & shop"
            tone="cream"
            titleClassName="scrap-sticker-title--crayon-b"
          />
        </div>
      </div>
    </div>
  )
}
