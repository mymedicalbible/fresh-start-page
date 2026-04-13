import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { normalizeDiagnosisDirectoryStatus } from './diagnosisStatusOptions'
import {
  dedupeDiagnosisRows,
  normalizeDiagnosisDraftRow,
  type DiagnosisDirectoryDetailFields,
} from './diagnosisDirectoryRow'

export type ExtractedSoloQuestionRow = {
  question: string
  /** Doctor or team to address (e.g. "Dr. Smith", "Cardiology"). */
  doctor: string
  priority: string
}

export type SoloMedicationChange = 'add' | 'continue' | 'stop'

export type ExtractedSoloMedicationRow = {
  medication: string
  dose: string
  frequency: string
  /** Patient started/changed (add), still taking (continue), or stopped (stop). */
  change: SoloMedicationChange
}

/** Doctors the patient names — used to create or update `doctors` profiles. */
export type ExtractedSoloDoctorMention = {
  name: string
  specialty: string
  /** Short context to append to the doctor profile notes (not the full transcript). */
  profile_note: string
}

export type ExtractedSoloFields = {
  /** Short overview of what the patient described (not a visit log). */
  narrative_summary: string
  questions: ExtractedSoloQuestionRow[]
  medications: ExtractedSoloMedicationRow[]
  diagnoses: DiagnosisDirectoryDetailFields[]
  tests: { test_name: string; reason: string; doctor_name: string }[]
  /**
   * Every distinct clinician the patient names (match to "Doctors already in their app" when possible).
   * Include specialty and a brief profile_note when they say something useful (e.g. "my cardiologist").
   */
  doctors_mentioned: ExtractedSoloDoctorMention[]
}

export type SoloTranscriptExtractPayload = {
  fields: ExtractedSoloFields
  transcript: string
}

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

function normalizeMedChange (raw: string): SoloMedicationChange {
  const t = raw.trim().toLowerCase()
  if (t === 'stop' || t === 'stopped' || t === 'remove' || t === 'discontinued') return 'stop'
  if (t === 'continue' || t === 'continuing' || t === 'keep') return 'continue'
  return 'add'
}

function normalizePriority (raw: string): string {
  const t = raw.trim().toLowerCase()
  if (t === 'high' || t === 'urgent') return 'High'
  if (t === 'low') return 'Low'
  return 'Medium'
}

export type ExtractSoloOutcome =
  | { ok: true; fields: ExtractedSoloFields }
  | { ok: false; message: string }

/**
 * Extract structured updates from a solo (patient-only) monologue — not a doctor visit.
 * Fills questions, medications, diagnoses directory rows, and tests to order.
 */
