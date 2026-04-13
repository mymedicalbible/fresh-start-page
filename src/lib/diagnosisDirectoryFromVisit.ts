import type { SupabaseClient } from '@supabase/supabase-js'
import {
  diagnosisDetailFieldsForStatus,
  type DiagnosisDirectoryDetailFields,
} from './diagnosisDirectoryRow'
import { escapePostgresRegexLiteral } from './pgRegex'

function mergeDbText (existing: string | null | undefined, incoming: string | null): string | null {
  if (incoming !== null && incoming.trim() !== '') return incoming
  return existing ?? null
}

/**
 * Upserts rows into `diagnoses_directory` from a completed visit log.
 * Matches existing rows by case-insensitive diagnosis name (same idea as doctor profile notes).
 * Text fields merge: visit values fill empty DB fields without overwriting existing long notes.
 */
export async function upsertDiagnosesFromVisit (
  supabase: SupabaseClient,
  userId: string,
  doctorName: string,
  visitDate: string,
  rows: DiagnosisDirectoryDetailFields[],
): Promise<string | null> {
  let firstErr: string | null = null
  for (const row of rows) {
    const name = row.diagnosis.trim()
    if (!name) continue

    const detail = diagnosisDetailFieldsForStatus(row.status, row)
    const nameExact = `^${escapePostgresRegexLiteral(name)}$`

    const { data: existing, error: selErr } = await supabase
      .from('diagnoses_directory')
      .select('id, doctor, how_or_why, treatment_plan, care_plan')
      .eq('user_id', userId)
      .regexIMatch('diagnosis', nameExact)
      .limit(1)

    if (selErr) {
      if (!firstErr) firstErr = selErr.message
      continue
    }

    if (!existing?.length) {
      const { error: insErr } = await supabase.from('diagnoses_directory').insert({
        user_id: userId,
        diagnosis: name,
        doctor: doctorName,
        date_diagnosed: visitDate,
        status: row.status,
        how_or_why: detail.how_or_why,
        treatment_plan: detail.treatment_plan,
        care_plan: detail.care_plan,
      })
      if (insErr && !firstErr) firstErr = insErr.message
    } else {
      const ex = existing[0] as {
        id: string
        doctor: string | null
        how_or_why: string | null
        treatment_plan: string | null
        care_plan: string | null
      }
      const patch: Record<string, unknown> = {
        status: row.status,
        date_diagnosed: visitDate,
        how_or_why: mergeDbText(ex.how_or_why, detail.how_or_why),
        treatment_plan: mergeDbText(ex.treatment_plan, detail.treatment_plan),
        care_plan: mergeDbText(ex.care_plan, detail.care_plan),
      }
      if (!ex.doctor) patch.doctor = doctorName
      const { error: upErr } = await supabase
        .from('diagnoses_directory')
        .update(patch)
        .eq('id', ex.id)
      if (upErr && !firstErr) firstErr = upErr.message
    }
  }
  return firstErr
}
