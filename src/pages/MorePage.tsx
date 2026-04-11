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

function TapeCornerCard ({
  to,
  title,
  sub,
  variant,
}: {
  to: string
  title: string
  sub: string
  variant: 'account' | 'plushies'
}) {
  return (
    <Link
      to={to}
      className={`scrap-more-tape-card scrap-more-tape-card--${variant}`}
    >
      <span className="scrap-account-corner-tape scrap-account-corner-tape--tl" aria-hidden />
      <span className="scrap-account-corner-tape scrap-account-corner-tape--tr" aria-hidden />
      <span className="scrap-account-corner-tape scrap-account-corner-tape--bl" aria-hidden />
      <span className="scrap-account-corner-tape scrap-account-corner-tape--br" aria-hidden />
      <span className="scrap-more-tape-card-title">{title}</span>
      <span className="scrap-more-tape-card-sub">{sub}</span>
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

      <section className="scrap-more-overlap" aria-label="Account and Plushies">
        <TapeCornerCard
          to="/app/profile"
          title="Account"
          sub="profile & export"
          variant="account"
        />
        <TapeCornerCard
          to="/app/plushies"
          title="Plushies"
          sub="tokens & shop"
          variant="plushies"
        />
      </section>
    </div>
  )
}
