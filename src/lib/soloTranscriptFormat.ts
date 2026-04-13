import type { ExtractedSoloFields } from './soloTranscriptExtract'
import { diagnosisStatusLabel } from './diagnosisStatusOptions'

/** Human-readable summary for solo extract (archive + confirmation). */
export function formatSoloExtractSummary (f: ExtractedSoloFields): string {
  const blocks: string[] = []
  if (f.narrative_summary?.trim()) {
    blocks.push(`Summary\n${f.narrative_summary.trim()}`)
  }
  const docs = (f.doctors_mentioned ?? []).filter((d) => d.name?.trim())
  if (docs.length) {
    blocks.push(
      `Doctors\n${docs.map((d) =>
        `• ${d.name.trim()}${d.specialty?.trim() ? ` — ${d.specialty.trim()}` : ''}${d.profile_note?.trim() ? ` (${d.profile_note.trim()})` : ''}`,
      ).join('\n')}`,
    )
  }
  const qs = (f.questions ?? []).filter((q) => q.question?.trim())
  if (qs.length) {
    blocks.push(
      `Questions for your doctors\n${qs.map((q) =>
        `• ${q.question.trim()} → ${q.doctor.trim()} (${q.priority})`,
      ).join('\n')}`,
    )
  }
  const meds = (f.medications ?? []).filter((m) => m.medication?.trim())
  if (meds.length) {
    blocks.push(
      `Medications\n${meds.map((m) =>
        `• ${m.medication.trim()} [${m.change}]${m.dose?.trim() ? ` ${m.dose.trim()}` : ''}${m.frequency?.trim() ? `, ${m.frequency.trim()}` : ''}`,
      ).join('\n')}`,
    )
  }
  const diags = (f.diagnoses ?? []).filter((d) => d.diagnosis?.trim())
  if (diags.length) {
    blocks.push(
      `Diagnoses\n${diags.map((d) =>
        `• ${d.diagnosis.trim()} — ${diagnosisStatusLabel(d.status)}`,
      ).join('\n')}`,
    )
  }
  const tests = (f.tests ?? []).filter((t) => t.test_name?.trim())
  if (tests.length) {
    blocks.push(
      `Tests\n${tests.map((t) =>
        `• ${t.test_name.trim()}${t.doctor_name?.trim() ? ` (${t.doctor_name.trim()})` : ''}${t.reason?.trim() ? ` — ${t.reason.trim()}` : ''}`,
      ).join('\n')}`,
    )
  }
  return blocks.join('\n\n')
}
