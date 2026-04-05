const STORAGE_KEY = 'mb-health-summary-archive-v1'
const MAX_ITEMS = 40

export type ArchivedHandoffSummary = {
  id: string
  savedAtIso: string
  /** User-facing date line */
  generatedLabel: string
  text: string
  sourceAi: boolean
}

function uid (): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadSummaryArchive (): ArchivedHandoffSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ArchivedHandoffSummary[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function pushSummaryArchive (entry: Omit<ArchivedHandoffSummary, 'id' | 'savedAtIso'>): ArchivedHandoffSummary {
  const full: ArchivedHandoffSummary = {
    id: uid(),
    savedAtIso: new Date().toISOString(),
    ...entry,
  }
  const prev = loadSummaryArchive()
  const next = [full, ...prev].slice(0, MAX_ITEMS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch { /* quota */ }
  return full
}

export function deleteSummaryArchiveItem (id: string) {
  const prev = loadSummaryArchive()
  const next = prev.filter((x) => x.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}
