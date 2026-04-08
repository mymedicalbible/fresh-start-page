export const VISIT_WIZARD_DRAFT_KEY = 'mb-visit-wizard-draft-v1'

export type VisitWizardDraftV1 = {
  v: 1
  userId: string
  step: 1 | 2 | 3
  visitId: string | null
  visitDate: string
  visitTime: string
  doctorMode: 'pick' | 'new'
  selectedName: string
  newDoctorName: string
  specialty: string
  reason: string
  questionLines: { text: string; priority: string }[]
  dvTests: { test_name: string; reason: string }[]
  dvMeds: { medication: string; dose: string; action: 'keep' | 'remove' }[]
  newMedEntry: { medication: string; dose: string; frequency: string; prn?: boolean }
  findings: string
  instructions: string
  notes: string
  nextApptDate: string
  nextApptTime: string
  nextApptEndTime: string
}

export function loadVisitWizardDraft (userId: string): VisitWizardDraftV1 | null {
  try {
    const raw = localStorage.getItem(VISIT_WIZARD_DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as VisitWizardDraftV1
    if (d?.v !== 1 || d.userId !== userId) return null
    return d
  } catch {
    return null
  }
}

export function saveVisitWizardDraft (draft: VisitWizardDraftV1) {
  try {
    localStorage.setItem(VISIT_WIZARD_DRAFT_KEY, JSON.stringify(draft))
  } catch { /* ignore */ }
}

export function clearVisitWizardDraft () {
  try {
    localStorage.removeItem(VISIT_WIZARD_DRAFT_KEY)
  } catch { /* ignore */ }
}
