import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'

function ScrapSticker ({
  to, title, sub, tone,
}: { to: string; title: string; sub: string; tone: 'pink' | 'mint' | 'sky' | 'cream' | 'lavender' }) {
  return (
    <Link to={to} className={`scrap-sticker scrap-sticker--${tone}`}>
      <span className="scrap-sticker-title">{title}</span>
      <span className="scrap-sticker-sub">{sub}</span>
    </Link>
  )
}

export function MorePage () {
  return (
    <div>
      <BackButton fallbackTo="/app" />
      <div className="scrap-sticker-grid">
        <ScrapSticker to="/app/visits" title="Visits" sub="All visit history" tone="mint" />
        <ScrapSticker to="/app/questions" title="Questions" sub="Open & answered" tone="sky" />
        <ScrapSticker to="/app/tests" title="Tests & orders" sub="Pending & results" tone="cream" />
        <ScrapSticker to="/app/diagnoses" title="Diagnoses" sub="Confirmed & suspected" tone="pink" />
      </div>
    </div>
  )
}
