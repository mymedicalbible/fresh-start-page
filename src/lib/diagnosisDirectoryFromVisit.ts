import type { SupabaseClient } from '@supabase/supabase-js'
import type { DiagnosisDirectoryStatus } from './diagnosisStatusOptions'

/**
 * Upserts rows into `diagnoses_directory` from a completed visit log.
 * Matches existing rows by case-insensitive diagnosis name (same idea as doctor profile notes).
 */
export async function upsertDiagnosesFromVisit (
  supabase: SupabaseClient,
  userId: string,
  doctorName: string,
  visitDate: string,
  rows: { diagnosis: string; status: DiagnosisDirectoryStatus }[],
): Promise<void> {
  for (const row of rows) {
    const name = row.diagnosis.trim()
    if (!name) continue

    const { data: existing, error: selErr } = await supabase
      .from('diagnoses_directory')
      .select('id, doctor')
      .eq('user_id', userId)
      .ilike('diagnosis', name)
      .limit(1)

    if (selErr) {
      console.warn('diagnoses_directory select:', selErr.message)
      continue
    }

    if (!existing?.length) {
      const { error: insErr } = await supabase.from('diagnoses_directory').insert({
        user_id: userId,
        diagnosis: name,
        doctor: doctorName,
        date_diagnosed: visitDate,
        status: row.status,
      })
      if (insErr) console.warn('diagnoses_directory insert:', insErr.message)
    } else {
      const patch: Record<string, unknown> = {
        status: row.status,
        date_diagnosed: visitDate,
      }
      if (!existing[0].doctor) patch.doctor = doctorName
      const { error: upErr } = await supabase
        .from('diagnoses_directory')
        .update(patch)
        .eq('id', existing[0].id)
      if (upErr) console.warn('diagnoses_directory update:', upErr.message)
    }
  }
}
