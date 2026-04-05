/**
 * App-generated clinical handoff: interpretive snapshot + active concerns + reference sections.
 * Designed for a quick provider skim (verbal handoff shape).
 */

import {
  type MedChangeEvent,
  buildMedSymptomCorrelationLines,
  formatCorrelationBlock,
  isPrnFrequency,
} from './medSymptomCorrelation'

function addDaysIso (iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  return d.toISOString().slice(0, 10)
}

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

function painSeverityLabel (avg: number | null): string {
  if (avg == null) return 'not numerically summarized'
  if (avg >= 7) return 'high'
  if (avg >= 4) return 'moderate'
  return 'mild'
}

function splitWindowTrend (
  painRows: Record<string, unknown>[],
  sympRows: Record<string, unknown>[],
  pivotIso: string,
): {
  earlyPainAvg: number | null
  latePainAvg: number | null
  earlyEp: number
  lateEp: number
} {
  const painNumsEarly = painRows
    .filter((r) => String(r.entry_date) < pivotIso)
    .map((r) => r.intensity)
    .filter((x): x is number => typeof x === 'number')
  const painNumsLate = painRows
    .filter((r) => String(r.entry_date) >= pivotIso)
    .map((r) => r.intensity)
    .filter((x): x is number => typeof x === 'number')
  const earlyPainAvg = painNumsEarly.length
    ? Math.round((painNumsEarly.reduce((a, b) => a + b, 0) / painNumsEarly.length) * 10) / 10
    : null
  const latePainAvg = painNumsLate.length
    ? Math.round((painNumsLate.reduce((a, b) => a + b, 0) / painNumsLate.length) * 10) / 10
    : null
  const earlyEp = sympRows.filter((r) => String(r.episode_date) < pivotIso).length
  const lateEp = sympRows.filter((r) => String(r.episode_date) >= pivotIso).length
  return { earlyPainAvg, latePainAvg, earlyEp, lateEp }
}

