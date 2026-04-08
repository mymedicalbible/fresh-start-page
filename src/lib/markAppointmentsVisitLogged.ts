import type { SupabaseClient } from '@supabase/supabase-js'
import { normDoctorKey } from './doctorNameNorm'

/**
 * After logging a completed visit on `visitDate` with this doctor, mark matching
 * `appointments` rows (same user, date, normalized doctor) as `visit_logged`.
 */
export async function markAppointmentsVisitLoggedForVisitDay (
  supabase: SupabaseClient,
  userId: string,
  visitDate: string,
  doctorDisplayName: string,
): Promise<void> {
  const docKey = normDoctorKey(doctorDisplayName)
  const { data: apptRows, error: apptListErr } = await supabase
    .from('appointments')
    .select('id, doctor')
    .eq('user_id', userId)
    .eq('appointment_date', visitDate)
  if (apptListErr) {
    console.warn('appointments list for visit_logged:', apptListErr.message)
    return
  }
  const ids = (apptRows ?? [])
    .filter((r) => r.doctor && normDoctorKey(r.doctor) === docKey)
    .map((r) => r.id)
  if (ids.length === 0) return
  const { error: markErr } = await supabase
    .from('appointments')
    .update({ visit_logged: true })
    .in('id', ids)
  if (markErr) console.warn('appointments visit_logged:', markErr.message)
}
