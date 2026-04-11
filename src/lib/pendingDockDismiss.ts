import { normDoctorKey } from './doctorNameNorm'

const STORAGE_KEY = 'mb-pending-dock-dismissed-v1'

function readRaw (): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as unknown
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

function writeRaw (data: Record<string, string[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* quota */ }
}

/** Norm keys dismissed from the dashboard pending-visit dock (per user). */
export function loadDismissedPendingDockNorms (userId: string): Set<string> {
  const raw = readRaw()
  const list = raw[userId] ?? []
  return new Set(list.map((s) => normDoctorKey(String(s))))
}

export function dismissPendingDockNorm (userId: string, normKey: string) {
  const k = normDoctorKey(normKey)
  const raw = readRaw()
  const prev = raw[userId] ?? []
  if (prev.some((x) => normDoctorKey(x) === k)) return
  raw[userId] = [...prev, k]
  writeRaw(raw)
}
