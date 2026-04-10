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

export async function extractVisitFieldsFromTranscript (
  transcript: string,
  context: {
    doctorName: string
    existingMeds: string[]
    knownDiagnoses: string[]
  }
): Promise<ExtractedVisitFields | null> {
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

  if (error || !data?.result) return null

  try {
    const clean = data.result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean) as ExtractedVisitFields
  } catch {
    return null
  }
}
