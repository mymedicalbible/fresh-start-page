import { BackButton } from '../components/BackButton'
import { CorkBoardBackground, StickyNote } from '../components/more'

export function MorePage () {
  return (
    <div className="scrapbook-inner scrap-more-page scrap-more-page--hub">
      <div className="scrap-more-hub-back">
        <BackButton fallbackTo="/app" />
      </div>
      <CorkBoardBackground>
        <div className="cork-board__notes">
          <StickyNote
            to="/app/profile"
            title="Account"
            subtitle="Profile & settings"
            variant="account"
          />
          <StickyNote
            to="/app/plushies"
            title="Plushies"
            subtitle="Shop & collect"
            variant="plushies"
          />
        </div>
      </CorkBoardBackground>
      <div className="more-grass-footer" aria-hidden>
        <img src="/more-grass-footer.png" alt="" width={1200} height={200} decoding="async" />
      </div>
    </div>
  )
}
