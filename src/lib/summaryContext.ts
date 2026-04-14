/**
 * Compact, trend-aware context for clinical handoff AI (reduces token dump / list-paraphrase).
 */

import {
  type MedChangeEvent,
  buildMedSymptomCorrelationLines,
  formatCorrelationBlock,
  formatMedChangeEventLine,
  sortMedChangeEvents,
} from './medSymptomCorrelation'

export type SymptomLogRow = {
  logged_at: string
  activity_last_4h: string | null
  symptoms: string[] | null
}

export type SummaryInput = {
  /** Calendar "today" YYYY-MM-DD (browser local) */
  todayIso: string
  painRows: Record<string, unknown>[]
  sympRows: Record<string, unknown>[]
  medList: Record<string, unknown>[]
  testRows: Record<string, unknown>[]
  diagRows: Record<string, unknown>[]
  visitRows: Record<string, unknown>[]
  qList: Record<string, unknown>[]
  slogRows: SymptomLogRow[]
  /** From medication_change_events (optional if table not migrated yet) */
  medChangeEvents?: MedChangeEvent[]
}

function parseList (text: string | null | undefined): string[] {
  if (!text) return []
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

function topAreas (rows: Record<string, unknown>[], n = 5): { area: string; count: number }[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    for (const a of parseList(r.location as string | null)) map.set(a, (map.get(a) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([area, count]) => ({ area, count }))
}

function painAvg (rows: Record<string, unknown>[]): number | null {
  const nums = rows.map((r) => r.intensity).filter((x): x is number => typeof x === 'number')
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

function formatPainLine (r: Record<string, unknown>) {
  const parts = [
    r.entry_date as string,
    r.entry_time ? String(r.entry_time) : null,
    typeof r.intensity === 'number' ? `${r.intensity}/10` : null,
    r.location ? String(r.location) : null,
  ].filter(Boolean)
  if (r.pain_type) parts.push(`type: ${r.pain_type}`)
  if (r.triggers) parts.push(`triggers: ${r.triggers}`)
  if (r.relief_methods) parts.push(`relief: ${r.relief_methods}`)
  if (r.notes) parts.push(`notes: ${r.notes}`)
  return `• ${parts.join(' · ')}`
}

function formatSymptomLogLine (r: Record<string, unknown>) {
  const parts = [
    r.symptom_date as string,
    r.symptom_time ? String(r.symptom_time) : null,
    r.severity ? String(r.severity) : null,
    r.symptoms ? String(r.symptoms) : null,
    r.activity ? `ctx: ${r.activity}` : null,
    r.relief ? `relief: ${r.relief}` : null,
    r.notes ? `notes: ${r.notes}` : null,
  ].filter(Boolean)
  return `• ${parts.join(' · ')}`
}

function formatVisitOneLine (r: Record<string, unknown>) {
  const doc = r.doctor ? String(r.doctor) : 'Unknown'
  const reas = r.reason ? String(r.reason).slice(0, 120) : ''
  const plan = r.instructions ? String(r.instructions).slice(0, 120) : (r.findings ? String(r.findings).slice(0, 120) : '')
  return `• ${r.visit_date} · ${doc}${reas ? ` — ${reas}${reas.length >= 120 ? '…' : ''}` : ''}${plan && plan !== reas ? ` · ${plan}${plan.length >= 120 ? '…' : ''}` : ''}`
}

function pickPainExemplars (rows: Record<string, unknown>[], max = 4): Record<string, unknown>[] {
  if (rows.length === 0) return []
  const key = (r: Record<string, unknown>) => `${r.entry_date}-${r.intensity}-${r.location}`
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  const byIntensity = [...rows].sort((a, b) => (Number(b.intensity) || 0) - (Number(a.intensity) || 0))
  for (const r of byIntensity) {
    if (out.length >= max) break
    const k = key(r)
    if (seen.has(k)) continue
    seen.add(k); out.push(r)
    if (out.length >= 2) break
  }
  for (const r of rows) {
    if (out.length >= max) break
    const k = key(r)
    if (seen.has(k)) continue
    seen.add(k); out.push(r)
  }
  return out.slice(0, max)
}

function pickSymptomLogExemplars (rows: Record<string, unknown>[], max = 4): Record<string, unknown>[] {
  if (rows.length === 0) return []
  const severityRank = (s: string) => ({ Severe: 3, Moderate: 2, Mild: 1 }[s] ?? 0)
  const key = (r: Record<string, unknown>) => `${r.symptom_date}-${r.symptoms}`
  const seen = new Set<string>()
  const out: Record<string, unknown>[] = []
  const ranked = [...rows].sort((a, b) =>
    severityRank(String(b.severity ?? '')) - severityRank(String(a.severity ?? '')))
  for (const r of ranked) {
    if (out.length >= max) break
    const k = key(r)
    if (seen.has(k)) continue
    seen.add(k); out.push(r)
    if (out.length >= 2) break
  }
  for (const r of rows) {
    if (out.length >= max) break
    const k = key(r)
    if (seen.has(k)) continue
    seen.add(k); out.push(r)
  }
  return out.slice(0, max)
}

function addDays (iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

/**
 * Single string passed to the Edge Function as patient-facing facts (compact + trends + exemplars).
 */
export function buildCompactPatientData (input: SummaryInput): string {
  const { todayIso, painRows, sympRows, medList, testRows, diagRows, visitRows, qList, slogRows, medChangeEvents = [] } = input
  const start14 = addDays(todayIso, -14)
  const start90 = addDays(todayIso, -90)

  const painRecent = painRows.filter((r) => String(r.entry_date) >= start14)
  const painPrior = painRows.filter((r) => String(r.entry_date) < start14 && String(r.entry_date) >= start90)
  const symRecent = sympRows.filter((r) => String(r.symptom_date) >= start14)
  const symPrior = sympRows.filter((r) => String(r.symptom_date) < start14 && String(r.symptom_date) >= start90)

  const avgR = painAvg(painRecent)
  const avgP = painAvg(painPrior)
  let trendLine = 'Pain logging: '
  if (painRows.length === 0) trendLine += 'no entries in ~90d window.'
  else {
    trendLine += `${painRows.length} entr${painRows.length !== 1 ? 'ies' : 'y'} in ~90d`
    trendLine += `; last 14d: ${painRecent.length} entr${painRecent.length !== 1 ? 'ies' : 'y'}`
    if (avgR != null || avgP != null) {
      trendLine += `. Mean intensity ~14d: ${avgR ?? 'n/a'} vs prior 15–90d: ${avgP ?? 'n/a'}`
    }
    const topR = topAreas(painRecent, 4)
    const topP = topAreas(painPrior, 4)
    if (topR.length) trendLine += `. Top locations (14d): ${topR.map((x) => `${x.area}×${x.count}`).join(', ')}`
    if (topP.length && !painRecent.length) trendLine += `. Top locations (prior): ${topP.map((x) => `${x.area}×${x.count}`).join(', ')}`
  }

  let symTrend = 'Symptom/MCAS logs: '
  if (sympRows.length === 0) symTrend += 'none in ~90d.'
  else {
    symTrend += `${sympRows.length} in ~90d; last 14d: ${symRecent.length} vs prior window: ${symPrior.length}.`
  }

  const painEx = pickPainExemplars(painRows, 4)
  const symEx = pickSymptomLogExemplars(sympRows, 4)

  const painExText = painEx.length ? painEx.map(formatPainLine).join('\n') : '(No exemplar pain lines.)'
  const symExText = symEx.length ? symEx.map(formatSymptomLogLine).join('\n') : '(No exemplar symptom log lines.)'

  const excerptPain = painRows.slice(0, 5).map(formatPainLine).join('\n') || '(none)'
  const excerptSym = sympRows.slice(0, 5).map(formatSymptomLogLine).join('\n') || '(none)'

  const medText = medList.length
    ? medList.map((m) => {
      const p = [m.medication, m.dose, m.frequency, m.purpose].filter(Boolean).join(' · ')
      const n = m.notes ? ` (${m.notes})` : ''
      return `• ${p}${n}`
    }).join('\n')
    : '(No medications listed.)'

  const pendingTests = testRows.filter((t) => t.status === 'Pending')
  const otherTests = testRows.filter((t) => t.status !== 'Pending').slice(0, 12)
  const testText = [
    pendingTests.length ? 'PENDING:\n' + pendingTests.map((t) => {
      const bits = [String(t.test_date), String(t.test_name), t.doctor ? String(t.doctor) : '', t.reason ? String(t.reason).slice(0, 80) : '']
      return `• ${bits.filter(Boolean).join(' · ')}`
    }).join('\n') : '(No pending tests.)',
    otherTests.length ? '\nRECENT (non-pending):\n' + otherTests.map((t) =>
      `• ${t.test_date} · ${t.test_name} · ${t.status}${t.results ? ` — result: ${String(t.results).slice(0, 120)}` : ''}`).join('\n') : '',
  ].join('')

  const diagText = diagRows.length
    ? diagRows.map((d) => {
        const base = `• ${d.diagnosis ?? ''} — ${d.status ?? ''}${d.date_diagnosed ? ` (${d.date_diagnosed})` : ''}${d.doctor ? ` · ${d.doctor}` : ''}`
        const bits: string[] = [base]
        const how = d.how_or_why as string | undefined
        const tp = d.treatment_plan as string | undefined
        const cp = d.care_plan as string | undefined
        const dr = d.date_resolved as string | undefined
        const dro = d.date_ruled_out as string | undefined
        if (how) bits.push(`  ${how}`)
        if (tp) bits.push(`  Treatment: ${tp}`)
        if (cp) bits.push(`  Care: ${cp}`)
        if (dr) bits.push(`  Resolved on: ${dr}`)
        if (dro) bits.push(`  Ruled out on: ${dro}`)
        return bits.join('\n')
      }).join('\n')
    : '(No diagnosis directory entries.)'

  const visitCompact = visitRows.slice(0, 6).map(formatVisitOneLine).join('\n') || '(No visits in window.)'

  const qText = qList.length
    ? qList.slice(0, 18).map((q) =>
      `• [${q.priority ?? '?'}] ${q.question}${q.doctor ? ` (re: ${q.doctor})` : ''}`).join('\n')
    : '(No open questions.)'

  const slogText = slogRows.length
    ? slogRows.slice(0, 8).map((r) => {
      const sy = Array.isArray(r.symptoms) && r.symptoms.length ? r.symptoms.join(', ') : ''
      return `• ${r.logged_at?.slice(0, 16)?.replace('T', ' ')} · ${r.activity_last_4h || ''} · ${sy}`
    }).join('\n')
    : '(No structured symptom snapshots.)'

  const medCorrLines = buildMedSymptomCorrelationLines(medChangeEvents, painRows, sympRows, 21)
  const medCorrText = formatCorrelationBlock(medCorrLines)

  const medChangeLogText = medChangeEvents.length
    ? [...medChangeEvents].sort(sortMedChangeEvents).slice(0, 25).map((ev) =>
      `• ${formatMedChangeEventLine(ev)}`).join('\n')
    : '(No medication change events in the supplied window.)'

  return [
    '=== APP-GENERATED SUMMARY STATS (use with raw excerpts; do not recite as a bullet list in output) ===',
    trendLine,
    symTrend,
    '',
    '=== REPRESENTATIVE PAIN ENTRIES (illustrate patterns; do not copy every line to output) ===',
    painExText,
    '',
    '=== REPRESENTATIVE SYMPTOM LOG ENTRIES ===',
    symExText,
    '',
    '=== MEDICATIONS (complete list from app) ===',
    medText,
    '',
    '=== MEDICATION CHANGE LOG (dates; logged time and reason when recorded) ===',
    medChangeLogText,
    '',
    '=== MEDICATION CHANGES vs SYMPTOM/PAIN (~21d before vs after each event; interpret cautiously) ===',
    medCorrText,
    '',
    '=== DIAGNOSES DIRECTORY ===',
    diagText,
    '',
    '=== RECENT VISITS (compressed) ===',
    visitCompact,
    '',
    '=== TESTS & ORDERS ===',
    testText,
    '',
    '=== OPEN QUESTIONS ===',
    qText,
    '',
    '=== STRUCTURED SYMPTOM SNAPSHOTS (recent) ===',
    slogText,
    '',
    '=== REFERENCE EXCERPT ONLY (optional detail; do not exhaustively summarize row-by-row) ===',
    'Pain (max 5 lines):',
    excerptPain,
    '',
    'Symptoms (max 5 lines):',
    excerptSym,
  ].join('\n')
}
