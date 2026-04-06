/**
 * App-generated clinical handoff — first-person, PDF-aligned structure.
 * Respects diagnosis status (suspected vs confirmed). Uses "episode" language for MCAS rows.
 */

import {
  type MedChangeEvent,
  buildMedSymptomCorrelationLines,
  formatCorrelationBlock,
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
  /** When the DB query for medication_change_events failed (RLS, missing table, etc.) */
  medChangeEventsLoadError?: string | null
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

function shortDiagName (raw: string): string {
  const s = raw.trim()
  const paren = s.indexOf('(')
  if (paren > 0) return s.slice(0, paren).trim()
  return s
}

function normStatus (s: string): string {
  return s.trim().toLowerCase()
}

/** Diagnosis clause: "suspected POTS", "EDS (confirmed)", etc. */
function buildDiagnosisAboutMePhrases (diagRows: Record<string, unknown>[]): string[] {
  const phrases: string[] = []
  for (const r of diagRows) {
    const st = normStatus(String(r.status ?? ''))
    if (st === 'ruled out' || st === 'resolved') continue
    const name = shortDiagName(String(r.diagnosis ?? ''))
    if (!name) continue
    if (st === 'suspected' || st === 'active' || !st) phrases.push(`suspected ${name}`)
    else if (st === 'confirmed') phrases.push(`${name} (confirmed)`)
    else phrases.push(`suspected ${name}`)
  }
  return phrases
}

function topFromField (rows: Record<string, unknown>[], field: string, n = 3): string[] {
  const items = rows.flatMap((r) => {
    const v = r[field]
    return typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []
  })
  const map = new Map<string, number>()
  for (const it of items) map.set(it, (map.get(it) ?? 0) + 1)
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
}

function pct (n: number, d: number): string {
  if (d === 0) return '—'
  return `${Math.round((n / d) * 100)}%`
}

function episodeStats14d (sympRows: Record<string, unknown>[], sinceIso: string): string[] {
  const rows = sympRows.filter((r) => String(r.episode_date ?? '') >= sinceIso)
  if (rows.length === 0) return ['No episodes logged in the last 2 weeks.']
  const bullets: string[] = []
  bullets.push(`${rows.length} episode${rows.length !== 1 ? 's' : ''} total`)
  // symptom token frequency across episodes
  const tokenCounts = new Map<string, number>()
  for (const r of rows) {
    const sy = r.symptoms
    const tokens = typeof sy === 'string'
      ? sy.split(',').map((s) => s.trim()).filter(Boolean)
      : []
    const uniq = new Set(tokens)
    for (const t of uniq) tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1)
  }
  const topTok = [...tokenCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  for (const [tok, c] of topTok) {
    bullets.push(`${tok} present in ${pct(c, rows.length)} of episodes`)
  }
  const withActivity = rows.filter((r) => String(r.activity ?? '').trim().length > 0).length
  if (withActivity > 0) bullets.push(`${pct(withActivity, rows.length)} of episodes note context about activity or recent doing`)
  const reliefBenadryl = rows.filter((r) => /benadryl|diphenhydramine/i.test(String(r.relief ?? ''))).length
  const reliefRest = rows.filter((r) => /rest|sleep/i.test(String(r.relief ?? ''))).length
  if (reliefBenadryl + reliefRest > 0) {
    bullets.push(`${pct(reliefBenadryl + reliefRest, rows.length)} improved with antihistamine-like med or rest (from relief notes)`)
  }
  return bullets
}

export function buildHandoffNarrative (d: HandoffNarrativeInput): string {
  const since30 = addDaysIso(d.todayIso, -30)
  const since14 = addDaysIso(d.todayIso, -14)

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

  const areas30 = topFromField(pain30, 'location').length
    ? topFromField(pain30, 'location', 4)
    : d.painTopAreas.slice(0, 4).map((a) => a.area)
  const types30 = topFromField(pain30, 'pain_type', 3).length
    ? topFromField(pain30, 'pain_type', 3)
    : d.painTopTypes.slice(0, 3).map((t) => t.type)
  const symp30Top = topFromField(symp30, 'symptoms', 4).length
    ? topFromField(symp30, 'symptoms', 4)
    : d.topSymptoms.slice(0, 4).map((s) => s.symptom)

  const displayDate = formatDate(d.todayIso)

  const dxPhrases = buildDiagnosisAboutMePhrases(d.diagRows)
  const aboutDx = dxPhrases.length
    ? `I have ${listSentence(dxPhrases)}.`
    : 'I am tracking conditions in the app (add diagnoses with status for a clearer opening line).'

  const medLines = d.medList.slice(0, 10).map((m) => {
    const s = String(m.medication ?? '')
    const dose = m.dose ? String(m.dose) : ''
    const freq = m.frequency ? String(m.frequency) : ''
    const bits = [dose, freq].filter(Boolean).join(' · ')
    const prn = freq && isPrnFrequency(freq) ? ' (PRN)' : ''
    return bits ? `${s} · ${bits}${prn}` : s
  })
  const medSentence = medLines.length
    ? `I'm currently taking ${medLines.join('; ')}${d.medList.length > 10 ? '; and others' : ''}.`
    : null

  const recentAdj = d.medChangeEvents.filter((e) => e.event_type === 'adjustment').slice(0, 2)
  const medChangeSentence = recentAdj.length
    ? recentAdj.map((e) => {
      const from = e.dose_previous ?? '—'
      const to = e.dose_new ?? '—'
      return `My ${e.medication} was adjusted (${from} → ${to}) on ${formatDate(e.event_date)}.`
    }).join(' ')
    : null

  const parts: string[] = []
  parts.push(`Health Summary — ${displayDate}`)
  parts.push('')
  parts.push('About me')
  parts.push(`  • ${aboutDx}`)
  if (medSentence) parts.push(`  • ${medSentence}`)
  if (medChangeSentence) parts.push(`  • ${medChangeSentence}`)

  parts.push('')
  parts.push('Episodes — last 2 weeks')
  for (const b of episodeStats14d(d.sympRows, since14)) parts.push(`  • ${b}`)

  parts.push('')
  parts.push('Pain — last 30 days')
  if (pain30.length > 0) {
    parts.push(`  • ${pain30.length} pain log${pain30.length !== 1 ? 's' : ''}${avg30 != null ? `, average ${avg30}/10` : ''}`)
    if (flares30.length) parts.push(`  • ${flares30.length} flare${flares30.length !== 1 ? 's' : ''} at 7+/10`)
    if (areas30.length) parts.push(`  • Worst areas: ${listSentence(areas30)}`)
    if (types30.length) parts.push(`  • Common character: ${listSentence(types30)}`)
  } else {
    parts.push('  • No pain logs in this window.')
  }

  if (symp30.length > 0) {
    parts.push(`  • ${symp30.length} episode${symp30.length !== 1 ? 's' : ''} in the same window`)
    if (symp30Top.length) parts.push(`  • Common episode features: ${listSentence(symp30Top)}`)
  }

  const concerns: string[] = []
  if (flares30.length) {
    concerns.push(`${flares30.length} pain flare${flares30.length !== 1 ? 's' : ''} at 7+/10 in the last 30 days${areas30.length ? ` — ${listSentence(areas30.slice(0, 3))}` : ''}`)
  }
  if (symp30Top.length >= 2) {
    concerns.push(`Recurring ${listSentence(symp30Top.slice(0, 2))} in many recent episodes`)
  }
  const pendingTests = d.testRows.filter((t) => String(t.status ?? '') === 'Pending')
  for (const t of pendingTests.slice(0, 4)) {
    concerns.push(`${String(t.test_name ?? 'Test')} still pending`)
  }
  const recentMedChange = d.medChangeEvents.filter((e) => e.event_date >= addDaysIso(d.todayIso, -14))
  if (recentMedChange.length) {
    concerns.push(`Recent medication change${recentMedChange.length > 1 ? 's' : ''} — early tolerance / effect to review`)
  }
  for (const q of d.qList.slice(0, 3)) {
    const doc = q.doctor ? ` for ${q.doctor}` : ''
    concerns.push(`Unanswered question${doc}: ${String(q.question ?? '').slice(0, 80)}${String(q.question ?? '').length > 80 ? '…' : ''}`)
  }

  if (concerns.length) {
    parts.push('')
    parts.push('What I need to address today')
    for (const c of concerns) parts.push(`  • ${c}`)
  }

  parts.push('')
  parts.push('Current medications')
  if (d.medList.length === 0) parts.push('  • None listed in the app.')
  else {
    for (const m of d.medList) {
      let line = `  • ${m.medication}`
      if (m.dose) line += ` · ${m.dose}`
      if (m.frequency) line += ` · ${m.frequency}`
      if (m.effectiveness) line += ` — effectiveness: ${m.effectiveness}`
      parts.push(line)
    }
  }

  parts.push('')
  parts.push('Tests & orders')
  if (d.testRows.length === 0) parts.push('  • None in the app.')
  else {
    for (const t of d.testRows.slice(0, 12)) {
      const st = String(t.status ?? '')
      parts.push(`  • ${t.test_name} · ${st}${t.test_date ? ` · ${formatDate(String(t.test_date))}` : ''}`)
    }
  }

  const corrBlock = d.medChangeEventsLoadError?.trim()
    ? `Could not load medication change history: ${d.medChangeEventsLoadError.trim()} Check your connection and that the medication_change_events table and migrations are applied on your Supabase project.`
    : formatCorrelationBlock(buildMedSymptomCorrelationLines(d.medChangeEvents, d.painRows, d.sympRows, 21))
  if (corrBlock.trim()) {
    parts.push('')
    parts.push('Medication changes & what happened')
    for (const line of corrBlock.split('\n').filter(Boolean)) {
      parts.push(`  ${line}`)
    }
  }

  parts.push('')
  parts.push('Recent visits')
  if (d.visitRows.length === 0) parts.push('  • None in the selected window.')
  else {
    for (const v of d.visitRows.slice(0, 6)) {
      let line = `  • ${formatDate(String(v.visit_date))} — ${String(v.doctor || 'Provider')}`
      if (v.specialty) line += ` (${v.specialty})`
      if (v.reason) line += `\n    ${v.reason}`
      if (v.instructions) line += `\n    ${v.instructions}`
      if (v.follow_up) line += `\n    Follow-up: ${v.follow_up}`
      parts.push(line)
    }
  }

  parts.push('')
  parts.push('My questions for you')
  if (d.qList.length === 0) parts.push('  • None flagged yet.')
  else {
    d.qList.slice(0, 15).forEach((q, i) => {
      parts.push(`  ${i + 1}. ${q.question}${q.doctor ? ` (re: ${q.doctor})` : ''}`)
    })
    if (d.qList.length > 15) parts.push(`  • (${d.qList.length - 15} more in app)`)
  }

  return parts.join('\n')
}
