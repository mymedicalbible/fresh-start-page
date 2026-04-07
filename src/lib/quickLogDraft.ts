import type { PainAreaSelection } from './parse'

export const QUICK_LOG_DRAFT_KEY = 'mb-quicklog-draft-v1'

export type QuickLogDraftV1 = {
  v: 1
  userId: string
  screen: 'visit' | 'pain' | 'symptoms' | 'questions'
  painStep: number
  form: {
    date: string
    time: string
    doctor: string
    doctor_specialty: string
    intensity: number
    notes: string
    activity: string
    severity: string
    relief: string
    question: string
    priority: string
  }
  selectedSymptoms: string[]
  newSymptomText: string
  painSelections: PainAreaSelection[]
  painTypePicks: string[]
}

export function loadQuickLogDraft (userId: string): QuickLogDraftV1 | null {
  try {
    const raw = localStorage.getItem(QUICK_LOG_DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as QuickLogDraftV1
    if (d?.v !== 1 || d.userId !== userId) return null
    return d
  } catch {
    return null
  }
}

export function saveQuickLogDraft (draft: QuickLogDraftV1) {
  try {
    localStorage.setItem(QUICK_LOG_DRAFT_KEY, JSON.stringify(draft))
  } catch { /* ignore */ }
}

export function clearQuickLogDraft () {
  try {
    localStorage.removeItem(QUICK_LOG_DRAFT_KEY)
  } catch { /* ignore */ }
}
