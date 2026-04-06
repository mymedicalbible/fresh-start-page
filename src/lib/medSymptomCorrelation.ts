/**
 * Loose symptom/pain vs medication-change correlation (~3 weeks before vs after each event).
 * Events come from medication_change_events (DB triggers on current_medications).
 */

export type MedChangeEvent = {
  event_date: string
  medication: string
  event_type: 'start' | 'adjustment' | 'stop'
  dose_previous?: string | null
  dose_new?: string | null
  frequency_previous?: string | null
  frequency_new?: string | null
}

const MS_DAY = 86_400_000

function addDaysIso (iso: string, delta: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setTime(d.getTime() + delta * MS_DAY)
  return d.toISOString().slice(0, 10)
}

function avgPain (painRows: Record<string, unknown>[], start: string, end: string): number | null {
  const nums = painRows
    .filter((r) => {
      const dt = String(r.entry_date ?? '')
      return dt >= start && dt <= end
    })
    .map((r) => r.intensity)
    .filter((x): x is number => typeof x === 'number')
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

function countEpisodes (sympRows: Record<string, unknown>[], start: string, end: string): number {
  return sympRows.filter((r) => {
    const dt = String(r.episode_date ?? '')
    return dt >= start && dt <= end
  }).length
}

/** True if frequency text suggests PRN / as-needed. */
export function isPrnFrequency (freq: string | null | undefined): boolean {
  if (!freq) return false
  return /\b(prn|p\.?\s*r\.?\s*n\.?|as\s*-?\s*needed|a\.?s\s*needed)\b/i.test(freq)
}

function describeOutcome (preEp: number, postEp: number, prePain: number | null, postPain: number | null): string {
  const epDelta = postEp - preEp
  const painDelta = prePain != null && postPain != null ? postPain - prePain : null
  let score = 0
  if (preEp > 0 || postEp > 0) {
    if (epDelta <= -2) score += 1
    else if (epDelta >= 2) score -= 1
  }
  if (painDelta != null) {
    if (painDelta <= -0.8) score += 1
    else if (painDelta >= 0.8) score -= 1
  }
  if (score >= 1) return 'symptoms/pain trended better after this change'
  if (score <= -1) return 'symptoms/pain trended worse after this change'
  return 'symptoms/pain were roughly unchanged after this change'
}

function firstDoseNumber (s: string | null | undefined): number | null {
  if (!s) return null
  const m = String(s).replace(/,/g, '.').match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

function formatEventOneLiner (ev: MedChangeEvent): string {
  const name = ev.medication
  if (ev.event_type === 'start') {
    const d = ev.dose_new ? ev.dose_new : ''
    const f = ev.frequency_new ? ev.frequency_new : ''
    const bits = [d, f].filter(Boolean).join(', ')
    const prn = isPrnFrequency(f) ? ' (PRN)' : ''
    return bits ? `${name} started (${bits})${prn}` : `${name} started`
  }
  if (ev.event_type === 'stop') {
    const last = ev.dose_previous ? ` last ${ev.dose_previous}` : ''
    const f = ev.frequency_previous ? ` ${ev.frequency_previous}` : ''
    return `${name} stopped${last}${f}`
  }
  const a = firstDoseNumber(ev.dose_previous)
  const b = firstDoseNumber(ev.dose_new)
  const from = [ev.dose_previous, ev.frequency_previous].filter(Boolean).join(' · ') || '(prior)'
  const to = [ev.dose_new, ev.frequency_new].filter(Boolean).join(' · ') || '(updated)'
  if (a != null && b != null && b > a) return `${name} increased (${from} → ${to})`
  if (a != null && b != null && b < a) return `${name} reduced (${from} → ${to})`
  return `${name} adjusted (${from} → ${to})`
}

export type CorrelationLine = { event: MedChangeEvent; line: string }

/**
 * Build human-readable correlation lines for recent med events (newest first in input ok).
 * @param windowDays - days before (exclusive of event) and after (inclusive) the event date
 */
export function buildMedSymptomCorrelationLines (
  events: MedChangeEvent[],
  painRows: Record<string, unknown>[],
  sympRows: Record<string, unknown>[],
  windowDays = 21,
): CorrelationLine[] {
  const out: CorrelationLine[] = []
  const seen = new Set<string>()
  const sorted = [...events].sort((a, b) => b.event_date.localeCompare(a.event_date))

  for (const ev of sorted) {
    const key = `${ev.event_date}:${ev.medication}:${ev.event_type}`
    if (seen.has(key)) continue
    seen.add(key)

    const evt = ev.event_date
    const preEnd = addDaysIso(evt, -1)
    const preStart = addDaysIso(evt, -windowDays)
    const postStart = evt
    const postEnd = addDaysIso(evt, windowDays)

    const preEp = countEpisodes(sympRows, preStart, preEnd)
    const postEp = countEpisodes(sympRows, postStart, postEnd)
    const prePain = avgPain(painRows, preStart, preEnd)
    const postPain = avgPain(painRows, postStart, postEnd)

    const header = formatEventOneLiner(ev) + ` on ${evt}.`
    let body: string
    if (preEp === 0 && postEp === 0 && prePain == null && postPain == null) {
      body = ` No pain or symptom logs in the ~${windowDays}d before/after windows — keep logging to see if this change helped.`
    } else {
      body =
        ` In the ${windowDays} days before: ${preEp} symptom episode${preEp !== 1 ? 's' : ''}, pain avg ${prePain ?? '—'}/10; `
        + `in the ${windowDays} days after: ${postEp} episode${postEp !== 1 ? 's' : ''}, pain avg ${postPain ?? '—'}/10. `
        + describeOutcome(preEp, postEp, prePain, postPain) + '.'
    }

    out.push({ event: ev, line: header + body })
    if (out.length >= 5) break
  }

  return out
}

export function formatCorrelationBlock (lines: CorrelationLine[]): string {
  if (lines.length === 0) {
    return [
      'No recorded medication start, stop, or dose/frequency changes in the app for this window.',
      'To build this section: use the Medications page to add meds or use “Log dose change” / edits so the app can save history (requires the medication_change_events migration on your project).',
      'Correlation also needs pain and episode logs around those dates to describe before/after patterns.',
    ].join(' ')
  }
  return lines.map((x) => `• ${x.line}`).join('\n')
}
