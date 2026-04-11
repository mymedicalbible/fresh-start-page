/**
 * Full user data export: parallel Supabase reads, handoff narrative (same logic as dashboard),
 * local archives, JSON backup + PDF-friendly text blocks.
 */

import { supabase } from './supabase'
import { downloadFullDataExportPdf } from './summaryPdf'
import { buildReadableExportPdfSections } from './fullDataExportPdfReadable'
import { buildHandoffNarrative } from './handoffNarrative'
import {
  type MedChangeEvent,
  buildMedSymptomCorrelationLines,
  formatCorrelationBlock,
} from './medSymptomCorrelation'
import { loadSummaryArchive, type ArchivedHandoffSummary } from './summaryArchive'
import { loadTranscriptArchive, type ArchivedTranscript } from './transcriptArchive'

export const FULL_EXPORT_VERSION = 1 as const

function parseList (text: string | null): string[] {
  if (!text) return []
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

function topN<T extends string> (items: T[], n = 5): { value: T; count: number }[] {
  const map = new Map<T, number>()
  for (const item of items) map.set(item, (map.get(item) ?? 0) + 1)
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }))
}

export type FullExportPayload = {
  exportVersion: typeof FULL_EXPORT_VERSION
  exportedAtIso: string
  userId: string
  handoff: {
    narrative: string
    medCorrelationBlock: string
    scope: 'full'
    medEventsLoadError: string | null
  }
  supabase: {
    pain_entries: unknown[]
    mcas_episodes: unknown[]
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
  tableErrors: Partial<Record<string, string>>
  local: {
    summaryArchive: ArchivedHandoffSummary[]
    transcriptArchive: ArchivedTranscript[]
  }
}

async function safeSelect<T> (
  label: string,
  fn: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  try {
    const { data, error } = await Promise.resolve(fn())
    if (error) return { rows: [], error: `${label}: ${error.message}` }
    return { rows: (data ?? []) as T[], error: null }
  } catch (e) {
    return { rows: [], error: `${label}: ${String(e)}` }
  }
}

/**
 * Build narrative + correlation using the same windows and rules as Dashboard `generateSummary` (full scope).
 */
function buildHandoffParts (
  painRows: Record<string, unknown>[],
  sympRows: Record<string, unknown>[],
  medList: Record<string, unknown>[],
  testRows: Record<string, unknown>[],
  diagRows: Record<string, unknown>[],
  visitRows: Record<string, unknown>[],
  qList: Record<string, unknown>[],
  archivedMeds: Record<string, unknown>[],
  allMedEvents: MedChangeEvent[],
  medEventsLoadError: string | null,
  patientFocus: string,
): { narrative: string; medCorrelationBlock: string } {
  const medCorrelationBlock = medEventsLoadError
    ? ''
    : formatCorrelationBlock(buildMedSymptomCorrelationLines(
      allMedEvents,
      painRows,
      sympRows,
      21,
      undefined,
    ))

  const intensities = painRows.map((r) => r.intensity).filter((x): x is number => typeof x === 'number')
  const painAvg = intensities.length > 0
    ? Math.round((intensities.reduce((a, b) => a + b, 0) / intensities.length) * 10) / 10
    : null

  const allAreas = painRows.flatMap((r) => parseList(r.location as string | null))
  const areaTop = topN(allAreas).map(({ value, count }) => ({ area: value, n: count }))
  const allTypes = painRows.flatMap((r) => parseList(r.pain_type as string | null))
  const typeTop = topN(allTypes).map(({ value, count }) => ({ type: value, n: count }))
  const allSymptoms = sympRows.flatMap((r) => parseList(r.symptoms as string | null))
  const symptomTop = topN(allSymptoms).map(({ value, count }) => ({ symptom: value, n: count }))
  const todayIso = new Date().toISOString().slice(0, 10)

  const narrative = buildHandoffNarrative({
    todayIso,
    patientFocus: patientFocus.trim() || undefined,
    scope: 'full',
    archivedMeds,
    painRows,
    sympRows,
    medList,
    testRows,
    diagRows,
    visitRows,
    qList,
    medChangeEvents: allMedEvents,
    medChangeEventsLoadError: medEventsLoadError,
    painAvg,
    painTopAreas: areaTop,
    painTopTypes: typeTop,
    topSymptoms: symptomTop,
  }).trim()

  return { narrative, medCorrelationBlock }
}

export async function buildFullExportPayload (userId: string): Promise<FullExportPayload> {
  const exportedAtIso = new Date().toISOString()
  const since90 = new Date()
  since90.setDate(since90.getDate() - 90)
  const since90Str = since90.toISOString().slice(0, 10)
  const since120 = new Date()
  since120.setDate(since120.getDate() - 120)
  const since120Str = since120.toISOString().slice(0, 10)

  let patientFocus = ''
  try {
    patientFocus = localStorage.getItem('mb-handoff-focus') ?? ''
  } catch { /* ignore */ }

  const tableErrors: Partial<Record<string, string>> = {}

  const [
    painAll,
    sympAll,
    symptomLogs,
    doctors,
    visitsAll,
    questionsAll,
    profileNotes,
    meds,
    medsArchive,
    testsAll,
    diags,
    diagNotes,
    appts,
    plushUnlocks,
    medEventsFull,
  ] = await Promise.all([
    safeSelect('pain_entries', async () =>
      await supabase.from('pain_entries').select('*').eq('user_id', userId)
        .order('entry_date', { ascending: false }).limit(10000)),
    safeSelect('mcas_episodes', async () =>
      await supabase.from('mcas_episodes').select('*').eq('user_id', userId)
        .order('episode_date', { ascending: false }).limit(10000)),
    safeSelect('symptom_logs', async () =>
      await supabase.from('symptom_logs').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(10000)),
    safeSelect('doctors', async () =>
      await supabase.from('doctors').select('*').eq('user_id', userId).order('name', { ascending: true })),
    safeSelect('doctor_visits', async () =>
      await supabase.from('doctor_visits').select('*').eq('user_id', userId)
        .order('visit_date', { ascending: false }).order('created_at', { ascending: false }).limit(500)),
    safeSelect('doctor_questions', async () =>
      await supabase.from('doctor_questions').select('*').eq('user_id', userId)
        .order('date_created', { ascending: false }).limit(2000)),
    safeSelect('doctor_profile_notes', async () =>
      await supabase.from('doctor_profile_notes').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(500)),
    safeSelect('current_medications', async () =>
      await supabase.from('current_medications').select('*').eq('user_id', userId).order('medication', { ascending: true })),
    safeSelect('medications_archive', async () =>
      await supabase.from('medications_archive').select('*').eq('user_id', userId)
        .order('stopped_date', { ascending: false }).limit(2000)),
    safeSelect('medication_change_events', async () =>
      await supabase.from('medication_change_events').select('*').eq('user_id', userId)
        .order('event_date', { ascending: false }).order('created_at', { ascending: false }).limit(5000)),
    safeSelect('tests_ordered', async () =>
      await supabase.from('tests_ordered').select('*').eq('user_id', userId)
        .order('test_date', { ascending: false }).limit(2000)),
    safeSelect('diagnoses_directory', async () =>
      await supabase.from('diagnoses_directory').select('*').eq('user_id', userId)
        .order('date_diagnosed', { ascending: false }).limit(1000)),
    safeSelect('diagnosis_notes', async () =>
      await supabase.from('diagnosis_notes').select('*').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(2000)),
    safeSelect('appointments', async () =>
      await supabase.from('appointments').select('*').eq('user_id', userId)
        .order('appointment_date', { ascending: false }).limit(2000)),
    safeSelect('user_plushie_unlocks', async () =>
      await supabase.from('user_plushie_unlocks').select('*').eq('user_id', userId)),
  ])

  for (const [label, res] of Object.entries({
    pain_entries: painAll,
    mcas_episodes: sympAll,
    symptom_logs: symptomLogs,
    doctors,
    doctor_visits: visitsAll,
    doctor_questions: questionsAll,
    doctor_profile_notes: profileNotes,
    current_medications: meds,
    medications_archive: medsArchive,
    medication_change_events: medEventsFull,
    tests_ordered: testsAll,
    diagnoses_directory: diags,
    diagnosis_notes: diagNotes,
    appointments: appts,
    user_plushie_unlocks: plushUnlocks,
  })) {
    if (res.error) tableErrors[label] = res.error
  }

  const painRowsAll = painAll.rows as Record<string, unknown>[]
  const sympRowsAll = sympAll.rows as Record<string, unknown>[]
  const medList = meds.rows as Record<string, unknown>[]
  const archivedMeds = medsArchive.rows as Record<string, unknown>[]

  const painRows = painRowsAll
    .filter((r) => String(r.entry_date ?? '') >= since90Str)
    .slice(0, 120)
  const sympRows = sympRowsAll
    .filter((r) => String(r.episode_date ?? '') >= since90Str)
    .slice(0, 120)

  const testRows = (testsAll.rows as Record<string, unknown>[]).slice(0, 40)
  const diagRows = (diags.rows as Record<string, unknown>[]).slice(0, 25)
  const visitRows = (visitsAll.rows as Record<string, unknown>[])
    .filter((r) => String(r.visit_date ?? '') >= since90Str)
    .slice(0, 15)
  const qList = (questionsAll.rows as Record<string, unknown>[])
    .filter((r) => String(r.status ?? '') === 'Unanswered')
    .slice(0, 25)

  const medEventsRes = await supabase.rpc('get_medication_change_events', {
    p_since: since120Str,
    p_limit: 50,
  })

  let medChangeEvents: MedChangeEvent[] = []
  let medEventsLoadError: string | null = null

  if (medEventsRes.error) {
    const fallback = await supabase.from('medication_change_events')
      .select('*')
      .eq('user_id', userId)
      .gte('event_date', since120Str)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)

    if (fallback.error) {
      medEventsLoadError = fallback.error.message
    } else {
      medChangeEvents = (fallback.data ?? []) as MedChangeEvent[]
    }
  } else {
    medChangeEvents = (medEventsRes.data ?? []) as MedChangeEvent[]
  }

  const eventedMeds = new Set(medChangeEvents.map((e) => e.medication.toLowerCase()))
  const syntheticStarts: MedChangeEvent[] = medList
    .filter((m) => {
      const name = String(m.medication ?? '')
      const sd = String(m.start_date ?? '')
      return name && sd && !eventedMeds.has(name.toLowerCase())
    })
    .map((m) => ({
      event_date: String(m.start_date),
      medication: String(m.medication),
      event_type: 'start' as const,
      dose_previous: null,
      dose_new: m.dose != null ? String(m.dose) : null,
      frequency_previous: null,
      frequency_new: m.frequency != null ? String(m.frequency) : null,
      created_at: null,
      change_reason: null,
    }))

  const allMedEvents = medEventsLoadError ? [] : [...medChangeEvents, ...syntheticStarts]

  const { narrative, medCorrelationBlock } = buildHandoffParts(
    painRows,
    sympRows,
    medList,
    testRows,
    diagRows,
    visitRows,
    qList,
    archivedMeds,
    allMedEvents,
    medEventsLoadError,
    patientFocus,
  )

  let summaryArchive: ArchivedHandoffSummary[] = []
  let transcriptArchive: ArchivedTranscript[] = []
  try {
    summaryArchive = loadSummaryArchive()
    transcriptArchive = loadTranscriptArchive()
  } catch { /* ignore */ }

  return {
    exportVersion: FULL_EXPORT_VERSION,
    exportedAtIso,
    userId,
    handoff: {
      narrative,
      medCorrelationBlock,
      scope: 'full',
      medEventsLoadError,
    },
    supabase: {
      pain_entries: painAll.rows,
      mcas_episodes: sympAll.rows,
      symptom_logs: symptomLogs.rows,
      doctors: doctors.rows,
      doctor_visits: visitsAll.rows,
      doctor_questions: questionsAll.rows,
      doctor_profile_notes: profileNotes.rows,
      current_medications: meds.rows,
      medications_archive: medsArchive.rows,
      medication_change_events: medEventsFull.rows,
      tests_ordered: testsAll.rows,
      diagnoses_directory: diags.rows,
      diagnosis_notes: diagNotes.rows,
      appointments: appts.rows,
      user_plushie_unlocks: plushUnlocks.rows,
    },
    tableErrors,
    local: { summaryArchive, transcriptArchive },
  }
}

export function handoffTextForExportPdf (payload: FullExportPayload): string {
  const main = payload.handoff.narrative
  const block = payload.handoff.medCorrelationBlock.trim()
  if (block && !main.includes('MEDICATION CHANGES')) {
    return `${main}\n\n---\nMedication changes & outcomes (app-derived)\n\n${block}`
  }
  return main
}

export function downloadJsonExport (payload: FullExportPayload): void {
  const safe = payload.exportedAtIso.replace(/[:.]/g, '-').slice(0, 19)
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `medical-bible-export-${safe}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function runFullExportAndDownload (userId: string): Promise<FullExportPayload> {
  const payload = await buildFullExportPayload(userId)
  downloadJsonExport(payload)
  await new Promise<void>((r) => setTimeout(r, 450))
  downloadFullDataExportPdf({
    body: handoffTextForExportPdf(payload),
    readableSections: buildReadableExportPdfSections(payload),
    generatedAtLabel: new Date(payload.exportedAtIso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    tableErrors: payload.tableErrors,
    exportedAtIso: payload.exportedAtIso,
    userId: payload.userId,
  })
  return payload
}
