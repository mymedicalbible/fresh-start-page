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
  /** Full handoff vs meds / pain / symptom interconnection only (quantified correlation focus). */
  scope?: 'full' | 'symptomsPainMeds'
  /** Stopped meds from medications_archive (past & present list). */
  archivedMeds?: Record<string, unknown>[]
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

/* ── main builder ── */

export function buildHandoffNarrative (d: HandoffNarrativeInput): string {
  if (d.scope === 'symptomsPainMeds') {
    return buildSymptomsPainMedsNarrative(d)
  }
  return buildPatientStoryNarrative(d)
}

function parseListField (text: string | null | undefined): string[] {
  if (!text) return []
  return text.split(',').map((s) => s.trim()).filter(Boolean)
}

function prescribedByFromNotes (notes: unknown): string | null {
  if (typeof notes !== 'string') return null
  const m = notes.match(/^\s*Prescribed by:\s*(.+)$/im)
  return m ? m[1].trim() : null
}

function medPurposeShortTag (purpose: string): string {
  const p = purpose.trim()
  if (!p) return 'medication'
  const low = p.toLowerCase()
  if (/\bpain\b|analges|opioid|morphine|nsaid|acetaminophen/i.test(low)) return 'pain med'
  if (/\bheart\b|blood pressure|beta|hypertension|bp\b/i.test(low)) return 'cardiac / BP med'
  if (p.length > 36) return `${p.slice(0, 33)}…`
  return p
}

