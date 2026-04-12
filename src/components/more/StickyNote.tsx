import { Link } from 'react-router-dom'
import { DaisyPin } from './DaisyPin'
import { PlushiesSparkles } from './PlushiesSparkles'

export type StickyNoteVariant = 'account' | 'plushies'

export type StickyNoteProps = {
  to: string
  title: string
  subtitle: string
  /** Drives colors, rotation, and Plushies-only sparkles */
  variant: StickyNoteVariant
}

export function StickyNote ({ to, title, subtitle, variant }: StickyNoteProps) {
  return (
    <Link
      to={to}
      className={`cork-note cork-note--${variant}`}
    >
      <span className="cork-note__pin" aria-hidden>
        <DaisyPin />
      </span>
      {variant === 'plushies' ? <PlushiesSparkles /> : null}
      <span className="cork-note__body">
        <span className="cork-note__title">{title}</span>
        <span className="cork-note__sub">{subtitle}</span>
      </span>
    </Link>
  )
}
