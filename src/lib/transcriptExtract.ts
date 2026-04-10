import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type ExtractedVisitFields = {
  findings: string
  instructions: string
  notes: string
  tests: { test_name: string; reason: string }[]
  medications: { medication: string; dose: string; frequency: string }[]
  follow_up_date: string
  follow_up_time: string
  summary: { field: string; value: string; destination: string }[]
}

/** Pull a JSON object out of LLM output (handles extra prose or markdown). */
function parseJsonObjectFromText (raw: string): ExtractedVisitFields | null {
  const clean = raw.replace(/```json|```/gi, '').trim()
  try {
    return JSON.parse(clean) as ExtractedVisitFields
  } catch { /* try substring */ }

  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(clean.slice(start, end + 1)) as ExtractedVisitFields
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
  }
): Promise<ExtractVisitOutcome> {
  const prompt = `You are a medical visit assistant. Extract structured information from this doctor visit transcript.

Doctor: ${context.doctorName}
Patient's current medications: ${context.existingMeds.join(', ') || 'none provided'}
Patient's known diagnoses: ${context.knownDiagnoses.join(', ') || 'none provided'}

Transcript:
${transcript}

Return ONLY a JSON object with exactly these fields. No preamble, no markdown, no backticks:
{
  "findings": "what the doctor found or observed",
  "instructions": "what the patient was told to do",
  "notes": "any other important information",
  "tests": [{ "test_name": "name of test", "reason": "why ordered" }],
  "medications": [{ "medication": "name", "dose": "dose if mentioned", "frequency": "frequency if mentioned" }],
  "follow_up_date": "YYYY-MM-DD if mentioned or empty string",
  "follow_up_time": "HH:MM if mentioned or empty string",
  "summary": [{ "field": "what was found", "value": "the value", "destination": "where it goes in the visit log" }]
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

  return { ok: true, fields: parsed }
}
