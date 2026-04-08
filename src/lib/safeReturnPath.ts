/**
 * Decode and validate an in-app return path from query (?returnTo=).
 * Only same-site paths under /app are allowed (blocks protocol-relative //…).
 */
export function parseAppReturnPath (raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null
  try {
    const s = decodeURIComponent(raw).trim()
    if (!s.startsWith('/') || s.startsWith('//')) return null
    if (!s.startsWith('/app')) return null
    return s
  } catch {
    return null
  }
}

export function safeAppReturnPath (raw: string | null | undefined, fallback: string): string {
  return parseAppReturnPath(raw) ?? fallback
}
