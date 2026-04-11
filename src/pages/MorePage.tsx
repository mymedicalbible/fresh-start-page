import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import { gameTokensEnabled } from '../lib/gameTokens'

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
    <div>
      <BackButton fallbackTo="/app" />
      <div className="scrap-sticker-grid">
        <ScrapSticker to="/app/visits" title="Visits" tone="mint" />
        <ScrapSticker to="/app/questions" title="Questions" tone="sky" />
        <ScrapSticker to="/app/analytics" title="Charts & trends" tone="lavender" />
        <ScrapSticker to="/app/diagnoses" title="Diagnoses" tone="pink" />
        {gameTokensEnabled() && (
          <Link to="/app/plushies" className="scrap-sticker scrap-sticker--cream">
            <span className="scrap-sticker-title">Plushies</span>
            <span className="scrap-sticker-sub">Tokens &amp; shop</span>
          </Link>
        )}
      </div>
    </div>
  )
}
