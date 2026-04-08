/**
 * Stable key for matching doctor display names (dashboard, visits list, appointments).
 * Keep in sync everywhere we compare `doctors.name`, `doctor_visits.doctor`, `appointments.doctor`.
 */
export function normDoctorKey (name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/^dr\.?\s+/i, '')
    .replace(/[.,]+$/g, '')
    .replace(/\s+/g, ' ')
}
