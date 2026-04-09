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
    <div className="scrapbook-dashboard">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <BackButton />
        <h2 style={{ margin: 0 }}>More</h2>
      </div>
      <div className="scrap-sticker-grid">
        <ScrapSticker to="/app/visits" title="Visits" sub="Visit logs" tone="mint" />
        <ScrapSticker to="/app/questions" title="Questions" sub="For your doctors" tone="sky" />
        <ScrapSticker to="/app/tests" title="Tests" sub="Orders & results" tone="cream" />
        <ScrapSticker to="/app/diagnoses" title="Diagnoses" sub="Your directory" tone="lavender" />
      </div>
    </div>
  )
}
