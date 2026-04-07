import { supabase } from './supabase'

/** Bucket path prefix for files tied to a `doctor_visits` row (matches tests: `…/tests/:id`). */
export function visitDocumentsFolder (userId: string, visitId: string) {
  return `${userId}/visits/${visitId}`
}

export function uniqueVisitDocFileName (file: File, visitId: string, salt: number) {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : String(Math.random()).slice(2, 10)
  const safe = file.name.replace(/[^\w.\-]+/g, '_').replace(/\s+/g, '-').slice(0, 120)
  const tid = visitId.replace(/-/g, '').slice(0, 12)
  return `${tid}-${salt}-${Date.now()}-${rand}-${safe}`
}

export type VisitDocItem = { name: string; signedUrl: string }

export async function listVisitDocuments (userId: string, visitId: string): Promise<{ error: string | null; docs: VisitDocItem[] }> {
  const folder = visitDocumentsFolder(userId, visitId)
  const { data, error } = await supabase.storage.from('visit-docs').list(folder, { limit: 80 })
  if (error) return { error: error.message, docs: [] }
  const files = data ?? []
  if (files.length === 0) return { error: null, docs: [] }
  const docs = await Promise.all(
    files.map(async (f) => {
      const path = `${folder}/${f.name}`
      const { data: sd, error: signErr } = await supabase.storage.from('visit-docs').createSignedUrl(path, 3600)
      if (signErr) return { name: f.name, signedUrl: '' }
      return { name: f.name, signedUrl: sd?.signedUrl ?? '' }
    }),
  )
  return { error: null, docs }
}

export async function uploadVisitDocument (userId: string, visitId: string, file: File, salt: number) {
  const folder = visitDocumentsFolder(userId, visitId)
  const safeName = uniqueVisitDocFileName(file, visitId, salt)
  return supabase.storage.from('visit-docs').upload(`${folder}/${safeName}`, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })
}

export async function deleteVisitDocument (userId: string, visitId: string, fileName: string) {
  const folder = visitDocumentsFolder(userId, visitId)
  return supabase.storage.from('visit-docs').remove([`${folder}/${fileName}`])
}
