import type { ExtractedVisitFields } from './transcriptExtract'

const STORAGE_KEY = 'mb-transcript-archive-v1'
const MAX_ITEMS = 50

export type ArchivedTranscript = {
  id: string
  savedAtIso: string
  doctorName: string
  visitDate: string
  transcript: string
  extracted?: ExtractedVisitFields | null
  /** Formatted clinical summary from extract (same idea as visit fields). */
  extractedSummary?: string
}

function uid (): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadTranscriptArchive (): ArchivedTranscript[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ArchivedTranscript[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function pushTranscriptArchive (
  entry: Omit<ArchivedTranscript, 'id' | 'savedAtIso'>
): ArchivedTranscript {
  const full: ArchivedTranscript = {
    id: uid(),
    savedAtIso: new Date().toISOString(),
    ...entry,
  }
  const prev = loadTranscriptArchive()
  const next = [full, ...prev].slice(0, MAX_ITEMS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch { /* quota */ }
  return full
}

export function deleteTranscriptArchiveItem (id: string) {
  const prev = loadTranscriptArchive()
  const next = prev.filter((x) => x.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}
