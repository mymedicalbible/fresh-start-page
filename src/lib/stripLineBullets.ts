/**
 * Remove leading list markers from a single line (•, -, *, or 1. style).
 * Preserves indentation before the marker.
 */
export function stripLineBullet (line: string): string {
  const bullet = line.match(/^(\s*)([•\-*])(?:\s+(.*)|(.*))$/)
  if (bullet) {
    const rest = (bullet[3] ?? bullet[4] ?? '').trimEnd()
    return rest ? `${bullet[1]}${rest}` : bullet[1]
  }
  const numbered = line.match(/^(\s*)(\d+)\.\s+(.*)$/)
  if (numbered) return `${numbered[1]}${numbered[3]}`
  return line
}

/** Apply {@link stripLineBullet} to every line (e.g. archived handoff summary body). */
export function stripLineBulletsFromText (text: string): string {
  return text.split('\n').map(stripLineBullet).join('\n')
}