function parseLooseTimeToHour (raw: string): number | null {
  const t = raw.trim().toLowerCase()
  if (!t) return null
  let m = t.match(/(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/)
  if (m) {
    let h = parseInt(m[1], 10)
    const ap = m[3]
    if (ap === 'p' && h < 12) h += 12
    if (ap === 'a' && h === 12) h = 0
    return h
  }
  m = t.match(/(\d{1,2})\s*([ap])\.?m\.?/)
  if (m) {
    let h = parseInt(m[1], 10)
    if (m[2] === 'p' && h < 12) h += 12
    if (m[2] === 'a' && h === 12) h = 0
    return h
  }
  m = t.match(/^(\d{1,2}):(\d{2})/)
  if (m) {
    const h = parseInt(m[1], 10)
    if (h >= 0 && h <= 23) return h
  }
  return null
}

function formatHour12 (h: number): string {
  const hr = ((h + 11) % 12) + 1
  const suf = h < 12 || h === 24 ? 'am' : 'pm'
  return `${hr}${suf}`
}

/** Best 3-hour window with most logged symptom times (needs several times logged). */
function inferPeakSymptomTimeWindow (symp30: Record<string, unknown>[]): string | null {
  const hours: number[] = []
  for (const r of symp30) {
    const h = parseLooseTimeToHour(String(r.symptom_time ?? ''))
    if (h != null) hours.push(h)
  }
  if (hours.length < 4) return null
  const hist = new Array(24).fill(0)
  for (const h of hours) hist[h]++
  let best = 0
  let bestStart = 17
  for (let start = 0; start <= 21; start++) {
    const sum = hist[start] + hist[start + 1] + hist[start + 2]
    if (sum > best) {
      best = sum
      bestStart = start
    }
  }
  const endH = bestStart + 3
  return `between ${formatHour12(bestStart)} and ${formatHour12(endH)}`
}

function painByLocationLines (pain30: Record<string, unknown>[]): { location: string; types: string[] }[] {
  const locToTypes = new Map<string, Set<string>>()
  const locCount = new Map<string, number>()
  for (const r of pain30) {
    const locs = parseListField(String(r.location ?? ''))
    const types = parseListField(String(r.pain_type ?? ''))
    const effectiveLocs = locs.length ? locs : []
    for (const loc of effectiveLocs) {
      locCount.set(loc, (locCount.get(loc) ?? 0) + 1)
      if (!locToTypes.has(loc)) locToTypes.set(loc, new Set())
      for (const ty of types) locToTypes.get(loc)!.add(ty)
    }
  }
  const rows = [...locToTypes.entries()].map(([location, set]) => ({
    location,
    types: [...set].sort((a, b) => a.localeCompare(b)),
    n: locCount.get(location) ?? 0,
  }))
  rows.sort((a, b) => b.n - a.n || a.location.localeCompare(b.location))
  return rows.map(({ location, types }) => ({ location, types }))
}

function formatDiagBullet (r: Record<string, unknown>): string {
  const name = shortDiag(String(r.diagnosis ?? ''))
  if (!name) return ''
  const st = norm(String(r.status ?? ''))
  const doc = r.doctor ? String(r.doctor).trim() : ''
  const dtRaw = r.date_diagnosed
  const dt = dtRaw ? fmtDate(String(dtRaw)) : ''
  const docPart = doc ? ` (${doc})` : ''
  const datePart = dt ? ` · ${dt}` : ''
  const resOn = r.date_resolved ? fmtDate(String(r.date_resolved)) : ''
  const ruledOn = r.date_ruled_out ? fmtDate(String(r.date_ruled_out)) : ''
  if (!st) return `${name}${docPart}${datePart}`
  if (st === 'confirmed') return `${name} (confirmed)${docPart}${datePart}`
  if (st === 'suspected' || st === 'suspect') return `Suspected: ${name}${docPart}${datePart}`
  if (st === 'ruled out' || st === 'ruled-out') {
    return `Ruled out: ${name}${docPart}${datePart}${ruledOn ? ` · ${ruledOn}` : ''}`
  }
  if (st === 'resolved') {
    return `Resolved: ${name}${docPart}${datePart}${resOn ? ` · ${resOn}` : ''}`
  }
  return `${name} (${st})${docPart}${datePart}`
}

function outcomeSentenceFromCorrelationLine (line: string): string {
  const dash = line.indexOf(' — ')
  return dash === -1 ? line : line.slice(dash + 3).trim()
}

function correlationToPatientMedNote (line: string, purpose: string): string {
  const left = line.indexOf(' — ') === -1 ? line : line.slice(0, line.indexOf(' — '))
  const medName = left.split(' · ')[0]?.trim() ?? left.trim()
  const tag = medPurposeShortTag(purpose)
  const outcome = outcomeSentenceFromCorrelationLine(line)
  const first = outcome.charAt(0).toLowerCase() + outcome.slice(1)
  return `${medName} (${tag}) → ${first}`
}

function buildPatientStoryNarrative (d: HandoffNarrativeInput): string {
  const since30 = addDaysIso(d.todayIso, -30)
  const since14 = addDaysIso(d.todayIso, -14)

  const pain30 = d.painRows.filter((r) => String(r.entry_date ?? '') >= since30)
  const symp30 = d.sympRows.filter((r) => String(r.symptom_date ?? '') >= since30)
  const symp14 = d.sympRows.filter((r) => String(r.symptom_date ?? '') >= since14)

  const intensities = pain30.map((r) => r.intensity).filter((x): x is number => typeof x === 'number')
  const avgPain = intensities.length
    ? Math.round((intensities.reduce((a, b) => a + b, 0) / intensities.length) * 10) / 10
    : null
  const flares = pain30.filter((r) => typeof r.intensity === 'number' && (r.intensity as number) >= 7)

  const sympTop = topFromField(symp30, 'symptoms', 8).length
    ? topFromField(symp30, 'symptoms', 8)
    : d.topSymptoms.slice(0, 8).map((s) => s.symptom)

  const archived = d.archivedMeds ?? []

  const parts: string[] = []
  parts.push(`PATIENT HEALTH SUMMARY  —  ${fmtDate(d.todayIso)}`)

  parts.push('')
  parts.push('ACTIVE CONDITIONS')
  const diagLines = (d.diagRows ?? []).map(formatDiagBullet).filter(Boolean)
  if (diagLines.length === 0) {
    parts.push('  • None recorded in the app.')
  } else {
    for (const line of diagLines) parts.push(`  • ${line}`)
  }

  parts.push('')
  parts.push('PAIN (LAST 30 DAYS)')
  if (pain30.length === 0) {
    parts.push('  • No pain entries in this window.')
  } else {
    parts.push(`  • ${plural(pain30.length, 'pain entry')} logged`)
    if (avgPain != null) parts.push(`  • Average pain level: ${avgPain} out of 10`)
    if (flares.length > 0) {
      parts.push(`  • Severe flares (7+/10): ${flares.length} time${flares.length !== 1 ? 's' : ''}`)
    }
    const locRows = painByLocationLines(pain30)
    if (locRows.length > 0) {
      parts.push('  • By area (pain types in brackets):')
      for (const { location, types } of locRows) {
        const typeStr = types.length ? `[${types.join(', ')}]` : '[type not specified]'
        parts.push(`    • ${location} ${typeStr}`)
      }
    } else {
      parts.push('  • No location details were specified on pain entries.')
    }
  }

  parts.push('')
  parts.push('SYMPTOMS (LAST 30 DAYS)')
  if (symp30.length === 0) {
    parts.push('  • No symptom logs in this window.')
  } else {
    parts.push(`  • ${plural(symp30.length, 'symptom log')} logged`)
    if (symp30.length > 0 && symp14.length * 2 >= symp30.length) {
      parts.push('  • Most were logged in the last 2 weeks')
    }
    if (sympTop.length > 0) {
      parts.push('  • Most common symptoms:')
      for (const s of sympTop.slice(0, 8)) {
        parts.push(`    • ${s}`)
      }
    }
    const peak = inferPeakSymptomTimeWindow(symp30)
    if (peak) {
      parts.push(`  • The strongest symptom logs (by time of day) tend to cluster ${peak}`)
    }
    const withRelief = symp30.filter((r) => String(r.relief ?? '').trim().length > 0).length
    const zeroRelief = symp30.length - withRelief
    const helpedCount = symp30.filter((r) => {
      const rel = String(r.relief ?? '')
      return /benadryl|diphenhydramine|antihistamine/i.test(rel) || /rest|sleep|lying/i.test(rel)
    }).length
    if (helpedCount > 0) {
      parts.push(`  • What helped: antihistamines and rest (worked in about ${helpedCount} of ${symp30.length} symptom logs)`)
    }
    if (symp30.length > 0) {
      parts.push(`  • Zero relief was logged for ${zeroRelief} of ${symp30.length} symptom logs`)
    }
  }

  parts.push('')
  parts.push('HOW MY PAIN AND SYMPTOMS RELATE TO EACH OTHER')
  const painDays = new Set(pain30.map((r) => String(r.entry_date ?? '')))
  const epDays = new Set(symp30.map((r) => String(r.symptom_date ?? '')))
  const flareDays = new Set(
    pain30
      .filter((r) => typeof r.intensity === 'number' && (r.intensity as number) >= 7)
      .map((r) => String(r.entry_date ?? '')),
  )
  let flareEpOverlap = 0
  for (const day of flareDays) {
    if (epDays.has(day)) flareEpOverlap++
  }
  if (pain30.length > 0 && symp30.length > 0) {
    parts.push(`  • Pain flares (7+/10) happened during the same calendar window as symptom logs on ${flareEpOverlap} day${flareEpOverlap !== 1 ? 's' : ''} — the app cannot yet show if they were at the exact same times of day.`)
  } else if (symp30.length > 0) {
    parts.push('  • Add pain logs to compare timing with symptoms.')
  } else if (pain30.length > 0) {
    parts.push('  • Add symptom logs to compare timing with pain.')
  }

  let epDaysNoPain = 0
  for (const day of epDays) {
    if (!painDays.has(day)) epDaysNoPain++
  }
  if (symp30.length > 0) {
    parts.push(`  • Not all symptom logs included a pain entry on the same day (${epDaysNoPain} symptom day${epDaysNoPain !== 1 ? 's' : ''} had no pain log that day).`)
  }

  let painDaysNoEp = 0
  for (const day of painDays) {
    if (!epDays.has(day)) painDaysNoEp++
  }
  if (pain30.length > 0) {
    parts.push(`  • Not all pain was on a symptom day (${painDaysNoEp} pain-log day${painDaysNoEp !== 1 ? 's' : ''} had no symptom log that day).`)
  }

  parts.push('')
  parts.push('MEDICATION NOTES I AM WATCHING')
  const purposeByMed = new Map(
    d.medList.map((m) => [String(m.medication ?? '').toLowerCase(), String(m.purpose ?? '')]),
  )
  const corrLines = d.medChangeEventsLoadError
    ? []
    : buildMedSymptomCorrelationLines(d.medChangeEvents, d.painRows, d.sympRows, 21)
  if (corrLines.length === 0) {
    if (d.medChangeEventsLoadError) {
      parts.push(`  • Could not load medication change history (${d.medChangeEventsLoadError}).`)
    } else {
      parts.push('  • No medication changes in the app window to correlate yet — keep logging around dose changes.')
    }
  } else {
    for (const cl of corrLines.slice(0, 6)) {
      const purpose = purposeByMed.get(cl.event.medication.toLowerCase()) ?? ''
      parts.push(`  • ${correlationToPatientMedNote(cl.line, purpose)}`)
    }
  }

  parts.push('')
  parts.push('WHAT I WANT TO ASK MY DOCTOR')
  const focus = typeof d.patientFocus === 'string' ? d.patientFocus.trim() : ''
  let askCount = 0
  if (focus) {
    parts.push(`  • ${focus}`)
    askCount++
  }
  if (pain30.length > 0 && symp30.length > 0) {
    parts.push('  • When my symptoms get worse, does my pain usually follow? Or are they independent from each other?')
    askCount++
  }
  for (const q of d.qList.slice(0, 10)) {
    const doc = q.doctor ? ` (${String(q.doctor)})` : ''
    parts.push(`  • ${String(q.question ?? '')}${doc}`)
    askCount++
  }
  if (askCount === 0) {
    parts.push('  • (Nothing here yet — add a priority above or save questions for your doctor in the app.)')
  }

  parts.push('')
  parts.push('FULL PAST AND PRESENT MEDICATION LIST')
  if (d.medList.length === 0 && archived.length === 0) {
    parts.push('  • None recorded.')
  } else {
    parts.push('  Current:')
    if (d.medList.length === 0) {
      parts.push('    • —')
    } else {
      for (const m of d.medList) {
        const name = String(m.medication ?? '')
        const bits = [m.dose, m.frequency].map(String).filter((s) => s && s !== 'undefined' && s !== 'null').join(' · ')
        const prn = m.frequency && isPrnFrequency(String(m.frequency)) ? ' PRN' : ''
        const purpose = m.purpose ? ` · ${m.purpose}` : ''
        const doc = prescribedByFromNotes(m.notes) ?? ''
        const docStr = doc ? ` (${doc})` : ''
        parts.push(`    • ${name}${bits ? ` · ${bits}` : ''}${prn}${purpose}${docStr}`)
      }
    }
    parts.push('  No longer taking:')
    if (archived.length === 0) {
      parts.push('    • —')
    } else {
      for (const a of archived) {
        const name = String(a.medication ?? '')
        const bits = [a.dose, a.frequency].filter(Boolean).join(' · ')
        const stopped = a.stopped_date ? fmtDate(String(a.stopped_date)) : '—'
        const reason = a.reason_stopped ? String(a.reason_stopped) : 'reason not recorded'
        const doc = a.prescribed_by ? String(a.prescribed_by) : ''
        const docStr = doc ? ` (${doc})` : ''
        parts.push(`    • ${name}${bits ? ` · ${bits}` : ''} · stopped ${stopped} — ${reason}${docStr}`)
      }
    }
  }

  return parts.join('\n')
}

/** Meds, pain, and symptom logs only — quantified before/after windows per med change. */
function buildSymptomsPainMedsNarrative (d: HandoffNarrativeInput): string {
  const since30 = addDaysIso(d.todayIso, -30)
  const since14 = addDaysIso(d.todayIso, -14)

  const pain30 = d.painRows.filter((r) => String(r.entry_date ?? '') >= since30)
  const symp30 = d.sympRows.filter((r) => String(r.symptom_date ?? '') >= since30)
  const symp14 = d.sympRows.filter((r) => String(r.symptom_date ?? '') >= since14)

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

  const parts: string[] = []
  parts.push(`PATIENT HEALTH SUMMARY  —  ${fmtDate(d.todayIso)}`)
  parts.push('(Focus: medications, pain & symptom interconnection — app-derived; not causal proof.)')
  parts.push('')
  parts.push('CLINICAL SNAPSHOT')
  parts.push(buildInterconnectionSnapshot(pain30, symp30, avgPain, flares, areas, sympTop))

  const focus = typeof d.patientFocus === 'string' ? d.patientFocus.trim() : ''
  if (focus) {
    parts.push('')
    parts.push('PRIORITY FOR NEXT VISIT')
    parts.push(`  • ${focus}`)
  }

  parts.push('')
  parts.push('MEDICATION CHANGES VS PAIN AND SYMPTOMS')
  if (d.medChangeEventsLoadError) {
    parts.push(`  • Unable to load change history: ${d.medChangeEventsLoadError}`)
    parts.push('  • Run migration 20250406200000_med_change_events_rpc.sql in Supabase SQL Editor to fix this.')
  } else {
    const corrLines = buildMedSymptomCorrelationLines(d.medChangeEvents, d.painRows, d.sympRows, 21, { quantified: true })
    if (corrLines.length === 0) {
      parts.push('  • No medication start, stop, or dose changes recorded in the app for this window.')
      parts.push('  • Log pain and symptoms around medication changes to see before/after numbers.')
    } else {
      for (const cl of corrLines) {
        parts.push(`  • ${cl.line}`)
      }
    }
  }

  appendPainSymptomTrends30(parts, pain30, symp30, symp14, avgPain, flares, areas, painTypes, sympTop)

  return parts.join('\n')
}

function buildInterconnectionSnapshot (
  pain30: Record<string, unknown>[],
  symp30: Record<string, unknown>[],
  avgPain: number | null,
  flares: Record<string, unknown>[],
  areas: string[],
  sympTop: string[],
): string {
  const sentences: string[] = []
  sentences.push(
    'This summary focuses on how pain intensity, symptoms, and medication timing relate in your logged data (patterns are descriptive, not proof of cause and effect).',
  )
  if (pain30.length > 0 && avgPain != null) {
    let painSent = `Over the past 30 days, ${plural(pain30.length, 'pain entry')} logged with an average intensity of ${avgPain}/10`
    if (flares.length > 0) painSent += `, including ${plural(flares.length, 'severe flare')} (7+/10)`
    if (areas.length > 0) painSent += `, primarily affecting the ${listSentence(areas)}`
    sentences.push(painSent + '.')
  }
  if (symp30.length > 0) {
    let epSent = `${plural(symp30.length, 'symptom log')} recorded in the last 30 days`
    if (sympTop.length > 0) epSent += `, most frequently involving ${listSentence(sympTop)}`
    sentences.push(epSent + '.')
  }
  if (pain30.length === 0 && symp30.length === 0) {
    sentences.push('Add pain and symptom logs to see before/after patterns around medication changes.')
  }
  sentences.push(
    'The section below compares symptom log counts and average pain in windows before and after each medication change recorded in the app.',
  )
  return sentences.join('\n')
}

function appendPainSymptomTrends30 (
  parts: string[],
  pain30: Record<string, unknown>[],
  symp30: Record<string, unknown>[],
  symp14: Record<string, unknown>[],
  avgPain: number | null,
  flares: Record<string, unknown>[],
  areas: string[],
  painTypes: string[],
  sympTop: string[],
): void {
  parts.push('')
  parts.push('PAIN & SYMPTOM TRENDS  (last 30 days)')
  if (pain30.length === 0 && symp30.length === 0) {
    parts.push('  • No pain or symptom logs in this window.')
    return
  }
  if (pain30.length > 0) {
    parts.push(`  • ${plural(pain30.length, 'pain entry')}${avgPain != null ? `, average intensity ${avgPain}/10` : ''}`)
    if (flares.length) parts.push(`  • ${plural(flares.length, 'flare')} at 7+/10${areas.length ? ` — worst areas: ${listSentence(areas)}` : ''}`)
    else if (areas.length) parts.push(`  • Primary areas: ${listSentence(areas)}`)
    if (painTypes.length) parts.push(`  • Pain character: ${listSentence(painTypes)}`)
  }
  if (symp30.length > 0) {
    parts.push(`  • ${plural(symp30.length, 'symptom log')} (${plural(symp14.length, 'symptom log')} in the last 2 weeks)`)
    if (sympTop.length) parts.push(`  • Most common features: ${listSentence(sympTop)}`)
    const reliefTokens = symp30.flatMap((r) => typeof r.relief === 'string' ? [r.relief] : [])
    const antihistamine = reliefTokens.filter((t) => /benadryl|diphenhydramine|antihistamine/i.test(t)).length
    const rest = reliefTokens.filter((t) => /rest|sleep|lying/i.test(t)).length
    if (antihistamine + rest > 0) {
      parts.push(`  • Relief noted from ${[antihistamine > 0 ? 'antihistamines' : '', rest > 0 ? 'rest' : ''].filter(Boolean).join(' and ')} in ${pct(antihistamine + rest, symp30.length)} of symptom logs`)
    }
  }
}

