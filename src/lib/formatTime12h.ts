/**
 * Format a stored time value (HTML time input / Postgres time: HH:mm or HH:mm:ss) for 12-hour display.
 */
export function formatTime12h (value: string | null | undefined): string {
  if (!value?.trim()) return ''
  const s = value.trim()
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return s
  let h = parseInt(m[1], 10)
  const min = m[2]
  if (h > 23 || Number(min) > 59) return s
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${min} ${ampm}`
}
