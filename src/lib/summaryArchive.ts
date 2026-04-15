const STORAGE_KEY = 'mb-health-summary-archive-v1'
const MAX_ITEMS = 40

export type ArchivedHandoffSummary = {
  id: string
  savedAtIso: string
  userId?: string
  /** User-facing date line */
  generatedLabel: string
  text: string
  sourceAi: boolean
  /** When sourceAi: local Ollama vs legacy exports without this flag */
  aiKind?: 'ollama'
}

function uid (): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function scopedStorageKey (userId?: string): string {
  return userId?.trim() ? `${STORAGE_KEY}:${userId.trim()}` : STORAGE_KEY
}

export function loadSummaryArchive (userId?: string): ArchivedHandoffSummary[] {
  try {
    const raw = localStorage.getItem(scopedStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as ArchivedHandoffSummary[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) => !userId || entry.userId === userId)
  } catch {
    return []
  }
}

export function pushSummaryArchive (
  entry: Omit<ArchivedHandoffSummary, 'id' | 'savedAtIso'>,
  userId?: string,
): ArchivedHandoffSummary {
  const full: ArchivedHandoffSummary = {
    id: uid(),
    savedAtIso: new Date().toISOString(),
    ...entry,
    userId: userId ?? entry.userId,
  }
  const prev = loadSummaryArchive(userId)
  const next = [full, ...prev].slice(0, MAX_ITEMS)
  try {
    localStorage.setItem(scopedStorageKey(userId), JSON.stringify(next))
  } catch { /* quota */ }
  return full
}

export function deleteSummaryArchiveItem (id: string, userId?: string) {
  const prev = loadSummaryArchive(userId)
  const next = prev.filter((x) => x.id !== id)
  try {
    localStorage.setItem(scopedStorageKey(userId), JSON.stringify(next))
  } catch { /* ignore */ }
}

export function clearSummaryArchive (userId?: string) {
  try {
    localStorage.removeItem(scopedStorageKey(userId))
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}
