/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json (body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Best-effort message from AssemblyAI error JSON (shape varies by endpoint). */
function assemblyAiErrorMessage (data: Record<string, unknown>, httpStatus: number): string {
  const err = data.error
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err && typeof err === 'object' && err !== null && 'message' in err) {
    const m = (err as { message?: string }).message
    if (typeof m === 'string' && m.trim()) return m.trim()
  }
  const msg = data.message
  if (typeof msg === 'string' && msg.trim()) return msg.trim()
  const detail = data.detail
  if (typeof detail === 'string' && detail.trim()) return detail.trim()
  return `HTTP ${httpStatus}`
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    const ASSEMBLYAI_API_KEY = Deno.env.get('ASSEMBLYAI_API_KEY')
    if (!ASSEMBLYAI_API_KEY) {
      return json({ error: 'Missing ASSEMBLYAI_API_KEY — add it under Supabase → Edge Functions → Secrets.' })
    }

    const res = await fetch('https://api.assemblyai.com/v2/realtime/token', {
      method: 'POST',
      headers: {
        authorization: ASSEMBLYAI_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expires_in: 3600 }),
    })

    let data: Record<string, unknown>
    try {
      data = (await res.json()) as Record<string, unknown>
    } catch {
      return json({ error: `AssemblyAI: response was not JSON (HTTP ${res.status})` })
    }

    if (!res.ok) {
      const msg = assemblyAiErrorMessage(data, res.status)
      return json({ error: `AssemblyAI: ${msg}` })
    }

    const token = data.token
    if (typeof token !== 'string' || !token.trim()) {
      const hint = assemblyAiErrorMessage(data, res.status)
      const suffix =
        hint !== `HTTP ${res.status}`
          ? hint
          : 'No token in response — check your API key and AssemblyAI account.'
      return json({ error: `AssemblyAI: ${suffix}` })
    }

    return json({ token: token.trim() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: `transcribe-visit: ${msg}` })
  }
})
