export const DOCTOR_NOTE_DRAFT_KEY = 'mb-doctor-note-draft-v1'

export type DoctorNoteDraftV1 = {
  v: 1
  userId: string
  doctorId: string
  body: string
}

export function loadDoctorNoteDraft (userId: string): DoctorNoteDraftV1 | null {
  try {
    const raw = localStorage.getItem(DOCTOR_NOTE_DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as DoctorNoteDraftV1
    if (d?.v !== 1 || d.userId !== userId) return null
    return d
  } catch {
    return null
  }
}

export function saveDoctorNoteDraft (draft: DoctorNoteDraftV1) {
  try {
    localStorage.setItem(DOCTOR_NOTE_DRAFT_KEY, JSON.stringify(draft))
  } catch { /* ignore */ }
}

export function clearDoctorNoteDraft () {
  try {
    localStorage.removeItem(DOCTOR_NOTE_DRAFT_KEY)
  } catch { /* ignore */ }
}
