/**
 * App-generated clinical handoff narrative.
 *
 * Design goals:
 *  - Open with a prose "clinical snapshot" so a provider can read one paragraph
 *    and understand the patient's current state.
 *  - No redundant sections: each data point appears once.
 *  - Structured sections use concise bullets; the snapshot is narrative prose.
 *  - Respects diagnosis status (suspected vs confirmed).
 */

import {
  type MedChangeEvent,
  buildMedSymptomCorrelationLines,
  isPrnFrequency,
} from './medSymptomCorrelation'

export type HandoffNarrativeInput = {
  todayIso: string
  /** Optional: patient-entered priority for the next appointment (handoff modal). */
  patientFocus?: string | null
  painRows: Record<string, unknown>[]
  sympRows: Record<string, unknown>[]
  medList: Record<string, unknown>[]
  testRows: Record<string, unknown>[]
  diagRows: Record<string, unknown>[]
  visitRows: Record<string, unknown>[]
  qList: Record<string, unknown>[]
  medChangeEvents: MedChangeEvent[]
  medChangeEventsLoadError?: string | null
  painAvg: number | null
  painTopAreas: { area: string; n: number }[]
  painTopTypes: { type: string; n: number }[]
  topSymptoms: { symptom: string; n: number }[]
}

/* ── helpers ── */

