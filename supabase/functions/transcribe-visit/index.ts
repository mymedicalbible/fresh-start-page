/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUILD = 'v3-token-2026-04-10'

function json (body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'x-mb-transcribe-build': BUILD,
    },
  })
}

/** Best-effort message from AssemblyAI JSON error bodies. */
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
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => (typeof d === 'object' && d !== null ? JSON.stringify(d) : String(d)))
    return parts.join('; ') || `HTTP ${httpStatus}`
  }
  return `HTTP ${httpStatus}`
}

function describeNonJsonBody (status: number, raw: string): string {
  const t = raw.trim().slice(0, 280)
  const looksLikeV2Gone =
    status === 404 &&
    (/\bnot\s*found\b/i.test(raw) || raw.length < 80)
  const redeploy =
    ' Redeploy this function: `supabase functions deploy transcribe-visit` (must use GET https://streaming.assemblyai.com/v3/token).'
  if (looksLikeV2Gone) {
    return (
      `AssemblyAI returned non-JSON 404 (${t || 'empty body'}). This usually means an old Edge Function is still calling the removed v2 token URL.` +
      redeploy
    )
  }
  return `AssemblyAI: response was not JSON (HTTP ${status})${t ? ` — ${t}` : ''}`
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    const rawKey = Deno.env.get('ASSEMBLYAI_API_KEY')
    const ASSEMBLYAI_API_KEY = typeof rawKey === 'string' ? rawKey.trim() : ''
    if (!ASSEMBLYAI_API_KEY) {
      return json({ error: 'Missing ASSEMBLYAI_API_KEY — add it under Supabase → Edge Functions → Secrets.' })
    }

    const tokenUrl = new URL('https://streaming.assemblyai.com/v3/token')
    tokenUrl.searchParams.set('expires_in_seconds', '600')

    const res = await fetch(tokenUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: ASSEMBLYAI_API_KEY,
        Accept: 'application/json',
      },
    })

    const rawText = await res.text()
    let data: Record<string, unknown>
    try {
      data = JSON.parse(rawText) as Record<string, unknown>
    } catch {
      return json({
        error: describeNonJsonBody(res.status, rawText),
        build: BUILD,
      })
    }

    if (!res.ok) {
      const msg = assemblyAiErrorMessage(data, res.status)
      return json({
        error:
          `AssemblyAI: ${msg}` +
          (res.status === 404 && msg.toLowerCase().includes('invalid api')
            ? ' Double-check ASSEMBLYAI_API_KEY in Supabase secrets (no extra spaces; copy full key from the AssemblyAI dashboard).'
            : ''),
        build: BUILD,
      })
    }

    const token = data.token
    if (typeof token !== 'string' || !token.trim()) {
      const hint = assemblyAiErrorMessage(data, res.status)
      const suffix =
        hint !== `HTTP ${res.status}`
          ? hint
          : 'No token in response — check your API key and AssemblyAI account.'
      return json({ error: `AssemblyAI: ${suffix}`, build: BUILD })
    }

    return json({ token: token.trim(), build: BUILD })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: `transcribe-visit: ${msg}`, build: BUILD })
  }
})
