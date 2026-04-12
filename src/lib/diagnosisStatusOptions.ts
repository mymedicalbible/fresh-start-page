/**
 * Canonical status values for `diagnoses_directory.status` and transcript extract.
 * Keep in sync everywhere diagnoses are created or edited in the app.
 */
export const DIAGNOSIS_STATUS_OPTIONS = [
  { value: 'Suspected', label: '🟡 Suspected', color: '#fef3c7', text: '#92400e' },
  { value: 'Confirmed', label: '🟢 Confirmed', color: '#d1fae5', text: '#065f46' },
  { value: 'Ruled Out', label: '🔴 Ruled out', color: '#fee2e2', text: '#991b1b' },
  { value: 'Resolved', label: '⚪ Resolved', color: '#f3f4f6', text: '#374151' },
] as const

export type DiagnosisDirectoryStatus = (typeof DIAGNOSIS_STATUS_OPTIONS)[number]['value']

const ALLOWED = new Set<string>(DIAGNOSIS_STATUS_OPTIONS.map((o) => o.value))

/** Map model output to a valid directory status; unknown → Suspected. */
export function normalizeDiagnosisDirectoryStatus (raw: string): DiagnosisDirectoryStatus {
  const t = raw.trim()
  if (ALLOWED.has(t)) return t as DiagnosisDirectoryStatus
  const lower = t.toLowerCase()
  if (lower === 'suspected' || lower === 'possible' || lower === 'pending') return 'Suspected'
  if (lower === 'confirmed' || lower === 'definite') return 'Confirmed'
  if (lower.includes('ruled') || lower === 'excluded') return 'Ruled Out'
  if (lower === 'resolved' || lower === 'inactive') return 'Resolved'
  return 'Suspected'
}

export function diagnosisStatusLabel (value: string): string {
  const o = DIAGNOSIS_STATUS_OPTIONS.find((x) => x.value === value)
  return o?.label ?? value
}

/** Last row wins per case-insensitive diagnosis name. */
export function dedupeDiagnosisRows (
  rows: { diagnosis: string; status: DiagnosisDirectoryStatus }[],
): { diagnosis: string; status: DiagnosisDirectoryStatus }[] {
  const map = new Map<string, { diagnosis: string; status: DiagnosisDirectoryStatus }>()
  for (const r of rows) {
    const name = r.diagnosis.trim()
    if (!name) continue
    const key = name.toLowerCase()
    map.set(key, { diagnosis: name, status: r.status })
  }
  return [...map.values()]
}
