import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Tone = 'blush' | 'mint' | 'sky' | 'butter'

type Props = {
  to: string
  tone: Tone
  label: string
  hint?: string
  /** Small count badge on the disc (e.g. open questions). */
  badge?: number
  children: ReactNode
}

export function QuickLogCircle ({ to, tone, label, hint, badge, children }: Props) {
  return (
    <Link
      to={to}
      className={`quick-log-circle quick-log-circle--${tone}`}
      title={hint}
    >
      <span className="quick-log-circle-disc" aria-hidden>
        <span className="quick-log-circle-stitch" />
        <span className="quick-log-circle-icon">{children}</span>
        {badge != null && badge > 0 && (
          <span className="quick-log-circle-badge">{badge > 99 ? '99+' : badge}</span>
        )}
      </span>
      <span className="quick-log-circle-label">{label}</span>
      {hint ? <span className="quick-log-circle-hint">{hint}</span> : null}
    </Link>
  )
}

/** Simple line-art style icons (stroke, currentColor) */
export function IconPain () {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

export function IconEpisode () {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M12 3c-1.5 3-5 5-5 9a5 5 0 0 0 10 0c0-4-3.5-6-5-9z" />
      <path d="M12 14v5" />
    </svg>
  )
}

export function IconQuestion () {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 0 1 4.95-.5c0 1.5-1.5 2-2 2.5V12" />
      <circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconVisit () {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M8 6h13v14H8z" />
      <path d="M8 6V4a2 2 0 0 1 2-2h5l4 4v12" />
      <path d="M11 12h6M11 16h4" />
    </svg>
  )
}

export function IconDoctors () {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function IconMeds () {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <rect x="7" y="7" width="10" height="14" rx="2" />
      <path d="M12 7V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" />
      <path d="M10 12h4" />
    </svg>
  )
}

export function IconTests () {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <path d="M14 2v6h6M10 13h4M10 17h4" />
    </svg>
  )
}

export function IconCharts () {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="M7 16l4-4 3 3 5-6" />
    </svg>
  )
}
