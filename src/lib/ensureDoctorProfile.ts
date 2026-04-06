import { supabase } from './supabase'

/**
 * Ensure a `doctors` row exists for this user when any log references a provider by name.
 * - If found by case-insensitive name match: optionally back-fills an empty specialty.
 * - If not found: inserts a new row silently.
 * Never throws — logs errors to console so callers don't need to handle them.
 */
export async function ensureDoctorProfile (
  userId: string,
  name: string,
  specialty?: string | null,
): Promise<void> {
  const trimmed = name?.trim()
  if (!trimmed) return

  const { data: existing, error: selErr } = await supabase
    .from('doctors')
    .select('id, specialty')
    .eq('user_id', userId)
    .ilike('name', trimmed)
    .maybeSingle()

  if (selErr) {
    console.warn('ensureDoctorProfile select error:', selErr.message)
    return
  }

  const spec = specialty?.trim() || null

  if (existing?.id) {
    // Back-fill specialty only if it was previously empty
    if (spec && !(existing.specialty && String(existing.specialty).trim())) {
      const { error: upErr } = await supabase
        .from('doctors')
        .update({ specialty: spec })
        .eq('id', existing.id)
      if (upErr) console.warn('ensureDoctorProfile update specialty error:', upErr.message)
    }
    return
  }

  const { error: insErr } = await supabase.from('doctors').insert({
    user_id: userId,
    name: trimmed,
    specialty: spec,
  })
  if (insErr) console.warn('ensureDoctorProfile insert error:', insErr.message)
}
