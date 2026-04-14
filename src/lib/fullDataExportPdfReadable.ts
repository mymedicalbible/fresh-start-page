/**
 * Human-readable sections for the data-export PDF (paragraph + bullets/blocks).
 * Full rows remain in the JSON download.
 */

import type { ArchivedHandoffSummary } from './summaryArchive'
import type { ArchivedTranscript } from './transcriptArchive'

/** Subset of full export payload (avoids circular import with fullDataExport.ts). */
export type ExportPayloadReadable = {
  supabase: {
    pain_entries: unknown[]
    mcas_symptom_logs: unknown[]
    symptom_logs: unknown[]
    doctors: unknown[]
    doctor_visits: unknown[]
    doctor_questions: unknown[]
    doctor_profile_notes: unknown[]
    current_medications: unknown[]
    medications_archive: unknown[]
    medication_change_events: unknown[]
    tests_ordered: unknown[]
    diagnoses_directory: unknown[]
    diagnosis_notes: unknown[]
    appointments: unknown[]
    user_plushie_unlocks: unknown[]
  }
  local: {
    summaryArchive: ArchivedHandoffSummary[]
    transcriptArchive: ArchivedTranscript[]
  }
}

export type ReadableExportPdfSection = {
  title: string
  /** One short intro paragraph for skimming */
  paragraph: string
  /** Tight bullet lines */
  bullets: string[]
  /** Longer snippets (indented in PDF) — e.g. visit notes, transcript excerpts */
  blocks?: { heading: string; body: string }[]
}

const MAX_BULLETS = 28
const CLIP = 140

function clip (s: string | null | undefined, n = CLIP): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim()
  if (t.length <= n) return t
  return `${t.slice(0, n - 1)}…`
}

function str (v: unknown): string {
  if (v == null) return ''
  return String(v)
}

function fmtIsoDate (v: unknown): string {
  const s = str(v)
  if (!s) return '—'
  return s.slice(0, 10)
}

function row (r: Record<string, unknown>): Record<string, unknown> {
  return r
}

export function buildReadableExportPdfSections (payload: ExportPayloadReadable): ReadableExportPdfSection[] {
  const s = payload.supabase
  return [
    formatPainEntries(s.pain_entries as Record<string, unknown>[]),
    formatMcasSymptomLogs(s.mcas_symptom_logs as Record<string, unknown>[]),
    formatSymptomLogs(s.symptom_logs as Record<string, unknown>[]),
    formatDoctors(s.doctors as Record<string, unknown>[]),
    formatVisits(s.doctor_visits as Record<string, unknown>[]),
    formatQuestions(s.doctor_questions as Record<string, unknown>[]),
    formatProfileNotes(s.doctor_profile_notes as Record<string, unknown>[]),
    formatCurrentMeds(s.current_medications as Record<string, unknown>[]),
    formatMedsArchive(s.medications_archive as Record<string, unknown>[]),
    formatMedChangeEvents(s.medication_change_events as Record<string, unknown>[]),
    formatTests(s.tests_ordered as Record<string, unknown>[]),
    formatDiagnoses(s.diagnoses_directory as Record<string, unknown>[]),
    formatDiagnosisNotes(s.diagnosis_notes as Record<string, unknown>[]),
    formatAppointments(s.appointments as Record<string, unknown>[]),
    formatPlushieUnlocks(s.user_plushie_unlocks as Record<string, unknown>[]),
    formatSummaryArchive(payload.local.summaryArchive),
    formatTranscriptArchive(payload.local.transcriptArchive),
  ]
}

