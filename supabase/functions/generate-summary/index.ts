/// <reference path="../deno.d.ts" />
// Supabase Edge Function — clinical handoff summary (Claude primary; optional OpenAI on 429)
// SYSTEM_PROMPT — keep in sync with src/lib/aiHandoffPrompt.ts (HANDOFF_AI_SYSTEM_PROMPT)
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

const SYSTEM_PROMPT = `You prepare a clinical handoff the patient will give a physician. It must read like a nurse's verbal handoff: a short story first (so what), then what needs attention today, then supporting detail.

Rules:
- Write integrated narrative prose. Do NOT reorganize data as a long bullet list or row-by-row recap.
- Ground statements in PATIENT DATA; if something is missing, say briefly it was not recorded.
- Do NOT add new diagnoses or prescribe, change, or recommend medications or treatments. Do NOT suggest that anything "warrants" therapy, medications, dose changes, or procedures. You may describe what was logged and what the patient is tracking; decisions belong to their licensed clinician.
- Do NOT tell the patient what they should do medically. If you mention symptoms or trends, describe them factually only (e.g. "reported pain averaged X/10").

If PATIENT DATA includes MEDICATION CHANGES vs SYMPTOM/PAIN: treat it as approximate app-derived correlation (before/after windows), not proof of causation; weave into section 5 when useful.

Use exactly these numbered section headings (same wording), each on its own line, then content:

1. PATIENT SNAPSHOT
   3–5 sentences max: who they are in clinical terms (key diagnoses), current regimen in plain language, pain/symptom burden in one breath, and what is pending (tests/questions). Like a single tight verbal handoff paragraph.

2. ACTIVE CONCERNS (ADDRESS TODAY)
   Interpret, don't just list numbers: what is worsening, uncontrolled, high-impact flares, or salient for this visit (include pending workup and patient questions). Describe only — do not recommend treatment. Short bullets or 1–2 short paragraphs.

3. CURRENT TREATMENT
   Clean list: medications with dose and frequency; flag PRN/as-needed when stated. Then diagnoses from directory. Note patient-reported effectiveness if present.

4. RECENT VISITS AND FOLLOW-UP
   What happened, what was ordered, outstanding follow-up — compact.

5. MEDICATION CHANGES AND SYMPTOM CORRELATION
   Summarize any dose/start/stop events and the app's before/after symptom & pain counts (if provided). State clearly this is associative only.

6. MY QUESTIONS FOR YOU
   Patient's open questions last so they stay top-of-mind — quote where helpful.

- Length: about 450–900 words unless data are very sparse.
- Cite at most a few log examples; never dump REFERENCE EXCERPT line-by-line.

FEW-SHOT STYLE (fictional — match tone only; do not copy diagnoses or treatments):

1. PATIENT SNAPSHOT
Ms. Doe is tracking suspected POTS and hEDS with rheumatology and cardiology involvement. She is on propranolol 20 mg TID and MTX 15 mg weekly with PRN NSAID. Pain has been moderate overall with several high-intensity days; MCAS-type episodes cluster after exertion. She has one pending orthostatic workup and wants to discuss morning symptoms with her team.

2. ACTIVE CONCERNS (ADDRESS TODAY)
Recent flare frequency is up compared with the prior month; orthostatic symptoms remain limiting on days she logged. CBC/CMP from last week is still listed as pending in the app.

3. CURRENT TREATMENT
(Use real data.) Propranolol 20 mg TID; MTX 15 mg weekly; folic acid. Diagnoses per app: inflammatory arthritis (confirmed); POTS (suspected).

4. RECENT VISITS AND FOLLOW-UP
Rheumatology noted MTX; repeat labs mentioned. Cardiology follow-up noted.

5. MEDICATION CHANGES AND SYMPTOM CORRELATION
After propranolol titration (per app log), episode counts in the following window differed from the prior window — correlation only, not causation.

6. MY QUESTIONS FOR YOU
She wants to review morning stiffness duration with rheumatology and timing of cardiology follow-up for orthostasis.
`

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  try {
    const body = await req.json()
    const isExtract = body.mode === 'extract'

    let userContent: string
    let systemPromptForRequest: string
    let mode: 'fast' | 'thorough'

    if (isExtract) {
      const customPrompt = (body.customPrompt as string | undefined)?.trim()
      if (!customPrompt) {
        throw new Error('No customPrompt provided.')
      }
      userContent = customPrompt
      systemPromptForRequest = 'You follow the user instructions exactly.'
      mode = 'thorough'
    } else {
      const patientData = (body.patientData ?? body.prompt) as string | undefined
      const patientFocus = (body.patientFocus as string | undefined)?.trim() ?? ''
      mode = body.mode === 'fast' ? 'fast' : 'thorough'

      if (!patientData?.trim()) {
        throw new Error('No patientData provided.')
      }

      userContent = [
        patientFocus ? `PATIENT PRIORITY (center the narrative on this when relevant):\n${patientFocus}\n\n` : '',
        'PATIENT DATA (from app):\n',
        patientData.trim(),
      ].join('')

      systemPromptForRequest = SYSTEM_PROMPT
    }

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
          system: systemPromptForRequest,
          messages: [{ role: 'user', content: userContent }],
        }),
      })

      if (res.status === 429) {
        summary = await tryOpenAI(userContent, systemPromptForRequest)
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
      summary = await tryOpenAI(userContent, systemPromptForRequest)
      usedFallback = summary.length > 0
      if (!summary) throw new Error('ANTHROPIC_API_KEY is not set and OpenAI fallback failed.')
    }

    if (isExtract) {
      return new Response(JSON.stringify({ result: summary }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
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
