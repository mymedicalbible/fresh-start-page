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

export function MorePage () {
  return (
    <div className="scrapbook-inner scrap-more-page">
      <BackButton fallbackTo="/app" />
      <div className="scrap-more-notebook-sheet">
        <div className="scrap-more-notebook-holes" aria-hidden>
          <span /><span /><span />
        </div>
        <div className="scrap-sticker-grid">
          <ScrapSticker to="/app/visits" title="Visits" tone="mint" />
          <ScrapSticker to="/app/questions" title="Questions" tone="sky" />
          <ScrapSticker to="/app/analytics" title="Charts & trends" tone="lavender" />
          <ScrapSticker to="/app/diagnoses" title="Diagnoses" tone="pink" />
          <ScrapSticker to="/app/profile" title="Account" sub="profile & export" tone="cream" />
          <ScrapSticker to="/app/plushies" title="Plushies" sub="tokens & shop" tone="cream" />
        </div>
      </div>
    </div>
  )
}
