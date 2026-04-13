import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExtractedSoloFields } from './soloTranscriptExtract'
import { upsertDiagnosesFromVisit } from './diagnosisDirectoryFromVisit'
import { splitDoseFrequencyFromCombined } from './medDoseParse'
import { ensureDoctorProfile } from './ensureDoctorProfile'
import { collectSoloDoctorTargets, isGenericDoctorPlaceholder } from './soloDoctorTargets'

/** Stored on tests_ordered / diagnoses when applying a solo extract (not a named clinician). */
export const SOLO_RECORD_SOURCE_LABEL = 'Solo recording'

export type ApplySoloOutcome =
  | { ok: true }
  | { ok: false; message: string }

export async function applySoloExtractToDatabase (
  supabase: SupabaseClient,
  userId: string,
  fields: ExtractedSoloFields,
  { anchorDateIso }: { anchorDateIso: string },
): Promise<ApplySoloOutcome> {
  const dateStr = anchorDateIso.trim() || new Date().toISOString().slice(0, 10)
  const errors: string[] = []

  const doctorTargets = collectSoloDoctorTargets(fields)
  for (const row of doctorTargets) {
    const note = row.profile_note
      ? `From solo voice update (${dateStr}): ${row.profile_note}`
      : null
    await ensureDoctorProfile(userId, row.name, row.specialty, note)
  }

  const questions = (fields.questions ?? []).filter((q) => q.question.trim())
  if (questions.length > 0) {
    const rows = questions.map((q) => ({
      user_id: userId,
      date_created: dateStr,
      appointment_date: null as string | null,
      doctor: q.doctor.trim() || 'Your care team',
      question: q.question.trim(),
      priority: q.priority.trim() || 'Medium',
      status: 'Unanswered' as const,
      answer: null as string | null,
    }))
    const { error: qe } = await supabase.from('doctor_questions').insert(rows)
    if (qe) errors.push(`Questions: ${qe.message}`)
  }

  for (const m of fields.medications ?? []) {
    const name = m.medication.trim()
    if (!name) continue
    if (m.change === 'stop') {
      const { error: de } = await supabase
        .from('current_medications')
        .delete()
        .eq('user_id', userId)
        .ilike('medication', name)
      if (de) errors.push(`Medication remove "${name}": ${de.message}`)
      continue
    }
    const { dose, frequency: freqFromDose } = splitDoseFrequencyFromCombined(m.dose)
    const frequency = m.frequency.trim() ? m.frequency.trim() : freqFromDose
    const { error: ue } = await supabase.from('current_medications').upsert({
      user_id: userId,
      medication: name,
      dose,
      frequency,
      notes: `Updated from ${SOLO_RECORD_SOURCE_LABEL}`,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,medication' })
    if (ue) errors.push(`Medication "${name}": ${ue.message}`)
  }

  const validDiags = (fields.diagnoses ?? []).filter((d) => d.diagnosis?.trim())
  if (validDiags.length > 0) {
    try {
      await upsertDiagnosesFromVisit(supabase, userId, SOLO_RECORD_SOURCE_LABEL, dateStr, validDiags)
    } catch (e) {
      errors.push(`Diagnoses: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const validTests = (fields.tests ?? []).filter((t) => t.test_name?.trim())
  if (validTests.length > 0) {
    const { error: te } = await supabase.from('tests_ordered').insert(
      validTests.map((t) => {
        const named = t.doctor_name?.trim()
        const doctorCol = named && !isGenericDoctorPlaceholder(named)
          ? named
          : SOLO_RECORD_SOURCE_LABEL
        return {
          user_id: userId,
          test_date: dateStr,
          doctor: doctorCol,
          test_name: t.test_name.trim(),
          reason: t.reason?.trim() || null,
          status: 'Pending',
        }
      }),
    )
    if (te) errors.push(`Tests: ${te.message}`)
  }

  if (errors.length > 0) {
    return { ok: false, message: errors.join(' ') }
  }
  return { ok: true }
}
