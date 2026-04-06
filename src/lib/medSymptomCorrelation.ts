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

  const epBetter   = epDelta <= -2
  const epWorse    = epDelta >= 2
  const painBetter = painDelta != null && painDelta <= -0.8
  const painWorse  = painDelta != null && painDelta >= 0.8

  // Mixed signals — describe each dimension explicitly rather than averaging to "unchanged"
  if (epBetter && painWorse)  return 'episodes have been less frequent, but pain has been higher'
  if (epWorse  && painBetter) return 'pain has improved, though episodes have been slightly more frequent'
  if (epBetter || painBetter) return 'episodes and pain have been trending better since this change'
  if (epWorse  || painWorse)  return 'episodes and/or pain have trended worse after this change'
  return 'no clear change in episodes or pain yet'
}

function firstDoseNumber (s: string | null | undefined): number | null {
  if (!s) return null
  const m = String(s).replace(/,/g, '.').match(/(\d+(?:\.\d+)?)/)
  if (!m) return null
  const n = parseFloat(m[1])
  return Number.isFinite(n) ? n : null
}

function fmtDate (iso: string): string {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch { return iso }
}

function fmtEventLabel (ev: MedChangeEvent): string {
  const name = ev.medication
  const dose = ev.dose_new ?? ev.dose_previous ?? ''
  const freq = ev.frequency_new ?? ev.frequency_previous ?? ''
  const bits = [dose, freq].filter(Boolean).join(' · ')

  if (ev.event_type === 'start') return bits ? `${name} · ${bits}` : name
  if (ev.event_type === 'stop')  return bits ? `${name} (stopped · ${bits})` : `${name} (stopped)`

  // adjustment — show direction and what changed
  const a = firstDoseNumber(ev.dose_previous)
  const b = firstDoseNumber(ev.dose_new)
  const from = [ev.dose_previous, ev.frequency_previous].filter(Boolean).join(' · ') || '(prior)'
  const to   = [ev.dose_new,      ev.frequency_new     ].filter(Boolean).join(' · ') || '(updated)'
  const dir  = a != null && b != null ? (b > a ? 'increased' : b < a ? 'reduced' : 'adjusted') : 'adjusted'
  return `${name} · ${dir} (${from} → ${to})`
}

export type CorrelationLine = { event: MedChangeEvent; line: string }

/**
 * Build plain-English one-liner correlation lines per medication event.
 *
 * Format: "Medication · dose · freq · started Apr 5 — Plain english outcome."
 *
 * Edge cases handled:
 *  - Fewer than 3 days of post-event data → "Not enough data yet to see a pattern."
 *  - No logs at all in either window → prompt user to keep logging.
 *  - Mixed signals (one better, one worse) → described per dimension, not averaged.
 */
export function buildMedSymptomCorrelationLines (
  events: MedChangeEvent[],
  painRows: Record<string, unknown>[],
  sympRows: Record<string, unknown>[],
  windowDays = 21,
): CorrelationLine[] {
  const todayIso = new Date().toISOString().slice(0, 10)
  const out: CorrelationLine[] = []
  const seen = new Set<string>()
  const sorted = [...events].sort((a, b) => b.event_date.localeCompare(a.event_date))

  for (const ev of sorted) {
    const key = `${ev.event_date}:${ev.medication}:${ev.event_type}`
    if (seen.has(key)) continue
    seen.add(key)

    const evt   = ev.event_date
    const label = fmtEventLabel(ev)
    const actionPart = ev.event_type === 'stop'
      ? `stopped ${fmtDate(evt)}`
      : `started ${fmtDate(evt)}`

    // If the event is very recent, there is no meaningful "after" window yet
    const daysAfter = Math.floor(
      (new Date(todayIso + 'T12:00:00').getTime() - new Date(evt + 'T12:00:00').getTime()) / MS_DAY,
    )
    if (daysAfter < 3) {
      out.push({ event: ev, line: `${label} · ${actionPart} — Not enough data yet to see a pattern.` })
      if (out.length >= 5) break
      continue
    }

    const preEnd   = addDaysIso(evt, -1)
    const preStart = addDaysIso(evt, -windowDays)
    const postStart = evt
    const postEnd   = addDaysIso(evt, windowDays)

    const preEp   = countEpisodes(sympRows, preStart, preEnd)
    const postEp  = countEpisodes(sympRows, postStart, postEnd)
    const prePain  = avgPain(painRows, preStart, preEnd)
    const postPain = avgPain(painRows, postStart, postEnd)

    let body: string
    if (preEp === 0 && postEp === 0 && prePain == null && postPain == null) {
      body = 'No pain or episode logs in the surrounding window — keep logging to see a pattern.'
    } else {
      const raw = describeOutcome(preEp, postEp, prePain, postPain)
      body = raw.charAt(0).toUpperCase() + raw.slice(1) + '.'
    }

    out.push({ event: ev, line: `${label} · ${actionPart} — ${body}` })
    if (out.length >= 5) break
  }

  return out
}

export function formatCorrelationBlock (lines: CorrelationLine[]): string {
  if (lines.length === 0) {
    return [
      'No recorded medication start, stop, or dose/frequency changes in the app for this window.',
      'To build this section: use the Medications page to add meds or use "Log dose change" / edits so the app can save history (requires the medication_change_events migration on your project).',
      'Correlation also needs pain and episode logs around those dates to describe before/after patterns.',
    ].join(' ')
  }
  return lines.map((x) => `• ${x.line}`).join('\n')
}
