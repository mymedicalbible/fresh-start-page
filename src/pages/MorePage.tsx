import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { BackButton } from '../components/BackButton'
import {
  DoodleCharts,
  DoodleDiagnoses,
  DoodleQuestions,
  DoodleVisits,
} from './morePageDoodles'

type DoodleNavItem = {
  to: string
  label: string
  Doodle: ComponentType
}

const DOODLE_NAV: DoodleNavItem[] = [
  { to: '/app/visits', label: 'Visits', Doodle: DoodleVisits },
  { to: '/app/questions', label: 'Questions', Doodle: DoodleQuestions },
  { to: '/app/analytics', label: 'Charts & trends', Doodle: DoodleCharts },
  { to: '/app/diagnoses', label: 'Diagnoses', Doodle: DoodleDiagnoses },
]

export function MorePage () {
  return (
    <div className="scrapbook-inner scrap-more-page">
      <BackButton fallbackTo="/app" />
      <div className="scrap-more-notebook-sheet">
        <div className="scrap-more-notebook-holes" aria-hidden>
          <span /><span /><span />
        </div>
        <nav className="scrap-more-doodles" aria-label="More navigation">
          {DOODLE_NAV.map(({ to, label, Doodle }) => (
            <Link key={to} to={to} className="scrap-more-doodle" aria-label={label}>
              <Doodle />
            </Link>
          ))}
        </nav>
        <div className="scrap-more-marker-row" aria-label="Account and plushies">
          <Link to="/app/profile" className="scrap-more-marker scrap-more-marker--account">
            Account
          </Link>
          <Link to="/app/plushies" className="scrap-more-marker scrap-more-marker--plushies">
            Plushies
          </Link>
        </div>
      </div>
    </div>
  )
}