function addDaysIso (iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

function fmtDate (iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

function listSentence (items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function shortDiag (raw: string): string {
  const s = raw.trim()
  const p = s.indexOf('(')
  return p > 0 ? s.slice(0, p).trim() : s
}

function norm (s: string): string { return s.trim().toLowerCase() }

function topFromField (rows: Record<string, unknown>[], field: string, n = 3): string[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const v = r[field]
    if (typeof v !== 'string') continue
    for (const tok of v.split(',').map((s) => s.trim()).filter(Boolean))
      map.set(tok, (map.get(tok) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
}

function pct (n: number, d: number): string {
  return d === 0 ? '—' : `${Math.round((n / d) * 100)}%`
}

function plural (n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? 's' : ''}`
}

/* ── diagnosis helpers ── */

type DiagPhrase = { name: string; label: string }

function diagPhrases (rows: Record<string, unknown>[]): DiagPhrase[] {
  const out: DiagPhrase[] = []
  for (const r of rows) {
    const st = norm(String(r.status ?? ''))
    if (st === 'ruled out' || st === 'resolved') continue
    const name = shortDiag(String(r.diagnosis ?? ''))
    if (!name) continue
    if (st === 'confirmed') out.push({ name, label: `${name} (confirmed)` })
    else out.push({ name, label: `suspected ${name}` })
  }
  return out
}

/* ── main builder ── */

export function buildHandoffNarrative (d: HandoffNarrativeInput): string {
  const since30 = addDaysIso(d.todayIso, -30)
  const since14 = addDaysIso(d.todayIso, -14)

  const pain30 = d.painRows.filter((r) => String(r.entry_date ?? '') >= since30)
  const symp30 = d.sympRows.filter((r) => String(r.episode_date ?? '') >= since30)
  const symp14 = d.sympRows.filter((r) => String(r.episode_date ?? '') >= since14)

  const intensities = pain30.map((r) => r.intensity).filter((x): x is number => typeof x === 'number')
  const avgPain = intensities.length
    ? Math.round((intensities.reduce((a, b) => a + b, 0) / intensities.length) * 10) / 10
    : null
  const flares = pain30.filter((r) => typeof r.intensity === 'number' && (r.intensity as number) >= 7)

  const areas = topFromField(pain30, 'location', 4).length
    ? topFromField(pain30, 'location', 4)
    : d.painTopAreas.slice(0, 4).map((a) => a.area)
  const painTypes = topFromField(pain30, 'pain_type', 3).length
    ? topFromField(pain30, 'pain_type', 3)
    : d.painTopTypes.slice(0, 3).map((t) => t.type)
  const sympTop = topFromField(symp30, 'symptoms', 4).length
    ? topFromField(symp30, 'symptoms', 4)
    : d.topSymptoms.slice(0, 4).map((s) => s.symptom)

  const pendingTests = d.testRows.filter((t) => String(t.status ?? '') === 'Pending')
  const completedTests = d.testRows.filter((t) => norm(String(t.status ?? '')) === 'completed')
  const dx = diagPhrases(d.diagRows)

  const parts: string[] = []

  // ─── HEADER ───
  parts.push(`PATIENT HEALTH SUMMARY  —  ${fmtDate(d.todayIso)}`)

  // ─── CLINICAL SNAPSHOT (prose paragraph) ───
  parts.push('')
  parts.push('CLINICAL SNAPSHOT')
  parts.push(buildSnapshot(d, dx, pain30, symp30, avgPain, flares, areas, sympTop, pendingTests))

  const focus = typeof d.patientFocus === 'string' ? d.patientFocus.trim() : ''
  if (focus) {
    parts.push('')
    parts.push('PRIORITY FOR NEXT VISIT')
    parts.push(`  • ${focus}`)
  }

  // ─── ACTIVE CONDITIONS ───
  if (dx.length > 0) {
    parts.push('')
    parts.push('ACTIVE CONDITIONS')
    for (const { name, label } of dx) {
      const doc = d.diagRows.find((r) => shortDiag(String(r.diagnosis ?? '')) === name && r.doctor)
      const docStr = doc?.doctor ? `  (${doc.doctor})` : ''
      parts.push(`  • ${label}${docStr}`)
    }
  }

  // ─── PAIN & EPISODE TRENDS ───
  parts.push('')
  parts.push('PAIN & EPISODE TRENDS  (last 30 days)')
  if (pain30.length === 0 && symp30.length === 0) {
    parts.push('  • No pain or episode logs in this window.')
  } else {
    if (pain30.length > 0) {
      parts.push(`  • ${plural(pain30.length, 'pain entry')}${avgPain != null ? `, average intensity ${avgPain}/10` : ''}`)
      if (flares.length) parts.push(`  • ${plural(flares.length, 'flare')} at 7+/10${areas.length ? ` — worst areas: ${listSentence(areas)}` : ''}`)
      else if (areas.length) parts.push(`  • Primary areas: ${listSentence(areas)}`)
      if (painTypes.length) parts.push(`  • Pain character: ${listSentence(painTypes)}`)
    }
    if (symp30.length > 0) {
      parts.push(`  • ${plural(symp30.length, 'symptom episode')} (${plural(symp14.length, 'episode')} in the last 2 weeks)`)
      if (sympTop.length) parts.push(`  • Most common features: ${listSentence(sympTop)}`)
      const reliefTokens = symp30.flatMap((r) => typeof r.relief === 'string' ? [r.relief] : [])
      const antihistamine = reliefTokens.filter((t) => /benadryl|diphenhydramine|antihistamine/i.test(t)).length
      const rest = reliefTokens.filter((t) => /rest|sleep|lying/i.test(t)).length
      if (antihistamine + rest > 0)
        parts.push(`  • Relief noted from ${[antihistamine > 0 ? 'antihistamines' : '', rest > 0 ? 'rest' : ''].filter(Boolean).join(' and ')} in ${pct(antihistamine + rest, symp30.length)} of episodes`)
    }
  }

  // ─── MEDICATIONS (current list + outcomes merged) ───
  parts.push('')
  parts.push('MEDICATIONS')
  if (d.medList.length === 0 && !d.medChangeEventsLoadError) {
    parts.push('  • None listed.')
  } else {
    // Build a map of medication name → correlation outcome line for quick lookup
    const corrLines = d.medChangeEventsLoadError
      ? []
      : buildMedSymptomCorrelationLines(d.medChangeEvents, d.painRows, d.sympRows, 21)
    const outcomeMap = new Map<string, string>()
    for (const cl of corrLines) {
      outcomeMap.set(cl.event.medication.toLowerCase(), cl.line)
    }

    for (const m of d.medList) {
      const med = String(m.medication ?? '')
      const bits = [m.dose, m.frequency]
        .map(String)
        .filter((s) => s && s !== 'undefined' && s !== 'null')
        .join(' · ')
      const prn = m.frequency && isPrnFrequency(String(m.frequency)) ? ' (PRN)' : ''
      const purpose = m.purpose ? ` — for ${m.purpose}` : ''
      const eff = m.effectiveness ? ` — effectiveness: ${m.effectiveness}` : ''
      // Strip the "Med · dose · freq · started date — " prefix from the outcome line
      // so we only keep the plain-English outcome sentence inline
      const outcomeFull = outcomeMap.get(med.toLowerCase())
      let outcomeSuffix = ''
      if (outcomeFull) {
        const dashIdx = outcomeFull.indexOf(' — ')
        if (dashIdx !== -1) outcomeSuffix = `  →  ${outcomeFull.slice(dashIdx + 3)}`
        outcomeMap.delete(med.toLowerCase())
      }
      parts.push(`  • ${med}${bits ? ` · ${bits}` : ''}${prn}${purpose}${eff}${outcomeSuffix}`)
    }

    // Any correlation lines for meds not in the current list (e.g. stopped meds)
    for (const cl of corrLines) {
      if (outcomeMap.has(cl.event.medication.toLowerCase())) {
        parts.push(`  • ${cl.line}`)
      }
    }

    if (d.medChangeEventsLoadError) {
      parts.push(`  • Unable to load change history: ${d.medChangeEventsLoadError}`)
      parts.push('  • Run migration 20250406200000_med_change_events_rpc.sql in Supabase SQL Editor to fix this.')
    }
  }

  // ─── PENDING TESTS ───
  if (pendingTests.length > 0) {
    parts.push('')
    parts.push('PENDING TESTS & ORDERS')
    for (const t of pendingTests.slice(0, 8)) {
      const doc = t.ordered_by ? ` (ordered by ${t.ordered_by})` : ''
      parts.push(`  • ${t.test_name}${t.test_date ? ` · ordered ${fmtDate(String(t.test_date))}` : ''}${doc}`)
    }
    if (pendingTests.length > 8) parts.push(`  • … and ${pendingTests.length - 8} more`)
  }

  // ─── RECENT RESULTS ───
  if (completedTests.length > 0) {
    parts.push('')
    parts.push('RECENT RESULTS')
    for (const t of completedTests.slice(0, 5)) {
      parts.push(`  • ${t.test_name}${t.test_date ? ` · ${fmtDate(String(t.test_date))}` : ''} — completed`)
    }
  }

  // ─── RECENT VISITS ───
  if (d.visitRows.length > 0) {
    parts.push('')
    parts.push('RECENT VISITS')
    for (const v of d.visitRows.slice(0, 5)) {
      let line = `  • ${fmtDate(String(v.visit_date))} — ${String(v.doctor || 'Provider')}`
      if (v.specialty) line += ` (${v.specialty})`
      if (v.reason) line += `: ${v.reason}`
      if (v.instructions) line += `\n    Instructions: ${v.instructions}`
      if (v.follow_up) line += `\n    Follow-up: ${v.follow_up}`
      parts.push(line)
    }
  }

  // ─── QUESTIONS FOR PROVIDER ───
  if (d.qList.length > 0) {
    parts.push('')
    parts.push('QUESTIONS FOR MY CARE TEAM')
    d.qList.slice(0, 12).forEach((q, i) => {
      const doc = q.doctor ? ` (for ${q.doctor})` : ''
      const pri = q.priority ? ` [${q.priority}]` : ''
      parts.push(`  ${i + 1}. ${q.question}${doc}${pri}`)
    })
    if (d.qList.length > 12) parts.push(`  … and ${d.qList.length - 12} more in app`)
  }

  return parts.join('\n')
}

/* ── Prose clinical snapshot builder ── */

function buildSnapshot (
  d: HandoffNarrativeInput,
  dx: DiagPhrase[],
  pain30: Record<string, unknown>[],
  symp30: Record<string, unknown>[],
  avgPain: number | null,
  flares: Record<string, unknown>[],
  areas: string[],
  sympTop: string[],
  pendingTests: Record<string, unknown>[],
): string {
  const sentences: string[] = []

  // Diagnosis sentence
  if (dx.length > 0) {
    const confirmed = dx.filter((d) => !d.label.startsWith('suspected'))
    const suspected = dx.filter((d) => d.label.startsWith('suspected'))
    const confPart = confirmed.length ? `with ${listSentence(confirmed.map((d) => d.name))}` : ''
    const suspPart = suspected.length ? `being evaluated for ${listSentence(suspected.map((d) => d.name))}` : ''
    const joiner = confPart && suspPart ? ' and ' : ''
    sentences.push(`Patient ${confPart}${joiner}${suspPart}.`)
  } else {
    sentences.push('Patient is tracking health data for ongoing evaluation.')
  }

  // Pain sentence
  if (pain30.length > 0 && avgPain != null) {
    let painSent = `Over the past 30 days, ${plural(pain30.length, 'pain entry')} logged with an average intensity of ${avgPain}/10`
    if (flares.length > 0) painSent += `, including ${plural(flares.length, 'severe flare')} (7+/10)`
    if (areas.length > 0) painSent += `, primarily affecting the ${listSentence(areas)}`
    sentences.push(painSent + '.')
  }

  // Episode sentence
  if (symp30.length > 0) {
    let epSent = `${plural(symp30.length, 'symptom episode')} recorded in the last 30 days`
    if (sympTop.length > 0) epSent += `, most frequently involving ${listSentence(sympTop)}`
    sentences.push(epSent + '.')
  }

  // Action items sentence
  const actionParts: string[] = []
  if (pendingTests.length > 0) actionParts.push(`${plural(pendingTests.length, 'pending test')}`)
  if (d.qList.length > 0) actionParts.push(`${plural(d.qList.length, 'unanswered question')} for the care team`)
  if (actionParts.length > 0) sentences.push(`Action items: ${listSentence(actionParts)}.`)

  // Trend sentence — descriptive only (no treatment or medication advice)
  if (flares.length >= 3) {
    sentences.push('Pain flares at 7+/10 were logged frequently in this window.')
  } else if (avgPain != null && avgPain >= 6) {
    sentences.push('Average reported pain in logs was elevated in this period.')
  } else if (pain30.length > 0 && avgPain != null && avgPain <= 3 && flares.length === 0) {
    sentences.push('Logged pain levels were mostly lower in this period, without 7+/10 flares.')
  }

  // One sentence per line so the snapshot is scannable, not a wall of text
  return sentences.join('\n')
}