export async function extractSoloUpdateFieldsFromTranscript (
  transcript: string,
  context: {
    existingMeds: string[]
    knownDiagnoses: string[]
    knownDoctors: string[]
    /** YYYY-MM-DD anchor for relative time if mentioned. */
    anchorDateIso: string
  }
): Promise<ExtractSoloOutcome> {
  const anchor = context.anchorDateIso.trim() || new Date().toISOString().slice(0, 10)
  const doctors = context.knownDoctors.length
    ? context.knownDoctors.join(', ')
    : 'none listed'

  const prompt = `You are helping a patient update their personal health tracker from a SOLO voice note.
There is NO doctor in the room. The patient is speaking alone about symptoms, meds, conditions, upcoming tests, and questions they want to ask later.

Patient's current medications (from their record): ${context.existingMeds.join(', ') || 'none provided'}
Patient's known diagnoses (from their record): ${context.knownDiagnoses.join(', ') || 'none provided'}
Doctors already in their app (for matching names): ${doctors}

ANCHOR_DATE (today's context date): ${anchor}

Transcript:
${transcript}

GOAL: Return structured data to update: questions for doctors, current medications list, diagnosis directory, tests, and doctor profiles.

RULES:
1) "narrative_summary" — 2–4 sentences: what changed or what they need tracked. NOT a full transcript dump.

2) "doctors_mentioned" — EVERY distinct clinician the patient refers to by name or clear role+name (e.g. "Dr. Smith", "Sarah Chen at neurology").
   - Match names to "Doctors already in their app" when it is clearly the same person (use the app's spelling if listed).
   - "name": how they should appear in the directory (e.g. "Dr. Jane Smith" or "Jane Smith").
   - "specialty": only if they state it; else "".
   - "profile_note": one short sentence of new context for that provider (relationship, clinic, upcoming plan) — NOT a transcript paste; else "".
   - If they mention no specific clinician, use [].

3) "questions" — Questions they want to ask a doctor or clinic. One object per distinct question.
   - "doctor": who should answer (specific name if stated, else specialty like "Primary care", else "Your care team"). Prefer the same spelling as in doctors_mentioned when applicable.
   - "priority": High | Medium | Low from urgency they express.
   - Do NOT invent questions they did not imply.

4) "medications" — Only substances clearly meant as ongoing prescriptions or OTC they take regularly.
   - "change": "add" (new or dose change), "continue" (still taking, mention only), "stop" (explicitly stopped/discontinued).
   - If they only mention a drug in passing without taking/stopping intent, omit it or use "continue" if clearly still on it.

5) "diagnoses" — Conditions they report as part of THEIR health picture. Status must be one of: "Suspected", "Confirmed", "Ruled Out", "Resolved".
   - Use "Confirmed" when they state they have been diagnosed or it is established in their record context.
   - "Suspected" for worries or self-suspected issues not confirmed.
   - "Resolved" if they say a past condition is gone.
   - Include optional detail fields when they give enough to fill: how_or_why, treatment_plan, care_plan (short phrases).

6) "tests" — Labs, imaging, or studies they want, are waiting for, or said were ordered. "reason" may be brief.
   - "doctor_name": who ordered it or which doctor it is for, ONLY if they say a specific name; else "".

CRITICAL:
- Never paste the full transcript into any field.
- Do not fabricate clinical facts they did not say.

Return ONLY valid JSON with exactly these keys (no markdown, no backticks):
{
  "narrative_summary": "string",
  "doctors_mentioned": [{ "name": "string", "specialty": "string", "profile_note": "string" }],
  "questions": [{ "question": "string", "doctor": "string", "priority": "High" | "Medium" | "Low" }],
  "medications": [{ "medication": "string", "dose": "string", "frequency": "string", "change": "add" | "continue" | "stop" }],
  "diagnoses": [{ "diagnosis": "string", "status": "Suspected" | "Confirmed" | "Ruled Out" | "Resolved", "how_or_why": "string", "treatment_plan": "string", "care_plan": "string" }],
  "tests": [{ "test_name": "string", "reason": "string", "doctor_name": "string" }]
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
        'Could not reach the extract service. Check ANTHROPIC_API_KEY on generate-summary.',
    }
  }

  const payload = data as { result?: string; error?: string } | null
  if (payload?.error) {
    return { ok: false, message: payload.error }
  }

  if (payload == null || typeof payload.result !== 'string') {
    return {
      ok: false,
      message: 'Extract service returned no result.',
    }
  }

  const parsed = parseJsonObjectFromText(payload.result)
  if (!parsed) {
    return {
      ok: false,
      message: 'Could not parse structured data from the model. Try again or shorten the transcript.',
    }
  }

  return { ok: true, fields: normalizeExtractedSoloFields(parsed) }
}

export function normalizeExtractedSoloFields (raw: Record<string, unknown>): ExtractedSoloFields {
  const s = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '')

  const qRaw = raw.questions
  const questions: ExtractedSoloQuestionRow[] = Array.isArray(qRaw)
    ? qRaw.map((row) => {
        if (!row || typeof row !== 'object') {
          return { question: '', doctor: 'Your care team', priority: 'Medium' }
        }
        const o = row as Record<string, unknown>
        const question = typeof o.question === 'string' ? o.question : ''
        const doctor = typeof o.doctor === 'string' && o.doctor.trim()
          ? o.doctor.trim()
          : 'Your care team'
        return {
          question,
          doctor,
          priority: normalizePriority(typeof o.priority === 'string' ? o.priority : ''),
        }
      }).filter((q) => q.question.trim())
    : []

  const medsRaw = raw.medications
  const medications: ExtractedSoloMedicationRow[] = Array.isArray(medsRaw)
    ? medsRaw.map((m) => {
        if (!m || typeof m !== 'object') {
          return { medication: '', dose: '', frequency: '', change: 'add' as SoloMedicationChange }
        }
        const o = m as Record<string, unknown>
        const ch = typeof o.change === 'string' ? normalizeMedChange(o.change) : 'add'
        return {
          medication: typeof o.medication === 'string' ? o.medication : '',
          dose: typeof o.dose === 'string' ? o.dose : '',
          frequency: typeof o.frequency === 'string' ? o.frequency : '',
          change: ch,
        }
      }).filter((m) => m.medication.trim())
    : []

  const diagRaw = raw.diagnoses
  const diagnosesParsed = Array.isArray(diagRaw)
    ? diagRaw.map((d) => {
        if (!d || typeof d !== 'object') return normalizeDiagnosisDraftRow({})
        const o = d as Record<string, unknown>
        const statusRaw = typeof o.status === 'string' ? o.status : ''
        return normalizeDiagnosisDraftRow({
          diagnosis: typeof o.diagnosis === 'string' ? o.diagnosis : '',
          status: normalizeDiagnosisDirectoryStatus(statusRaw || 'Suspected'),
          how_or_why: typeof o.how_or_why === 'string' ? o.how_or_why : '',
          treatment_plan: typeof o.treatment_plan === 'string' ? o.treatment_plan : '',
          care_plan: typeof o.care_plan === 'string' ? o.care_plan : '',
        })
      })
    : []
  const diagnoses = dedupeDiagnosisRows(diagnosesParsed)

  const testsRaw = raw.tests
  const tests: { test_name: string; reason: string; doctor_name: string }[] = Array.isArray(testsRaw)
    ? testsRaw.map((t) => {
        if (!t || typeof t !== 'object') return { test_name: '', reason: '', doctor_name: '' }
        const o = t as Record<string, unknown>
        return {
          test_name: typeof o.test_name === 'string' ? o.test_name : '',
          reason: typeof o.reason === 'string' ? o.reason : '',
          doctor_name: typeof o.doctor_name === 'string' ? o.doctor_name : '',
        }
      }).filter((t) => t.test_name.trim())
    : []

  const docRaw = raw.doctors_mentioned
  const doctors_mentioned: ExtractedSoloDoctorMention[] = Array.isArray(docRaw)
    ? docRaw.map((row) => {
        if (!row || typeof row !== 'object') return { name: '', specialty: '', profile_note: '' }
        const o = row as Record<string, unknown>
        return {
          name: typeof o.name === 'string' ? o.name : '',
          specialty: typeof o.specialty === 'string' ? o.specialty : '',
          profile_note: typeof o.profile_note === 'string' ? o.profile_note : '',
        }
      }).filter((d) => d.name.trim())
    : []

  return {
    narrative_summary: s('narrative_summary'),
    questions,
    medications,
    diagnoses,
    tests,
    doctors_mentioned,
  }
}
