export const APPT_QS_DRAFT_KEY = 'mb-appt-openqs-draft-v1'

export type ApptQsDraftV1 = {
  v: 1
  userId: string
  doctor: string
  answerDrafts: Record<string, string>
}

export function loadApptQsDraft (userId: string, doctor: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(APPT_QS_DRAFT_KEY)
    if (!raw) return {}
    const d = JSON.parse(raw) as ApptQsDraftV1
    if (d?.v !== 1 || d.userId !== userId || d.doctor !== doctor) return {}
    return d.answerDrafts ?? {}
  } catch {
    return {}
  }
}

export function saveApptQsDraft (draft: ApptQsDraftV1) {
  try {
    localStorage.setItem(APPT_QS_DRAFT_KEY, JSON.stringify(draft))
  } catch { /* ignore */ }
}

export function clearApptQsDraft () {
  try {
    localStorage.removeItem(APPT_QS_DRAFT_KEY)
  } catch { /* ignore */ }
}
