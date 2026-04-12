import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import {
  dedupeDiagnosisRows,
  type DiagnosisDirectoryStatus,
  normalizeDiagnosisDirectoryStatus,
} from './diagnosisStatusOptions'

export type ExtractedVisitFields = {
  /** Chief complaint / why the patient came in (not exam findings). */
  reason_for_visit: string
  findings: string
  instructions: string
  notes: string
  tests: { test_name: string; reason: string }[]
  medications: { medication: string; dose: string; frequency: string }[]
  /** Structured rows for the diagnosis directory (confirmed, suspected, ruled out, resolved). */
  diagnoses: { diagnosis: string; status: DiagnosisDirectoryStatus }[]
  follow_up_date: string
  follow_up_time: string
  summary: { field: string; value: string; destination: string }[]
}

/** Passed to visit log after transcription + extract (wizard or dashboard). */
export type TranscriptExtractPayload = {
  fields: ExtractedVisitFields
  transcript: string
}

/** Pull a JSON object out of LLM output (handles extra prose or markdown). */
function parseJsonObjectFromText (raw: string): Record<string, unknown> | null {
  const clean = raw.replace(/```json|```/gi, '').trim()
  try {
    return JSON.parse(clean) as Record<string, unknown>
  } catch { /* try substring */ }

  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

async function readInvokeError (err: unknown): Promise<string> {
  if (err instanceof FunctionsHttpError && err.context instanceof Response) {
    try {
      const ct = err.context.headers.get('Content-Type') ?? ''
      if (ct.includes('application/json')) {
        const body = (await err.context.json()) as { error?: string; message?: string }
        if (typeof body.error === 'string' && body.error.trim()) return body.error.trim()
        if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
      } else {
        const text = (await err.context.text()).trim()
        if (text) return text.slice(0, 500)
      }
    } catch { /* ignore */ }
  }
  return err instanceof Error ? err.message : String(err)
}

export type ExtractVisitOutcome =
  | { ok: true; fields: ExtractedVisitFields }
  | { ok: false; message: string }

export async function extractVisitFieldsFromTranscript (
  transcript: string,
  context: {
    doctorName: string
    existingMeds: string[]
    knownDiagnoses: string[]
    /** Visit date YYYY-MM-DD — anchor for relative follow-up phrases ("in 2 weeks"). */
    visitDateIso: string
  }
): Promise<ExtractVisitOutcome> {
  const anchor = context.visitDateIso.trim() || new Date().toISOString().slice(0, 10)
  const prompt = `You are a medical visit assistant. Extract structured information from this doctor visit transcript.

Doctor: ${context.doctorName}
Patient's current medications: ${context.existingMeds.join(', ') || 'none provided'}
Patient's known diagnoses: ${context.knownDiagnoses.join(', ') || 'none provided'}
ANCHOR_DATE (date of this visit for relative follow-up math): ${anchor}

Transcript:
${transcript}

FIELD DEFINITIONS — keep content in exactly ONE place; do not duplicate the same fact across fields.

1) "reason_for_visit" — ONLY the chief complaint or why the patient came in (what they said they are here for, e.g. "chest pain for 2 days", "follow-up on labs"). If the patient or doctor never states a reason, use "". Do NOT put exam results, diagnoses, or plan here.

2) "findings" — ONLY clinician-stated exam findings, assessment, impression, or diagnosis discussion (what was found or concluded clinically). Do NOT put patient instructions here. Do NOT put the visit reason here.

3) "instructions" — ONLY what the patient should DO after the visit (self-care, activity, when to call, lifestyle) that is NOT a medication line item. Medication names/doses belong ONLY in "medications".

4) "notes" — ONLY brief logistics: referrals, scheduling quirks, work/school notes, front-desk items. NOT findings, NOT instructions, NOT medication lists, NOT a transcript summary.

5) "medications" — every drug discussed (new, changed, continued, stopped). One object per distinct medication. Dose and frequency in the structured fields.

6) "diagnoses" — structured list for the patient's diagnosis directory. Each object: condition name + ONE status from exactly this set: "Suspected", "Confirmed", "Ruled Out", "Resolved".
   - "Confirmed": clinician states the patient has this diagnosis or it is established.
   - "Suspected": differential, "we're considering", working diagnosis, or not yet confirmed.
   - "Ruled Out": clinician explicitly says this diagnosis does NOT apply or was excluded.
   - "Resolved": prior diagnosis no longer active or cleared.
   Include ONLY diagnoses clearly tied to clinical assessment in the visit (not casual mentions). If none, use [].
   Do not stuff the full differential into duplicate rows; one row per distinct condition with the best-fitting status.

CRITICAL:
- Never paste the full transcript into any one field.
- Avoid repeating the same sentence in findings, instructions, and notes.

Important: In "medications", include one object for every distinct medication the doctor discussed. Put dose and frequency in the structured fields when spoken.

Follow-up scheduling:
- "follow_up_date": YYYY-MM-DD if (a) an explicit calendar date is stated, OR (b) a RELATIVE timeframe is stated (e.g. "in 2 weeks", "in 6 weeks", "in 3 months", "come back in a month", "see you in four weeks"). For (b), compute the date by adding the interval to ANCHOR_DATE (calendar arithmetic). If no computable date, use "".
- "follow_up_time": Use "" unless the doctor states an explicit clock time for the follow-up (e.g. "at 9 AM"). For relative phrases ("in two weeks") with no clock time, MUST be "". Do not guess or default to midnight.

Return ONLY a JSON object with exactly these fields. No preamble, no markdown, no backticks:
{
  "reason_for_visit": "chief complaint only, or empty string if not stated",
  "findings": "exam/assessment/diagnosis discussion only",
  "instructions": "patient actions and self-care (non-med-list lines)",
  "notes": "logistics/admin only",
  "tests": [{ "test_name": "name of test", "reason": "why ordered" }],
  "medications": [{ "medication": "name", "dose": "dose if mentioned", "frequency": "frequency if mentioned" }],
  "diagnoses": [{ "diagnosis": "condition name", "status": "Suspected" | "Confirmed" | "Ruled Out" | "Resolved" }],
  "follow_up_date": "YYYY-MM-DD or empty",
  "follow_up_time": "HH:MM only if explicit clock time stated; else empty",
  "summary": [{ "field": "label", "value": "brief value", "destination": "visit log section" }]
}`

  const { data, error } = await supabase.functions.invoke('generate-summary', {
    body: { customPrompt: prompt, mode: 'extract' },
  })

  if (error) {
    const detail = await readInvokeError(error)
    return {
      ok: false,
      message:
        detail ||
        'Could not reach the extract service. Check ANTHROPIC_API_KEY on generate-summary and redeploy with verify_jwt disabled if needed.',
    }
  }

  const payload = data as { result?: string; error?: string } | null
  if (payload?.error) {
    return { ok: false, message: payload.error }
  }

  if (payload == null || typeof payload.result !== 'string') {
    return {
      ok: false,
      message: 'Extract service returned no result. Deploy generate-summary and set ANTHROPIC_API_KEY.',
    }
  }

  const parsed = parseJsonObjectFromText(payload.result)
  if (!parsed) {
    return {
      ok: false,
      message: 'Could not parse structured data from the model. Try again or shorten the transcript.',
    }
  }

  return { ok: true, fields: normalizeExtractedFields(parsed) }
}

/** Coerce model or legacy JSON into a full {@link ExtractedVisitFields} shape. */
export function normalizeExtractedFields (raw: Record<string, unknown>): ExtractedVisitFields {
  const s = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '')
  const testsRaw = raw.tests
  const tests: { test_name: string; reason: string }[] = Array.isArray(testsRaw)
    ? testsRaw.map((t) => {
        if (!t || typeof t !== 'object') return { test_name: '', reason: '' }
        const o = t as Record<string, unknown>
        return {
          test_name: typeof o.test_name === 'string' ? o.test_name : '',
          reason: typeof o.reason === 'string' ? o.reason : '',
        }
      })
    : []
  const medsRaw = raw.medications
  const medications: { medication: string; dose: string; frequency: string }[] = Array.isArray(medsRaw)
    ? medsRaw.map((m) => {
        if (!m || typeof m !== 'object') return { medication: '', dose: '', frequency: '' }
        const o = m as Record<string, unknown>
        return {
          medication: typeof o.medication === 'string' ? o.medication : '',
          dose: typeof o.dose === 'string' ? o.dose : '',
          frequency: typeof o.frequency === 'string' ? o.frequency : '',
        }
      })
    : []
  const diagRaw = raw.diagnoses
  const diagnosesParsed: { diagnosis: string; status: DiagnosisDirectoryStatus }[] = Array.isArray(diagRaw)
    ? diagRaw.map((d) => {
        if (!d || typeof d !== 'object') return { diagnosis: '', status: 'Suspected' as DiagnosisDirectoryStatus }
        const o = d as Record<string, unknown>
        const diagnosis = typeof o.diagnosis === 'string' ? o.diagnosis : ''
        const statusRaw = typeof o.status === 'string' ? o.status : ''
        return {
          diagnosis,
          status: normalizeDiagnosisDirectoryStatus(statusRaw || 'Suspected'),
        }
      })
    : []
  const diagnoses = dedupeDiagnosisRows(diagnosesParsed)
  const sumRaw = raw.summary
  const summary: { field: string; value: string; destination: string }[] = Array.isArray(sumRaw)
    ? sumRaw.map((x) => {
        if (!x || typeof x !== 'object') return { field: '', value: '', destination: '' }
        const o = x as Record<string, unknown>
        return {
          field: typeof o.field === 'string' ? o.field : '',
          value: typeof o.value === 'string' ? o.value : '',
          destination: typeof o.destination === 'string' ? o.destination : '',
        }
      })
    : []
  return {
    reason_for_visit: s('reason_for_visit'),
    findings: s('findings'),
    instructions: s('instructions'),
    notes: s('notes'),
    tests,
    medications,
    diagnoses,
    follow_up_date: s('follow_up_date'),
    follow_up_time: s('follow_up_time'),
    summary,
  }
}
