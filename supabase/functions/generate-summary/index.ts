// Supabase Edge Function — clinical handoff summary (Claude primary; optional OpenAI on 429)
// Deploy: supabase functions deploy generate-summary
// Secrets: ANTHROPIC_API_KEY (required for default path)
// Optional: OPENAI_API_KEY, OPENAI_MODEL (default gpt-4o-mini)
// Optional: ANTHROPIC_MODEL_FAST (default claude-3-haiku-20240307), ANTHROPIC_MODEL_THOROUGH (default claude-3-5-sonnet-20241022)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL_FAST = Deno.env.get('ANTHROPIC_MODEL_FAST') ?? 'claude-3-haiku-20240307'
const MODEL_THOROUGH = Deno.env.get('ANTHROPIC_MODEL_THOROUGH') ?? 'claude-3-5-sonnet-20241022'

function modelForMode (mode: string): string {
  return mode === 'fast' ? MODEL_FAST : MODEL_THOROUGH
}

const SYSTEM_PROMPT = `You prepare a clinical handoff document the patient will give to a physician (e.g. new specialist, PCP, or urgent care).

Rules:
- Write integrated narrative prose. Do NOT reorganize the patient's data as a long bullet list or row-by-row recap.
- Do NOT begin every sentence with a date. Weave timeline naturally.
- Ground statements in the PATIENT DATA provided in the user message. If important information is missing, say briefly it was not recorded in the app.
- Do NOT add new diagnoses, change treatment, or give prescriptive medical instructions.
- Start with an EXECUTIVE SUMMARY of 3–5 sentences (no label needed before it, or use the exact line EXECUTIVE SUMMARY on its own line first — either is fine).
- Then use exactly these section headings as plain lines (ALL CAPS), each on its own line, followed by one or more paragraphs:

CHIEF CONCERN AND FUNCTIONAL IMPACT
RECENT PAIN AND SYMPTOM COURSE
CURRENT MEDICATIONS
KNOWN DIAGNOSES AND BACKGROUND
RECENT ENCOUNTERS AND PLANS
PENDING TESTS, RESULTS, AND FOLLOW-UP
QUESTIONS AND GAPS FOR THE NEXT CLINICIAN

- Under CURRENT MEDICATIONS: list each medication with dose and frequency as given; note if details are missing.
- Under RECENT ENCOUNTERS: summarize recent visits narratively from the compressed visit lines (reason, findings/plan if present).
- Under PENDING TESTS: separate pending orders from completed tests with results when provided.
- Under QUESTIONS AND GAPS: quote the patient's open questions where helpful.
- Cite at most a few specific log examples when they illustrate a pattern; never reproduce every line from REFERENCE EXCERPT.
- Length: about 650–1100 words unless data are very sparse.

FEW-SHOT STYLE (fictional — match tone and structure only):

EXECUTIVE SUMMARY
Ms. Doe follows multiple inflammatory and autonomic symptoms tracked in a personal health app. Over the past two weeks she reports more frequent flares in hands and knees with fatigue limiting desk work on several days, compared with the prior month. She has documented medication changes from rheumatology and is waiting on CBC/CMP and anti-CCP drawn last week. She wishes to discuss sleep disruption and whether current therapy is sufficient for morning stiffness.

CHIEF CONCERN AND FUNCTIONAL IMPACT
She describes herself as previously active and now pacing schedules around pain and crashes. Standing tolerances vary; she did not quantify hours in the app, so specific functional metrics are limited.

RECENT PAIN AND SYMPTOM COURSE
Episodes cluster in the mornings per logged entries, with intensity spikes up to 8/10 on the worst days in the last 14 days versus a slightly lower average in the 15–90 day window. Representative entries mention peripheral joints and burning quality; she also logged MCAS-type episodes after exertion.

CURRENT MEDICATIONS
(Example only — you must use real data from PATIENT DATA) MTX 15 mg weekly, folic acid, NSAID PRN.

KNOWN DIAGNOSES AND BACKGROUND
Per her directory: inflammatory arthritis (confirmed), POTS (suspected) — verify against clinical records.

RECENT ENCOUNTERS AND PLANS
Last rheumatology note in the app documents dose adjustment and plan for repeat labs; primary care follow-up date recorded.

PENDING TESTS, RESULTS, AND FOLLOW-UP
CBC/CMP pending; MRI of hand mentioned as ordered.

QUESTIONS AND GAPS FOR THE NEXT CLINICIAN
She asks whether morning stiffness duration warrants switching biologics and how to coordinate cardiology for orthostasis.
`

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = await req.json()
    const patientData = (body.patientData ?? body.prompt) as string | undefined
    const patientFocus = (body.patientFocus as string | undefined)?.trim() ?? ''
    const mode = body.mode === 'fast' ? 'fast' : 'thorough'

    if (!patientData?.trim()) {
      throw new Error('No patientData provided.')
    }

    const userContent = [
      patientFocus ? `PATIENT PRIORITY (center the narrative on this when relevant):\n${patientFocus}\n\n` : '',
      'PATIENT DATA (from app):\n',
      patientData.trim(),
    ].join('')

    const model = modelForMode(mode)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    let summary = ''
    let usedFallback = false

    if (anthropicKey) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: 0.3,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        }),
      })

      if (res.status === 429) {
        summary = await tryOpenAI(userContent, SYSTEM_PROMPT)
        usedFallback = summary.length > 0
        if (!usedFallback) {
          const errText = await res.text()
          throw new Error(`Rate limited (${res.status}). OpenAI fallback failed or not configured. ${errText}`)
        }
      } else if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Anthropic API error (${res.status}): ${errText}`)
      } else {
        const data = await res.json()
        summary = data.content?.[0]?.text ?? ''
      }
    } else {
      summary = await tryOpenAI(userContent, SYSTEM_PROMPT)
      usedFallback = summary.length > 0
      if (!summary) throw new Error('ANTHROPIC_API_KEY is not set and OpenAI fallback failed.')
    }

    return new Response(JSON.stringify({ summary, model: usedFallback ? 'openai-fallback' : model }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

async function tryOpenAI (userContent: string, systemPrompt: string): Promise<string> {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) return ''
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  })
  if (!res.ok) return ''
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}
