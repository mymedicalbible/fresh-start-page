import type { ExtractedVisitFields } from './transcriptExtract'
import type { ExtractedSoloFields } from './soloTranscriptExtract'

const STORAGE_KEY = 'mb-transcript-archive-v1'
const MAX_ITEMS = 50

export type ArchivedTranscriptKind = 'visit' | 'solo'

export type ArchivedTranscript = {
  id: string
  savedAtIso: string
  userId?: string
  doctorName: string
  visitDate: string
  transcript: string
  /** Visit wizard / dashboard visit transcriber (default). */
  kind?: ArchivedTranscriptKind
  extracted?: ExtractedVisitFields | null
  /** Solo voice update extract (when `kind` is `solo`). */
  extractedSolo?: ExtractedSoloFields | null
  /** Formatted clinical summary from extract (same idea as visit fields). */
  extractedSummary?: string
}

function uid (): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function scopedStorageKey (userId?: string): string {
  return userId?.trim() ? `${STORAGE_KEY}:${userId.trim()}` : STORAGE_KEY
}

export function loadTranscriptArchive (userId?: string): ArchivedTranscript[] {
  try {
    const raw = localStorage.getItem(scopedStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as ArchivedTranscript[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) => !userId || entry.userId === userId)
  } catch {
    return []
  }
}

export function pushTranscriptArchive (
  entry: Omit<ArchivedTranscript, 'id' | 'savedAtIso'>,
  userId?: string,
): ArchivedTranscript {
  const full: ArchivedTranscript = {
    id: uid(),
    savedAtIso: new Date().toISOString(),
    ...entry,
    userId: userId ?? entry.userId,
  }
  const prev = loadTranscriptArchive(userId)
  const next = [full, ...prev].slice(0, MAX_ITEMS)
  try {
    localStorage.setItem(scopedStorageKey(userId), JSON.stringify(next))
  } catch { /* quota */ }
  return full
}

export function deleteTranscriptArchiveItem (id: string, userId?: string) {
  const prev = loadTranscriptArchive(userId)
  const next = prev.filter((x) => x.id !== id)
  try {
    localStorage.setItem(scopedStorageKey(userId), JSON.stringify(next))
  } catch { /* ignore */ }
}

export function clearTranscriptArchive (userId?: string) {
  try {
    localStorage.removeItem(scopedStorageKey(userId))
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}
