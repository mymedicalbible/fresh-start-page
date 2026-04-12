import type { ExtractedVisitFields } from './transcriptExtract'

/** Human-readable summary from model-extracted fields (for visit notes + archive). */
export function formatExtractedClinicalSummary (f: ExtractedVisitFields): string {
  const blocks: string[] = []
  if (f.reason_for_visit?.trim()) blocks.push(`Reason for visit\n${f.reason_for_visit.trim()}`)
  if (f.findings?.trim()) blocks.push(`Findings\n${f.findings.trim()}`)
  if (f.instructions?.trim()) blocks.push(`Instructions\n${f.instructions.trim()}`)
  if (f.notes?.trim()) blocks.push(`Other notes\n${f.notes.trim()}`)
  const tests = (f.tests ?? []).filter((t) => t.test_name?.trim())
  if (tests.length) {
    blocks.push(
      `Tests discussed\n${tests.map((t) => `• ${t.test_name.trim()}${t.reason?.trim() ? ` — ${t.reason.trim()}` : ''}`).join('\n')}`,
    )
  }
  const meds = (f.medications ?? []).filter((m) => m.medication?.trim())
  if (meds.length) {
    blocks.push(
      `Medications mentioned\n${meds.map((m) =>
        `• ${m.medication.trim()}${m.dose?.trim() ? ` ${m.dose.trim()}` : ''}${m.frequency?.trim() ? `, ${m.frequency.trim()}` : ''}`,
      ).join('\n')}`,
    )
  }
  if (f.follow_up_date?.trim() || f.follow_up_time?.trim()) {
    const bits = [f.follow_up_date?.trim(), f.follow_up_time?.trim()].filter(Boolean)
    if (bits.length) blocks.push(`Follow-up\n${bits.join(' · ')}`)
  }
  if (f.summary?.length) {
    const lines = f.summary
      .filter((s) => s.field?.trim() || s.value?.trim())
      .map((s) => `• ${s.field?.trim() ?? ''}${s.value?.trim() ? `: ${s.value.trim()}` : ''}${s.destination?.trim() ? ` → ${s.destination.trim()}` : ''}`)
    if (lines.length) blocks.push(`Summary\n${lines.join('\n')}`)
  }
  return blocks.join('\n\n')
}

/** Marker between clinical notes and appended raw transcript (must stay in sync with merge/split). */
export const RAW_TRANSCRIPT_APPENDIX_HEADER = '— Raw transcript (reference) —'

/** Combine free-text notes with optional raw transcript appendix (reference only). */
export function mergeNotesWithTranscriptAppendix (clinicalNotes: string, rawTranscript: string): string {
  const clinical = clinicalNotes.trim()
  const raw = rawTranscript.trim()
  if (!raw) return clinical
  const appendix = `${RAW_TRANSCRIPT_APPENDIX_HEADER}\n${raw}`
  return clinical ? `${clinical}\n\n${appendix}` : appendix
}

/** Split stored notes into clinical text vs raw transcript appendix (if present). */
export function splitNotesAndRawTranscriptAppendix (notes: string | null): { clinical: string; rawTranscript: string | null } {
  if (!notes?.trim()) return { clinical: '', rawTranscript: null }
  const idx = notes.indexOf(RAW_TRANSCRIPT_APPENDIX_HEADER)
  if (idx === -1) return { clinical: notes.trim(), rawTranscript: null }
  const clinical = notes.slice(0, idx).trim()
  const raw = notes.slice(idx + RAW_TRANSCRIPT_APPENDIX_HEADER.length).replace(/^\n+/, '').trim()
  return { clinical, rawTranscript: raw || null }
}

/** Lines for the visit notes field (model “notes” + extra meds; findings/instructions stay in their own fields). */
export function buildClinicalNotesSupplement (f: ExtractedVisitFields): string {
  const parts: string[] = []
  if (f.notes?.trim()) parts.push(f.notes.trim())
  const meds = f.medications ?? []
  if (meds.length > 1) {
    const rest = meds.slice(1).filter((m) => m.medication?.trim())
    if (rest.length) {
      const extra = rest
        .map((m) =>
          `${m.medication.trim()}${m.dose ? ` ${m.dose}` : ''}${m.frequency ? ` — ${m.frequency}` : ''}`,
        )
        .join('; ')
      parts.push(`Additional medications (from transcript): ${extra}`)
    }
  }
  return parts.join('\n\n')
}
