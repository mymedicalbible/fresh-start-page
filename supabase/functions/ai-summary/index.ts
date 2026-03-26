import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function summarizeLocally (
  d: Record<string, unknown[]>,
  type: string,
  days: number,
): string {
  return [
    'AI is not configured (set OPENAI_API_KEY on this Edge Function).',
    `Summary type: ${type} · window: ${days} days`,
    `Counts — visits: ${d.doctor_visits?.length ?? 0}, reactions: ${d.med_reactions?.length ?? 0}, ` +
      `MCAS: ${d.mcas_episodes?.length ?? 0}, pain: ${d.pain_entries?.length ?? 0}, ` +
      `current meds: ${d.current_medications?.length ?? 0}, questions: ${d.doctor_questions?.length ?? 0}.`,
    'Deploy the secret to receive a full narrative summary.',
  ].join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: { summaryType?: string; days?: number } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const summaryType = body.summaryType ?? 'full'
    const days = Math.min(Math.max(Number(body.days) || 30, 1), 365)
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().slice(0, 10)

    const [visits, reactions, mcas, pain, meds, questions, diagnosis] = await Promise.all([
      supabase.from('doctor_visits').select('*').eq('user_id', user.id).gte('visit_date', sinceStr),
      supabase.from('med_reactions').select('*').eq('user_id', user.id).gte('reaction_date', sinceStr),
      supabase.from('mcas_episodes').select('*').eq('user_id', user.id).gte('episode_date', sinceStr),
      supabase.from('pain_entries').select('*').eq('user_id', user.id).gte('entry_date', sinceStr),
      supabase.from('current_medications').select('*').eq('user_id', user.id),
      supabase.from('doctor_questions').select('*').eq('user_id', user.id),
      supabase.from('diagnosis_notes').select('*').eq('user_id', user.id).gte('note_date', sinceStr),
    ])

    const datasets: Record<string, unknown[]> = {
      doctor_visits: visits.data ?? [],
      med_reactions: reactions.data ?? [],
      mcas_episodes: mcas.data ?? [],
      pain_entries: pain.data ?? [],
      current_medications: meds.data ?? [],
      doctor_questions: questions.data ?? [],
      diagnosis_notes: diagnosis.data ?? [],
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) {
      const preview = summarizeLocally(datasets, summaryType, days)
      return new Response(
        JSON.stringify({ summary: preview, summaryType, days, aiEnabled: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const systemPrompt =
      `You are a clinical documentation assistant helping a patient organize their own health journal for discussion with licensed clinicians. ` +
      `You do not diagnose, prescribe, or replace medical advice. Use sections with clear headings and bullets. ` +
      `If data suggest emergencies (e.g. crushing chest pain, anaphylaxis, suicidal ideation), tell the user to seek urgent in-person care. ` +
      `Otherwise use phrasing like "patterns to discuss with your care team."`

    let userPrompt = ''
    if (summaryType === 'doctor') {
      userPrompt =
        `Summarize recent doctor visits (past ${days} days). JSON:\n${JSON.stringify(datasets.doctor_visits)}`
    } else if (summaryType === 'mcas') {
      userPrompt =
        `Summarize MCAS episodes: triggers, severity patterns, relief strategies (past ${days} days). JSON:\n${JSON.stringify(datasets.mcas_episodes)}`
    } else if (summaryType === 'medication') {
      userPrompt = `Summarize medications: current list, reactions, and effectiveness scores (past ${days} days). JSON:\n${JSON.stringify(
        { current_medications: datasets.current_medications, med_reactions: datasets.med_reactions },
      )}`
    } else if (summaryType === 'pain') {
      userPrompt =
        `Summarize pain: locations, intensity course, triggers/relief (past ${days} days). JSON:\n${JSON.stringify(datasets.pain_entries)}`
    } else {
      userPrompt =
        `Integrated health journal summary for the past ${days} days. Include: care timeline, med/reaction themes, pain/MACS highlights, ` +
        `unanswered doctor questions, and concise talking points for the next visit. JSON:\n${JSON.stringify(datasets)}`
    }

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt.slice(0, 100000) },
        ],
        temperature: 0.35,
      }),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      console.error('OpenAI error', errText)
      return new Response(JSON.stringify({ error: 'OpenAI request failed', detail: errText }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openaiJson = await openaiRes.json()
    const summary = openaiJson.choices?.[0]?.message?.content ?? ''

    return new Response(JSON.stringify({ summary, summaryType, days, aiEnabled: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