export function buildHandoffNarrative (d: HandoffNarrativeInput): string {
  const sections: string[] = []
  const hasPain = d.painRows.length > 0
  const hasSymp = d.sympRows.length > 0
  const hasMeds = d.medList.length > 0
  const hasDiag = d.diagRows.length > 0
  const hasVisits = d.visitRows.length > 0
  const pendingTests = d.testRows.filter((t) => t.status === 'Pending')
  const flares = d.painRows.filter((r) => typeof r.intensity === 'number' && (r.intensity as number) >= 7)

  const pivot = addDaysIso(d.todayIso, -45)
  const trend = splitWindowTrend(d.painRows, d.sympRows, pivot)
  const painWorse = trend.earlyPainAvg != null && trend.latePainAvg != null && trend.latePainAvg > trend.earlyPainAvg + 0.9
  const painBetter = trend.earlyPainAvg != null && trend.latePainAvg != null && trend.latePainAvg < trend.earlyPainAvg - 0.9
  const sympWorse = trend.lateEp >= 4 && trend.lateEp > trend.earlyEp * 1.4 + 1
  const sympBetter = trend.earlyEp >= 4 && trend.lateEp < trend.earlyEp * 0.6

  // --- 1. PATIENT SNAPSHOT (3–5 sentences, "so what") ---
  const snap: string[] = []
  if (!hasPain && !hasSymp && !hasDiag && !hasMeds) {
    snap.push('Limited tracking data is in the app so far; add visits, meds, and logs to make this handoff meaningful.')
  } else {
    if (hasDiag) {
      const dx = d.diagRows
        .filter((row) => {
          const st = String(row.status ?? '').toLowerCase()
          return !st || st === 'active' || st === 'confirmed' || st === 'suspected'
        })
        .slice(0, 5)
        .map((row) => String(row.diagnosis))
      if (dx.length) snap.push(`Patient tracking ${dx.join(', ')}${dx.length < d.diagRows.length ? ' (and other dx in app)' : ''}.`)
      else snap.push(`Patient lists ${d.diagRows.length} diagnosis${d.diagRows.length !== 1 ? 'es' : ''} in the app directory.`)
    }
    if (hasMeds) {
      const medBits = d.medList.slice(0, 8).map((m) => {
        let s = String(m.medication ?? '')
        if (m.dose) s += ` ${m.dose}`
        if (m.frequency) {
          s += ` ${m.frequency}`
          if (isPrnFrequency(String(m.frequency))) s += ' (PRN)'
        }
        return s
      })
      snap.push(`Current meds include ${medBits.join(', ')}${d.medList.length > 8 ? ', …' : ''}.`)
    }
    if (hasPain) {
      const sev = painSeverityLabel(d.painAvg)
      let s = `${d.painRows.length} pain logs in ~90d, avg ${d.painAvg ?? '—'}/10 (${sev})`
      if (d.painTopAreas.length) s += `, mainly ${d.painTopAreas.slice(0, 3).map((a) => a.area).join(', ')}`
      if (flares.length) s += `, with ${flares.length} high-intensity flare${flares.length !== 1 ? 's' : ''} (7–10/10)`
      if (d.painTopTypes.length) s += `; common quality: ${d.painTopTypes.slice(0, 2).map((t) => t.type).join(', ')}`
      s += '.'
      snap.push(s)
    }
    if (hasSymp) {
      const top = d.topSymptoms.slice(0, 4).map((x) => x.symptom).join(', ')
      snap.push(`${d.sympRows.length} symptom episode${d.sympRows.length !== 1 ? 's' : ''} in the window${top ? ` — commonly ${top}` : ''}.`)
    }
    const pend = [] as string[]
    if (pendingTests.length) pend.push(`${pendingTests.length} pending test${pendingTests.length !== 1 ? 's' : ''}`)
    if (d.qList.length) pend.push(`${d.qList.length} open question${d.qList.length !== 1 ? 's' : ''}`)
    if (pend.length) snap.push(`${pend.join('; ')}.`)
  }
  while (snap.length > 5) snap.pop()
  sections.push('1. PATIENT SNAPSHOT\n' + snap.join(' '))

  // --- 2. ACTIVE CONCERNS (what needs attention today) ---
  const concerns: string[] = []
  if (painWorse) {
    concerns.push(`Pain average worsened in the more recent half of this period (~${trend.earlyPainAvg} → ~${trend.latePainAvg}/10).`)
  } else if (painBetter && hasPain) {
    concerns.push(`Pain average improved in the more recent half of this period (~${trend.earlyPainAvg} → ~${trend.latePainAvg}/10) — confirm if sustained.`)
  }
  if (sympWorse) concerns.push(`Symptom episodes increased in the more recent half (${trend.earlyEp} → ${trend.lateEp}) — symptoms may be undertreated or evolving.`)
  if (sympBetter && hasSymp) concerns.push(`Symptom episodes decreased recently (${trend.earlyEp} → ${trend.lateEp}) — worth confirming what helped.`)
  if (flares.length >= 3) {
    concerns.push(`${flares.length} logged pain flare${flares.length !== 1 ? 's' : ''} at 7+/10 — review triggers and breakthrough plan.`)
  }
  if (pendingTests.length) {
    concerns.push(`Outstanding workup: ${pendingTests.map((t) => String(t.test_name)).join(', ')}.`)
  }
  const highQs = d.qList.filter((q) => String(q.priority ?? '').toLowerCase() === 'high')
  if (highQs.length) {
    concerns.push(`${highQs.length} high-priority unanswered question${highQs.length !== 1 ? 's' : ''} in the app.`)
  } else if (d.qList.length >= 5) {
    concerns.push(`${d.qList.length} open questions — prioritize what to cover this visit.`)
  }
  const recentChange = d.medChangeEvents.filter((e) => e.event_date >= addDaysIso(d.todayIso, -14))
  if (recentChange.length) {
    concerns.push(`Recent medication change (${recentChange.length} event${recentChange.length !== 1 ? 's' : ''} in last 14d) — check tolerance, adherence, and early response.`)
  }
  if (concerns.length === 0) {
    concerns.push(hasPain || hasSymp ? 'No strong automated “red flag” pattern from app data in this window — use visit time for routine review and patient priorities.' : 'Add symptom/pain logs to surface trends and active concerns automatically.')
  }
  sections.push('2. ACTIVE CONCERNS (address today)\n' + concerns.map((c) => `• ${c}`).join('\n'))

  // --- 3. CURRENT TREATMENT (reference) ---
  const medLines: string[] = []
  if (hasMeds) {
    d.medList.forEach((m) => {
      let line = `• ${m.medication}`
      if (m.dose) line += ` — ${m.dose}`
      if (m.frequency) {
        line += `, ${m.frequency}`
        if (isPrnFrequency(String(m.frequency))) line += ' (PRN / as-needed)'
      }
      if (m.start_date) line += ` | start ${m.start_date}`
      if (m.effectiveness) line += ` | effectiveness (patient notes): ${m.effectiveness}`
      if (m.purpose) line += ` | indication: ${m.purpose}`
      medLines.push(line)
    })
  } else {
    medLines.push('• No medications listed in the app.')
  }
  const diagLines: string[] = []
  if (hasDiag) {
    d.diagRows.forEach((row) => {
      let line = `• ${row.diagnosis} — ${row.status ?? '—'}`
      if (row.date_diagnosed) line += ` (${row.date_diagnosed})`
      if (row.doctor) line += ` · ${row.doctor}`
      diagLines.push(line)
    })
  } else {
    diagLines.push('• None in diagnoses directory.')
  }
  sections.push(
    '3. CURRENT TREATMENT\n'
    + 'Medications:\n'
    + medLines.join('\n')
    + '\nDiagnoses:\n'
    + diagLines.join('\n'),
  )

  // --- 4. RECENT VISITS & FOLLOW-UP ---
  let visits = '4. RECENT VISITS & FOLLOW-UP\n'
  if (hasVisits) {
    visits += d.visitRows.slice(0, 4).map((v) => {
      let line = `• ${v.visit_date} · ${v.doctor || 'Provider'}`
      if (v.specialty) line += ` (${v.specialty})`
      if (v.reason) line += ` — ${v.reason}`
      if (v.tests_ordered) line += ` | ordered: ${v.tests_ordered}`
      if (v.instructions) line += ` | plan: ${v.instructions}`
      if (v.follow_up) line += ` | follow-up: ${v.follow_up}`
      return line
    }).join('\n')
    if (d.visitRows.length > 4) visits += `\n• (${d.visitRows.length - 4} more in app)`
  } else {
    visits += '• No visits logged in this window.'
  }
  const nonPend = d.testRows.filter((t) => t.status !== 'Pending').slice(0, 4)
  if (nonPend.length) {
    visits += '\nRecent results / completed orders:\n' + nonPend.map((t) =>
      `• ${t.test_name} (${t.test_date}) — ${t.status}${t.results ? `: ${t.results}` : ''}`).join('\n')
  }
  sections.push(visits)

  // --- 5. MEDICATION CHANGES & SYMPTOM CORRELATION (loose, app-log-based) ---
  const corrLines = buildMedSymptomCorrelationLines(d.medChangeEvents, d.painRows, d.sympRows, 21)
  sections.push('5. MEDICATION CHANGES & SYMPTOM TREND (approx. 3 weeks before vs after each event)\n' + formatCorrelationBlock(corrLines))

  // --- 6. MY QUESTIONS FOR YOU (last) ---
  let qs = '6. MY QUESTIONS FOR YOU\n'
  if (d.qList.length) {
    qs += d.qList.slice(0, 8).map((q) => {
      let line = `• ${q.question}`
      if (q.priority) line += ` [${q.priority}]`
      if (q.doctor) line += ` (re: ${q.doctor})`
      return line
    }).join('\n')
    if (d.qList.length > 8) qs += `\n• (${d.qList.length - 8} more in app)`
  } else {
    qs += '• None flagged in the app.'
  }
  sections.push(qs)

  return sections.join('\n\n')
}
