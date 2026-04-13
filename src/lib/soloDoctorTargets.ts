import { normDoctorKey } from './doctorNameNorm'
import type { ExtractedSoloFields } from './soloTranscriptExtract'

/** Skip team labels and placeholders — do not create `doctors` rows for these. */
export function isGenericDoctorPlaceholder (name: string): boolean {
  const t = normDoctorKey(name)
  if (!t || t.length < 2) return true
  const generic = new Set([
    'your care team', 'care team', 'the doctor', 'my doctor', 'a doctor', 'doctor',
    'primary care', 'pcp', 'nurse', 'staff', 'tbd', 'unknown', 'your team', 'team',
    'general', 'specialist', 'clinic', 'hospital', 'urgent care',
  ])
  if (generic.has(t)) return true
  if (/^your care\b/.test(t)) return true
  if (/^no doctor\b/.test(t)) return true
  return false
}

export type SoloDoctorTarget = {
  name: string
  specialty: string | null
  profile_note: string | null
}

/**
 * Dedupe by normalized name. Prefer structured `doctors_mentioned` rows, then merge
 * names from questions and tests (ordering doctor).
 */
export function collectSoloDoctorTargets (fields: ExtractedSoloFields): SoloDoctorTarget[] {
  const map = new Map<string, SoloDoctorTarget>()

  function upsert (displayName: string, specialty?: string | null, profile_note?: string | null) {
    const t = normDoctorKey(displayName)
    if (!t || isGenericDoctorPlaceholder(displayName)) return
    const spec = specialty?.trim() || null
    const note = profile_note?.trim() || null
    const prev = map.get(t)
    const display = displayName.trim()
    if (!prev) {
      map.set(t, { name: display, specialty: spec, profile_note: note })
    } else {
      if (!prev.specialty && spec) prev.specialty = spec
      if (note) {
        prev.profile_note = prev.profile_note
          ? (prev.profile_note.includes(note) ? prev.profile_note : `${prev.profile_note}\n${note}`)
          : note
      }
    }
  }

  for (const d of fields.doctors_mentioned ?? []) {
    if (d.name?.trim()) upsert(d.name, d.specialty ?? null, d.profile_note ?? null)
  }
  for (const q of fields.questions ?? []) {
    if (q.doctor?.trim()) upsert(q.doctor, null, null)
  }
  for (const t of fields.tests ?? []) {
    const dn = t.doctor_name?.trim()
    if (dn) upsert(dn, null, null)
  }
  return [...map.values()]
}
