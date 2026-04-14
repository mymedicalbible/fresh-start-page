/**
 * Loose symptom/pain vs medication-change correlation (~3 weeks before vs after each event).
 * Events come from medication_change_events (DB triggers on current_medications).
 */

export type MedChangeEvent = {
  /** Present when loaded from DB */
  id?: string | null
  event_date: string
  medication: string
  event_type: 'start' | 'adjustment' | 'stop'
  dose_previous?: string | null
  dose_new?: string | null
  frequency_previous?: string | null
  frequency_new?: string | null
  /** When the row was written (distinct from clinical event_date) */
  created_at?: string | null
  change_reason?: string | null
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

function countSymptomLogs (sympRows: Record<string, unknown>[], start: string, end: string): number {
  return sympRows.filter((r) => {
    const dt = String(r.symptom_date ?? '')
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
  if (epBetter && painWorse)  return 'symptoms have been less frequent, but pain has been higher'
  if (epWorse  && painBetter) return 'pain has improved, though symptoms have been slightly more frequent'
  if (epBetter || painBetter) return 'symptoms and pain have been trending better since this change'
  if (epWorse  || painWorse)  return 'symptoms and/or pain have trended worse after this change'
  return 'no clear change in symptoms or pain yet'
}

/** Same windows as describeOutcome, with symptom-log % change and pain before/after averages. */
function describeOutcomeQuantified (
  preEp: number,
  postEp: number,
  prePain: number | null,
  postPain: number | null,
  windowDays: number,
): string {
  const bits: string[] = []
  const epDelta = postEp - preEp
  const painDelta = prePain != null && postPain != null ? postPain - prePain : null

  if (preEp === 0 && postEp === 0) {
    /* skip */
  } else if (preEp === 0 && postEp > 0) {
    bits.push(`symptom logs went from none in the prior ${windowDays}-day window to ${postEp} in the ${windowDays} days after the change`)
  } else if (preEp > 0) {
    const pct = Math.round((epDelta / preEp) * 100)
    if (epDelta === 0) {
      bits.push(`symptom log count was similar (${preEp} logs in each ${windowDays}-day window)`)
    } else {
      bits.push(
        `symptom logs ${epDelta > 0 ? 'increased' : 'decreased'} by about ${Math.abs(pct)}% (${preEp} → ${postEp} across comparable ${windowDays}-day windows)`,
      )
    }
  }

  if (prePain != null && postPain != null) {
    const d = Math.round((postPain - prePain) * 10) / 10
    if (Math.abs(d) < 0.3) {
      bits.push(`average pain was similar (${prePain}/10 vs ${postPain}/10)`)
    } else {
      bits.push(`average pain ${d < 0 ? 'lessened' : 'rose'} (${prePain}/10 → ${postPain}/10)`)
    }
  } else if (prePain != null || postPain != null) {
    const v = prePain ?? postPain
    bits.push(`average pain was ${v}/10 where logged`)
  }

  if (bits.length === 0) {
    const raw = describeOutcome(preEp, postEp, prePain, postPain)
    return raw.charAt(0).toUpperCase() + raw.slice(1) + '.'
  }

  const mixed =
    painDelta != null &&
    ((epDelta <= -2 && painDelta >= 0.8) || (epDelta >= 2 && painDelta <= -0.8))
  let s = bits.join('; ')
  if (mixed) s += ' (mixed pattern: symptoms and pain moved in different directions)'
  return s + '.'
}

function fmtActionRelative (ev: MedChangeEvent, todayIso: string): string {
  const days = Math.floor(
    (new Date(todayIso + 'T12:00:00').getTime() - new Date(ev.event_date + 'T12:00:00').getTime()) / MS_DAY,
  )
  const rel =
    days < 1
      ? 'today'
      : days === 1
        ? '1 day ago'
        : days < 14
          ? `${days} days ago`
          : days < 75
            ? `about ${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? '' : 's'} ago`
            : `about ${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'} ago`

  if (ev.event_type === 'stop') return `stopped ${rel}`
  if (ev.event_type === 'adjustment') return `adjusted ${rel}`
  return `started ${rel}`
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

/** Logged time + optional reason (for handoff / correlation lines). */
export function fmtEventMeta (ev: MedChangeEvent): string {
  const parts: string[] = []
  if (ev.created_at) {
    try {
      const t = new Date(ev.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
      parts.push(`logged ${t}`)
    } catch { /* ignore */ }
  }
  const r = ev.change_reason?.trim()
  if (r) {
    parts.push(`Reason: ${r.length > 120 ? `${r.slice(0, 117)}…` : r}`)
  }
  return parts.length ? ` · ${parts.join(' · ')}` : ''
}

/** Single-line label for a medication change (dose transition + optional logged time / reason). */
export function formatMedChangeEventLine (ev: MedChangeEvent): string {
  const name = ev.medication
  const dose = ev.dose_new ?? ev.dose_previous ?? ''
  const freq = ev.frequency_new ?? ev.frequency_previous ?? ''
  const bits = [dose, freq].filter(Boolean).join(' · ')

  let core: string
  if (ev.event_type === 'start') core = bits ? `${name} · ${bits}` : name
  else if (ev.event_type === 'stop') core = bits ? `${name} (stopped · ${bits})` : `${name} (stopped)`
  else {
    // adjustment — show direction and what changed
    const a = firstDoseNumber(ev.dose_previous)
    const b = firstDoseNumber(ev.dose_new)
    const from = [ev.dose_previous, ev.frequency_previous].filter(Boolean).join(' · ') || '(prior)'
    const to   = [ev.dose_new,      ev.frequency_new     ].filter(Boolean).join(' · ') || '(updated)'
    const dir  = a != null && b != null ? (b > a ? 'increased' : b < a ? 'reduced' : 'adjusted') : 'adjusted'
    core = `${name} · ${dir} (${from} → ${to})`
  }
  return `${core}${fmtEventMeta(ev)}`
}

/** Sort by clinical date (newest first), then logged time (newest first). */
export function sortMedChangeEvents (a: MedChangeEvent, b: MedChangeEvent): number {
  const c = b.event_date.localeCompare(a.event_date)
  if (c !== 0) return c
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0
  return tb - ta
}

function eventDedupeKey (ev: MedChangeEvent): string {
  if (ev.id) return String(ev.id)
  return [
    ev.event_date,
    ev.medication,
    ev.event_type,
    ev.created_at ?? '',
    ev.dose_previous ?? '',
    ev.dose_new ?? '',
    ev.frequency_previous ?? '',
    ev.frequency_new ?? '',
    ev.change_reason ?? '',
  ].join('\u0001')
}

export type CorrelationLine = { event: MedChangeEvent; line: string }

export type BuildMedCorrelationOptions = {
  /** Include symptom-log % change and pain averages; use relative time (e.g. "about 1 week ago"). */
  quantified?: boolean
}

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
  opts?: BuildMedCorrelationOptions,
): CorrelationLine[] {
  const quantified = opts?.quantified === true
  const todayIso = new Date().toISOString().slice(0, 10)
  const out: CorrelationLine[] = []
  const seen = new Set<string>()
  const sorted = [...events].sort(sortMedChangeEvents)

  for (const ev of sorted) {
    const key = eventDedupeKey(ev)
    if (seen.has(key)) continue
    seen.add(key)

    const evt   = ev.event_date
    const label = formatMedChangeEventLine(ev)
    const actionPart = ev.event_type === 'stop'
      ? `stopped ${fmtDate(evt)}`
      : ev.event_type === 'adjustment'
        ? `adjusted ${fmtDate(evt)}`
        : `started ${fmtDate(evt)}`
    const actionQuant = fmtActionRelative(ev, todayIso)

    // If the event is very recent, there is no meaningful "after" window yet
    const daysAfter = Math.floor(
      (new Date(todayIso + 'T12:00:00').getTime() - new Date(evt + 'T12:00:00').getTime()) / MS_DAY,
    )
    if (daysAfter < 3) {
      const lead = quantified ? `${label} · ${actionQuant}` : `${label} · ${actionPart}`
      out.push({ event: ev, line: `${lead} — Not enough data yet to see a pattern.` })
      if (out.length >= 5) break
      continue
    }

    const preEnd   = addDaysIso(evt, -1)
    const preStart = addDaysIso(evt, -windowDays)
    const postStart = evt
    const postEnd   = addDaysIso(evt, windowDays)

    const preEp   = countSymptomLogs(sympRows, preStart, preEnd)
    const postEp  = countSymptomLogs(sympRows, postStart, postEnd)
    const prePain  = avgPain(painRows, preStart, preEnd)
    const postPain = avgPain(painRows, postStart, postEnd)

    let body: string
    if (preEp === 0 && postEp === 0 && prePain == null && postPain == null) {
      body = 'No pain or symptom logs in the surrounding window — keep logging to see a pattern.'
    } else if (quantified) {
      body = describeOutcomeQuantified(preEp, postEp, prePain, postPain, windowDays)
    } else {
      const raw = describeOutcome(preEp, postEp, prePain, postPain)
      body = raw.charAt(0).toUpperCase() + raw.slice(1) + '.'
    }

    const lead = quantified ? `${label} · ${actionQuant}` : `${label} · ${actionPart}`
    out.push({ event: ev, line: `${lead} — ${body}` })
    if (out.length >= 5) break
  }

  return out
}

export function formatCorrelationBlock (lines: CorrelationLine[]): string {
  if (lines.length === 0) {
    return [
      'No recorded medication start, stop, or dose/frequency changes in the app for this window.',
      'To build this section: use the Medications page to add meds or use "Log dose change" / edits so the app can save history (requires the medication_change_events migration on your project).',
      'Correlation also needs pain and symptom logs around those dates to describe before/after patterns.',
    ].join(' ')
  }
  return lines.map((x) => `• ${x.line}`).join('\n')
}
