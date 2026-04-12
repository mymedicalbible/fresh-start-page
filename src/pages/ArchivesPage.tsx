import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'

function ScrapSticker ({
  to, title, sub, tone,
}: { to: string; title: string; sub?: string; tone: 'pink' | 'mint' | 'sky' | 'cream' | 'lavender' | 'yellow' }) {
  return (
    <Link to={to} className={`scrap-sticker scrap-sticker--${tone}`}>
      <span className="scrap-sticker-title">{title}</span>
      {sub ? <span className="scrap-sticker-sub">{sub}</span> : null}
    </Link>
  )
}

export function ArchivesPage () {
  return (
    <div className="scrapbook-inner scrap-more-page">
      <BackButton fallbackTo="/app" />
      <div className="scrap-more-notebook-sheet">
        <div className="scrap-more-notebook-holes" aria-hidden>
          <span /><span /><span />
        </div>
        <div className="scrap-sticker-grid">
          <ScrapSticker to="/app/visits" title="Visits" tone="yellow" />
          <ScrapSticker to="/app/questions" title="Questions" tone="sky" />
          <ScrapSticker to="/app/transcripts" title="Transcripts" sub="visit recordings" tone="lavender" />
          <ScrapSticker to="/app/diagnoses" title="Diagnoses" tone="mint" />
        </div>
      </div>
    </div>
  )
}
