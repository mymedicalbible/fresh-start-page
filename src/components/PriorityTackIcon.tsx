/** Pushpin icon — fill only (no background box). Color = urgency. */

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
      <path
        fill={color}
        d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h12v-2c-1.66 0-3-1.34-3-3zm-2 12c0 .55-.45 1-1 1s-1-.45-1-1v-3h2v3z"
      />
    </svg>
  )
}
