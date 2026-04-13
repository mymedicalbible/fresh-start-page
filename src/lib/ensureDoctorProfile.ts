import { supabase } from './supabase'

function mergeDoctorNotes (existing: string | null | undefined, addition: string): string {
  const ex = (existing ?? '').trim()
  const add = addition.trim()
  if (!add) return ex
  if (ex.includes(add)) return ex
  return ex ? `${ex}\n\n${add}` : add
}

/**
 * Ensure a `doctors` row exists for this user when any log references a provider by name.
 * - If found by case-insensitive name match: optionally back-fills an empty specialty.
 * - If not found: inserts a new row silently.
 * - Optional `notesAppend`: merged into `notes` (skips if that exact text is already present).
 * Never throws — logs errors to console so callers don't need to handle them.
 */
export async function ensureDoctorProfile (
  userId: string,
  name: string,
  specialty?: string | null,
  notesAppend?: string | null,
): Promise<void> {
  const trimmed = name?.trim()
  if (!trimmed) return

  const { data: existing, error: selErr } = await supabase
    .from('doctors')
    .select('id, specialty, notes')
    .eq('user_id', userId)
    .ilike('name', trimmed)
    .maybeSingle()

  if (selErr) {
    console.warn('ensureDoctorProfile select error:', selErr.message)
    return
  }

  const spec = specialty?.trim() || null
  const noteAdd = notesAppend?.trim() || null

  if (existing?.id) {
    const patch: Record<string, unknown> = {}
    if (spec && !(existing.specialty && String(existing.specialty).trim())) {
      patch.specialty = spec
    }
    if (noteAdd) {
      const merged = mergeDoctorNotes(
        (existing as { notes?: string | null }).notes,
        noteAdd,
      )
      const prev = String((existing as { notes?: string | null }).notes ?? '').trim()
      if (merged !== prev) patch.notes = merged
    }
    if (Object.keys(patch).length > 0) {
      const { error: upErr } = await supabase
        .from('doctors')
        .update(patch)
        .eq('id', existing.id)
      if (upErr) console.warn('ensureDoctorProfile update error:', upErr.message)
    }
    return
  }

  const { error: insErr } = await supabase.from('doctors').insert({
    user_id: userId,
    name: trimmed,
    specialty: spec,
    notes: noteAdd || null,
  })
  if (insErr) console.warn('ensureDoctorProfile insert error:', insErr.message)
}
