import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'

function ScrapSticker ({
  to, title, sub, tone,
}: { to: string; title: string; sub?: string; tone: 'pink' | 'mint' | 'sky' | 'cream' | 'lavender' }) {
  return (
    <Link to={to} className={`scrap-sticker scrap-sticker--${tone}`}>
      <span className="scrap-sticker-title">{title}</span>
      {sub ? <span className="scrap-sticker-sub">{sub}</span> : null}
    </Link>
  )
}

function CorkPinCard ({
  to,
  title,
  sub,
  variant,
  tilt,
}: {
  to: string
  title: string
  sub: string
  variant: 'lavender' | 'cream'
  tilt: 'a' | 'b'
}) {
  return (
    <Link
      to={to}
      className={`scrap-more-pin-card scrap-more-pin-card--${variant} scrap-more-pin-card--tilt-${tilt}`}
    >
      <span className="scrap-more-pin-card-pin" aria-hidden />
      <span className="scrap-more-pin-card-title">{title}</span>
      <span className="scrap-more-pin-card-sub">{sub}</span>
    </Link>
  )
}

export function MorePage () {
  return (
    <div className="scrapbook-inner scrap-more-page">
      <BackButton fallbackTo="/app" />
      <div className="scrap-sticker-grid">
        <ScrapSticker to="/app/visits" title="Visits" tone="mint" />
        <ScrapSticker to="/app/questions" title="Questions" tone="sky" />
        <ScrapSticker to="/app/analytics" title="Charts & trends" tone="lavender" />
        <ScrapSticker to="/app/diagnoses" title="Diagnoses" tone="pink" />
      </div>

      <section className="scrap-more-cork" aria-label="Pinned shortcuts">
        <div className="scrap-more-cork-frame">
          <span className="scrap-more-cork-tack scrap-more-cork-tack--tl" aria-hidden />
          <span className="scrap-more-cork-tack scrap-more-cork-tack--tr" aria-hidden />
          <div className="scrap-more-cork-board">
            <div className="scrap-more-cork-pins">
              <CorkPinCard
                to="/app/profile"
                title="Account"
                sub="profile & export"
                variant="lavender"
                tilt="a"
              />
              <CorkPinCard
                to="/app/plushies"
                title="Plushies"
                sub="tokens & shop"
                variant="cream"
                tilt="b"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
