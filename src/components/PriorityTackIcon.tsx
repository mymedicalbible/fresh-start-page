/** Twemoji pushpin (U+1F4CC) geometry — plastic ends use `color`, needle matches emoji silver. CC-BY 4.0: https://twemoji.twitter.com/ */

type Props = {
  color: string
  size?: number
  title?: string
  className?: string
}

/** Darker plastic shade (Twemoji uses #BE1931 vs #DD2E44 for the two reds). */
function tackShadowColor (hex: string): string {
  const h = hex.trim().replace(/^#/, '')
  if (h.length !== 6 || !/^[0-9a-f]+$/i.test(h)) return hex
  const n = parseInt(h, 16)
  const factor = 0.72
  const r = Math.round((n >> 16) * factor)
  const g = Math.round(((n >> 8) & 0xff) * factor)
  const b = Math.round((n & 0xff) * factor)
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

export function PriorityTackIcon ({ color, size = 20, title, className }: Props) {
  const shadow = tackShadowColor(color)

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      width={size}
      height={size}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ flexShrink: 0, display: 'block' }}
    >
      {title ? <title>{title}</title> : null}
      {/* Order + paths from Twemoji 1f4cc.svg */}
      <path fill={shadow} d="M23.651 23.297L12.702 12.348l9.386-7.821 9.385 9.385z" />
      <path
        fill={color}
        d="M34.6 13.912c-1.727 1.729-4.528 1.729-6.255 0l-6.257-6.256c-1.729-1.727-1.729-4.53 0-6.258 1.726-1.727 4.528-1.727 6.257 0L34.6 7.656c1.728 1.727 1.728 4.529 0 6.256z"
      />
      <path fill="#99AAB5" d="M14 17.823S-.593 35.029.188 35.813C.97 36.596 18.177 22 18.177 22L14 17.823z" />
      <path
        fill={color}
        d="M25.215 27.991c-1.726 1.729-4.528 1.729-6.258 0L8.009 17.041c-1.727-1.728-1.727-4.528 0-6.256 1.728-1.729 4.53-1.729 6.258 0l10.948 10.949c1.728 1.729 1.728 4.528 0 6.257z"
      />
    </svg>
  )
}