function formatPainEntries (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const dates = rows.map((r) => str(r.entry_date)).filter(Boolean).sort()
  const earliest = dates[0] ?? ''
  const latest = dates[dates.length - 1] ?? ''
  const nums = rows.map((r) => r.intensity).filter((x): x is number => typeof x === 'number')
  const avg = nums.length
    ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
    : null

  let paragraph = n === 0
    ? 'No pain entries are stored in this export.'
    : `This section lists ${n} pain log${n === 1 ? '' : 's'}`
  if (n > 0 && earliest && latest) {
    paragraph += earliest === latest
      ? ` from ${earliest}.`
      : ` from ${earliest} through ${latest}.`
  } else if (n > 0) {
    paragraph += '.'
  }
  if (avg != null && n > 0) paragraph += ` Average intensity across logged values is ${avg} out of 10.`

  const sorted = [...rows].sort((a, b) => str(b.entry_date).localeCompare(str(a.entry_date)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const d = fmtIsoDate(r.entry_date)
    const loc = clip(r.location as string | null, 48)
    const inten = r.intensity != null ? `${r.intensity}/10` : '—'
    const ptype = clip(r.pain_type as string | null, 40)
    bullets.push(`${d} · ${loc || '—'} · ${inten}${ptype ? ` · ${ptype}` : ''}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  const blocks: { heading: string; body: string }[] = []
  for (let i = 0; i < Math.min(sorted.length, 8); i++) {
    const r = row(sorted[i]!)
    const note = str(r.notes)
    if (note.length > 20) {
      blocks.push({
        heading: `${fmtIsoDate(r.entry_date)} — notes`,
        body: clip(note, 520),
      })
    }
  }

  return {
    title: 'Pain logs',
    paragraph,
    bullets: bullets.length ? bullets : ['—'],
    blocks: blocks.length ? blocks : undefined,
  }
}

function formatMcasSymptomLogs (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const dates = rows.map((r) => str(r.symptom_date)).filter(Boolean).sort()
  const earliest = dates[0] ?? ''
  const latest = dates[dates.length - 1] ?? ''

  let paragraph = n === 0
    ? 'No MCAS symptom logs are stored in this export.'
    : `${n} symptom log${n === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} recorded`
  if (n > 0 && earliest && latest) {
    paragraph += earliest === latest ? ` on ${earliest}.` : ` from ${earliest} to ${latest}.`
  } else if (n > 0) paragraph += '.'

  const sorted = [...rows].sort((a, b) => str(b.symptom_date).localeCompare(str(a.symptom_date)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const d = fmtIsoDate(r.symptom_date)
    const sev = clip(r.severity as string | null, 36)
    const sym = clip(r.symptoms as string | null, 56)
    bullets.push(`${d}${sev ? ` · ${sev}` : ''}${sym ? ` · ${sym}` : ''}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return {
    title: 'Symptom logs (MCAS)',
    paragraph,
    bullets: bullets.length ? bullets : ['—'],
  }
}

function formatSymptomLogs (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No quick symptom tracker snapshots are stored.'
    : `${n} structured symptom snapshot${n === 1 ? '' : 's'} from the symptom tracker (separate from MCAS symptom logs).`

  const sorted = [...rows].sort((a, b) => str(b.logged_at).localeCompare(str(a.logged_at)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const t = str(r.logged_at).slice(0, 16).replace('T', ' ')
    const act = clip(r.activity_last_4h as string | null, 48)
    const syms = Array.isArray(r.symptoms) ? (r.symptoms as string[]).slice(0, 6).join(', ') : ''
    bullets.push(`${t} · ${syms || '—'}${act ? ` · ${act}` : ''}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return {
    title: 'Symptom tracker snapshots',
    paragraph,
    bullets: bullets.length ? bullets : ['—'],
  }
}

function formatDoctors (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No doctor profiles are stored.'
    : `${n} doctor profile${n === 1 ? '' : 's'} on file.`

  const bullets = rows.slice(0, MAX_BULLETS).map((raw) => {
    const r = row(raw)
    const name = clip(r.name as string | null, 48)
    const spec = clip(r.specialty as string | null, 36)
    const arch = r.archived_at ? ' (archived)' : ''
    return `${name || '—'}${spec ? ` · ${spec}` : ''}${arch}`
  })
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return { title: 'Doctors', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatVisits (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No visit records are stored.'
    : `${n} doctor visit${n === 1 ? '' : 's'} logged. Each block below can hold longer notes.`

  const sorted = [...rows].sort((a, b) => str(b.visit_date).localeCompare(str(a.visit_date)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const d = fmtIsoDate(r.visit_date)
    const doc = clip(r.doctor as string | null, 40)
    const reason = clip(r.reason as string | null, 56)
    bullets.push(`${d} · ${doc || '—'}${reason ? ` · ${reason}` : ''}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  const blocks: { heading: string; body: string }[] = []
  for (let i = 0; i < Math.min(sorted.length, 12); i++) {
    const r = row(sorted[i]!)
    const notes = [str(r.notes), str(r.findings), str(r.instructions), str(r.follow_up)]
      .map((x) => x.trim())
      .filter(Boolean)
      .join('\n\n')
    if (notes.length > 30) {
      blocks.push({
        heading: `${fmtIsoDate(r.visit_date)} · ${clip(r.doctor as string | null, 40)}`,
        body: clip(notes, 900),
      })
    }
  }

  return {
    title: 'Doctor visits',
    paragraph,
    bullets: bullets.length ? bullets : ['—'],
    blocks: blocks.length ? blocks : undefined,
  }
}

function formatQuestions (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const open = rows.filter((r) => String(r.status ?? '').toLowerCase() === 'unanswered').length
  const paragraph = n === 0
    ? 'No saved questions for doctors.'
    : `${n} question row${n === 1 ? '' : 's'}; ${open} marked unanswered (counts may reflect export-time state).`

  const sorted = [...rows].sort((a, b) => str(b.date_created).localeCompare(str(a.date_created)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const pr = clip(r.priority as string | null, 12)
    const q = clip(r.question as string | null, 100)
    const doc = clip(r.doctor as string | null, 32)
    bullets.push(`${pr || '—'} · ${doc || '—'} · ${q}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return { title: 'Questions for doctors', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatProfileNotes (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No per-doctor journal notes.'
    : `${n} timestamped note${n === 1 ? '' : 's'} attached to doctor profiles.`

  const sorted = [...rows].sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)))
  const bullets: string[] = []
  const blocks: { heading: string; body: string }[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const when = str(r.created_at).slice(0, 10)
    bullets.push(`${when} · doctor_id ${clip(str(r.doctor_id), 36)}`)
    const body = str(r.body)
    if (body.length > 40) {
      blocks.push({ heading: `${when} — journal note`, body: clip(body, 800) })
    }
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return {
    title: 'Doctor journal notes',
    paragraph,
    bullets: bullets.length ? bullets : ['—'],
    blocks: blocks.length ? blocks : undefined,
  }
}

function formatCurrentMeds (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No current medications listed.'
    : `${n} current medication row${n === 1 ? '' : 's'} (active list).`

  const bullets = rows.slice(0, MAX_BULLETS).map((raw) => {
    const r = row(raw)
    const name = clip(r.medication as string | null, 44)
    const dose = clip(r.dose as string | null, 28)
    const freq = clip(r.frequency as string | null, 28)
    const purpose = clip(r.purpose as string | null, 40)
    return `${name || '—'} · ${dose || '—'} · ${freq || '—'}${purpose ? ` · ${purpose}` : ''}`
  })
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return { title: 'Current medications', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatMedsArchive (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No archived (stopped) medications.'
    : `${n} archived medication record${n === 1 ? '' : 's'} (past regimens).`

  const sorted = [...rows].sort((a, b) => str(b.stopped_date).localeCompare(str(a.stopped_date)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const stopped = fmtIsoDate(r.stopped_date)
    const name = clip(r.medication as string | null, 40)
    const why = clip(r.reason_stopped as string | null, 48)
    bullets.push(`${stopped} · ${name}${why ? ` · stopped: ${why}` : ''}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return { title: 'Medications archive', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatMedChangeEvents (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No medication change events recorded.'
    : `${n} medication change event${n === 1 ? '' : 's'} (dose adjustments, starts, stops).`

  const sorted = [...rows].sort((a, b) => str(b.event_date).localeCompare(str(a.event_date)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const d = fmtIsoDate(r.event_date)
    const med = clip(r.medication as string | null, 36)
    const typ = clip(r.event_type as string | null, 16)
    const dn = clip(r.dose_new as string | null, 24)
    const dp = clip(r.dose_previous as string | null, 24)
    bullets.push(`${d} · ${typ || '—'} · ${med} · ${dp || '—'} → ${dn || '—'}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return { title: 'Medication change events', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatTests (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const pending = rows.filter((r) => String(r.status ?? '').toLowerCase() === 'pending').length
  const paragraph = n === 0
    ? 'No tests / labs list stored.'
    : `${n} test row${n === 1 ? '' : 's'}; ${pending} marked pending.`

  const sorted = [...rows].sort((a, b) => str(b.test_date).localeCompare(str(a.test_date)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const d = fmtIsoDate(r.test_date)
    const name = clip(r.test_name as string | null, 44)
    const st = clip(r.status as string | null, 14)
    bullets.push(`${d} · ${st || '—'} · ${name}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return { title: 'Tests ordered', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatDiagnoses (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No diagnoses directory entries.'
    : `${n} diagnosis row${n === 1 ? '' : 's'} in your directory.`

  const bullets = rows.slice(0, MAX_BULLETS).map((raw) => {
    const r = row(raw)
    const dx = clip(r.diagnosis as string | null, 56)
    const st = clip(r.status as string | null, 20)
    const doc = clip(r.doctor as string | null, 32)
    const how = clip(r.how_or_why as string | null, 48)
    const tp = clip(r.treatment_plan as string | null, 36)
    const cp = clip(r.care_plan as string | null, 36)
    const dr = r.date_resolved as string | null | undefined
    const dro = r.date_ruled_out as string | null | undefined
    let line = `${fmtIsoDate(r.date_diagnosed)} · ${st || '—'} · ${dx}${doc ? ` · ${doc}` : ''}`
    if (how) line += ` — ${how}`
    if (tp) line += ` · Tx: ${tp}`
    if (cp) line += ` · Care: ${cp}`
    if (dr) line += ` · Resolved ${fmtIsoDate(dr)}`
    if (dro) line += ` · Ruled out ${fmtIsoDate(dro)}`
    return line
  })
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return { title: 'Diagnoses directory', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatDiagnosisNotes (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No separate diagnosis notes.'
    : `${n} diagnosis note row${n === 1 ? '' : 's'} (per-visit style notes).`

  const sorted = [...rows].sort((a, b) => str(b.note_date ?? b.created_at).localeCompare(str(a.note_date ?? a.created_at)))
  const bullets: string[] = []
  const blocks: { heading: string; body: string }[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const nd = fmtIsoDate(r.note_date)
    const doc = clip(r.doctor as string | null, 32)
    bullets.push(`${nd} · ${doc || '—'} · mentioned: ${clip(r.diagnoses_mentioned as string | null, 40)}`)
    const body = str(r.notes)
    const mentioned = str(r.diagnoses_mentioned)
    const ruled = str(r.diagnoses_ruled_out)
    const chunk = [mentioned && `Mentioned: ${mentioned}`, ruled && `Ruled out: ${ruled}`, body && `Notes: ${body}`].filter(Boolean).join('\n')
    if (chunk.length > 40) {
      blocks.push({ heading: `${nd} · ${doc || 'diagnosis notes'}`, body: clip(chunk, 900) })
    }
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return {
    title: 'Diagnosis notes',
    paragraph,
    bullets: bullets.length ? bullets : ['—'],
    blocks: blocks.length ? blocks : undefined,
  }
}

function formatAppointments (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No appointments stored.'
    : `${n} appointment row${n === 1 ? '' : 's'}.`

  const sorted = [...rows].sort((a, b) => str(b.appointment_date).localeCompare(str(a.appointment_date)))
  const bullets: string[] = []
  for (let i = 0; i < Math.min(sorted.length, MAX_BULLETS); i++) {
    const r = row(sorted[i]!)
    const d = fmtIsoDate(r.appointment_date)
    const tm = clip(r.appointment_time as string | null, 12)
    const doc = clip(r.doctor as string | null, 40)
    bullets.push(`${d}${tm ? ` ${tm}` : ''} · ${doc || '—'}`)
  }
  if (n > MAX_BULLETS) bullets.push(`… and ${n - MAX_BULLETS} more (see JSON export).`)

  return { title: 'Appointments', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatPlushieUnlocks (rows: Record<string, unknown>[]): ReadableExportPdfSection {
  const n = rows.length
  const paragraph = n === 0
    ? 'No plushie unlock rows (trial feature).'
    : `${n} plushie unlock record${n === 1 ? '' : 's'}.`

  const bullets = rows.slice(0, MAX_BULLETS).map((raw) => {
    const r = row(raw)
    return `plushie_id · ${clip(str(r.plushie_id), 40)}`
  })

  return { title: 'Plushie unlocks', paragraph, bullets: bullets.length ? bullets : ['—'] }
}

function formatSummaryArchive (items: ArchivedHandoffSummary[]): ReadableExportPdfSection {
  const n = items.length
  const paragraph = n === 0
    ? 'No archived handoff summaries saved on this device.'
    : `${n} saved handoff summary snapshot${n === 1 ? '' : 's'} from this browser (local only).`

  const sorted = [...items].sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso))
  const bullets: string[] = []
  const blocks: { heading: string; body: string }[] = []
  for (let i = 0; i < Math.min(sorted.length, 12); i++) {
    const it = sorted[i]!
    bullets.push(`${it.generatedLabel} · ${it.sourceAi ? 'AI-assisted' : 'app-generated'} · saved ${it.savedAtIso.slice(0, 10)}`)
    blocks.push({
      heading: it.generatedLabel,
      body: clip(it.text, 1200),
    })
  }
  if (n > 12) bullets.push(`… and ${n - 12} more summaries in JSON only.`)

  return {
    title: 'Archived handoff summaries (this device)',
    paragraph,
    bullets: bullets.length ? bullets : ['—'],
    blocks: blocks.length ? blocks : undefined,
  }
}

function formatTranscriptArchive (items: ArchivedTranscript[]): ReadableExportPdfSection {
  const n = items.length
  const paragraph = n === 0
    ? 'No archived visit transcripts on this device.'
    : `${n} archived visit transcript${n === 1 ? '' : 's'} (local only); excerpts below.`

  const sorted = [...items].sort((a, b) => b.savedAtIso.localeCompare(a.savedAtIso))
  const bullets: string[] = []
  const blocks: { heading: string; body: string }[] = []
  for (let i = 0; i < Math.min(sorted.length, 10); i++) {
    const it = sorted[i]!
    bullets.push(`${it.visitDate} · ${clip(it.doctorName, 40)} · saved ${it.savedAtIso.slice(0, 10)}`)
    blocks.push({
      heading: `${it.visitDate} · ${clip(it.doctorName, 36)}`,
      body: clip(it.transcript, 1400),
    })
  }
  if (n > 10) bullets.push(`… and ${n - 10} more transcripts in JSON only.`)

  return {
    title: 'Archived visit transcripts (this device)',
    paragraph,
    bullets: bullets.length ? bullets : ['—'],
    blocks: blocks.length ? blocks : undefined,
  }
}
