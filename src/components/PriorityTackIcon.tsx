/** Thumbtack / pushpin — round head + needle + point. One fill color (urgency). */

type Props = {
  color: string
  size?: number
  title?: string
  className?: string
}

export function PriorityTackIcon ({ color, size = 20, title, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ flexShrink: 0, display: 'block' }}
    >
      {title ? <title>{title}</title> : null}
      <g fill={color}>
        {/* Domed head (the part you push) */}
        <ellipse cx="12" cy="8.5" rx="7" ry="6" />
        {/* Straight needle */}
        <rect x="10.5" y="13.5" width="3" height="7" rx="0.6" />
        {/* Sharp tip */}
        <path d="M10.5 20.5 L12 23 L13.5 20.5 Z" />
      </g>
    </svg>
  )
}
