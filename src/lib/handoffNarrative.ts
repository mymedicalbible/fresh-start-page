/**
 * App-generated clinical handoff: first-person narrative in the patient's voice.
 * Matches the template: header → opening paragraph → 30-day pain/symptom summary →
 * What I need to address today → Recent visits → Recent results → Medication changes →
 * My questions for you.
 */

import {
  type MedChangeEvent,
  buildMedSymptomCorrelationLines,
  isPrnFrequency,
} from './medSymptomCorrelation'

export type HandoffNarrativeInput = {
  todayIso: string
  painRows: Record<string, unknown>[]
  sympRows: Record<string, unknown>[]
  medList: Record<string, unknown>[]
  testRows: Record<string, unknown>[]
  diagRows: Record<string, unknown>[]
  visitRows: Record<string, unknown>[]
  qList: Record<string, unknown>[]
  medChangeEvents: MedChangeEvent[]
  painAvg: number | null
  painTopAreas: { area: string; n: number }[]
  painTopTypes: { type: string; n: number }[]
  topSymptoms: { symptom: string; n: number }[]
}

function addDaysIso (iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function formatDate (iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return iso
  }
}

function listSentence (items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function buildHandoffNarrative (d: HandoffNarrativeInput): string {
  const since30 = addDaysIso(d.todayIso, -30)

  // Filter to 30-day window for opening stats
  const pain30 = d.painRows.filter((r) => String(r.entry_date ?? '') >= since30)
  const symp30 = d.sympRows.filter((r) => String(r.episode_date ?? '') >= since30)

  const intensities30 = pain30
    .map((r) => r.intensity)
    .filter((x): x is number => typeof x === 'number')
  const avg30 = intensities30.length
    ? Math.round((intensities30.reduce((a, b) => a + b, 0) / intensities30.length) * 10) / 10
    : null
  const flares30 = pain30.filter(
    (r) => typeof r.intensity === 'number' && (r.intensity as number) >= 7,
  )

  // Top areas / types from 30-day window (fall back to full window if empty)
  function topFromField (rows: Record<string, unknown>[], field: string, n = 3): string[] {
    const items = rows.flatMap((r) => {
      const v = r[field]
      return typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []
    })
    const map = new Map<string, number>()
    for (const it of items) map.set(it, (map.get(it) ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  }

  const areas30 = topFromField(pain30, 'location') || d.painTopAreas.slice(0, 3).map((a) => a.area)
  const types30 = topFromField(pain30, 'pain_type', 2) || d.painTopTypes.slice(0, 2).map((t) => t.type)
  const symp30Top = topFromField(symp30, 'symptoms', 4) || d.topSymptoms.slice(0, 4).map((s) => s.symptom)

  // --- HEADER ---
  const displayDate = formatDate(d.todayIso)

  // --- OPENING PARAGRAPH ---
  const activeDx = d.diagRows
    .filter((r) => {
      const st = String(r.status ?? '').toLowerCase()
      return !st || st === 'active' || st === 'confirmed' || st === 'suspected'
    })
    .slice(0, 4)
    .map((r) => String(r.diagnosis))

  const dxPhrase = activeDx.length
    ? `managing ${listSentence(activeDx)}`
    : 'managing ongoing health conditions'

  const medPhrase = d.medList.length
    ? d.medList.slice(0, 6).map((m) => {
        const parts: string[] = [String(m.medication ?? '')]
        if (m.dose) parts.push(String(m.dose))
        if (m.frequency) {
          const freq = String(m.frequency)
          parts.push(isPrnFrequency(freq) ? `${freq} (as needed)` : freq)
        }
        return parts.join(' ')
      }).join(', ')
    : null

  const openingLines: string[] = []
  openingLines.push(`I've been ${dxPhrase}.`)
  if (medPhrase) {
    openingLines.push(`I'm currently taking ${medPhrase}${d.medList.length > 6 ? ', and others' : ''}.`)
  }

  // --- 30-DAY PAIN & SYMPTOM PARAGRAPH ---
  const bodyLines: string[] = []
  if (pain30.length > 0) {
    let painLine = `Over the past 30 days, pain has been my primary concern — I logged ${pain30.length} ${pain30.length === 1 ? 'entry' : 'entries'}`
    if (avg30 != null) painLine += ` averaging ${avg30}/10`
    if (flares30.length > 0) painLine += `, with ${flares30.length} flare${flares30.length !== 1 ? 's' : ''} that hit 7 or above`
    painLine += '.'
    if (areas30.length) painLine += ` The worst areas have been ${listSentence(areas30)}.`
    if (types30.length) painLine += ` Pain has been mostly ${listSentence(types30)} in character.`
    bodyLines.push(painLine)
  } else if (d.painRows.length > 0) {
    bodyLines.push('No pain logged in the past 30 days (earlier data exists in the app).')
  }

  if (symp30.length > 0) {
    let sympLine = `I also had ${symp30.length} symptom episode${symp30.length !== 1 ? 's' : ''}`
    if (symp30Top.length) sympLine += `, most involving ${listSentence(symp30Top)}`
    sympLine += '.'
    bodyLines.push(sympLine)
  }

  // --- WHAT I NEED TO ADDRESS TODAY ---
  const concerns: string[] = []
  if (flares30.length >= 2) {
    concerns.push(
      `My flares — ${flares30.length} episode${flares30.length !== 1 ? 's' : ''} at 7+/10 that feel uncontrolled`,
    )
  }
  if (symp30Top.length) {
    const recurring = symp30Top.slice(0, 2)
    if (recurring.length) concerns.push(`The recurring ${listSentence(recurring)}`)
  }
  const pendingTests = d.testRows.filter((t) => String(t.status ?? '') === 'Pending')
  for (const t of pendingTests.slice(0, 3)) {
    concerns.push(`${t.test_name} still pending`)
  }
  const recentMedChange = d.medChangeEvents.filter((e) => e.event_date >= addDaysIso(d.todayIso, -14))
  if (recentMedChange.length) {
    concerns.push(`Recent medication change${recentMedChange.length > 1 ? 's' : ''} — checking for early response`)
  }
  const highQs = d.qList.filter((q) => String(q.priority ?? '').toLowerCase() === 'high')
  if (highQs.length) {
    concerns.push(`${highQs.length} high-priority question${highQs.length !== 1 ? 's' : ''} to cover`)
  }

  // --- RECENT VISITS ---
  const visitLines = d.visitRows.slice(0, 5).map((v) => {
    let line = `${v.visit_date} — Dr. ${String(v.doctor || 'Provider')}`
    if (v.specialty) line += ` (${v.specialty})`
    if (v.reason) line += `: ${v.reason}`
    if (v.instructions) line += `. ${v.instructions}`
    if (v.follow_up) line += `. Follow-up ${v.follow_up}`
    return line
  })

  // --- RECENT RESULTS ---
  const completedTests = d.testRows.filter((t) => String(t.status ?? '') !== 'Pending').slice(0, 5)
  const resultLines = completedTests.map((t) => {
    let line = `${String(t.test_name || '—')} completed ${t.test_date ? formatDate(String(t.test_date)) : ''}`
    if (t.results) line += `: ${t.results}`
    return line
  })

  // --- MEDICATION CHANGES & SYMPTOM TREND ---
  const corrLines = buildMedSymptomCorrelationLines(d.medChangeEvents, d.painRows, d.sympRows, 21)
  const corrText = corrLines.map((c) => c.line)

  // --- MY QUESTIONS FOR YOU ---
  const qLines = d.qList.slice(0, 10).map((q) => {
    let line = String(q.question ?? '')
    if (q.priority && String(q.priority).toLowerCase() !== 'normal') line += ` [${q.priority}]`
    if (q.doctor) line += ` (re: ${q.doctor})`
    return line
  })

  // --- ASSEMBLE ---
  const parts: string[] = []

  parts.push(`Health Summary — ${displayDate}`)
  parts.push('')
  parts.push(openingLines.join(' '))
  if (bodyLines.length) parts.push(bodyLines.join(' '))

  if (concerns.length) {
    parts.push('')
    parts.push('What I need to address today')
    for (const c of concerns) parts.push(`  • ${c}`)
  }

  if (visitLines.length) {
    parts.push('')
    parts.push('Recent visits')
    for (const v of visitLines) parts.push(`  • ${v}`)
  }

  if (resultLines.length) {
    parts.push('')
    parts.push('Recent results')
    for (const r of resultLines) parts.push(`  • ${r}`)
  }

  if (corrText.length) {
    parts.push('')
    parts.push('Medication changes & what happened')
    for (const c of corrText) parts.push(`  • ${c}`)
  }

  if (qLines.length) {
    parts.push('')
    parts.push('My questions for you')
    for (const q of qLines) parts.push(`  • ${q}`)
    if (d.qList.length > 10) parts.push(`  • (${d.qList.length - 10} more in app)`)
  } else {
    parts.push('')
    parts.push('My questions for you')
    parts.push('  • None flagged yet.')
  }

  return parts.join('\n')
}
