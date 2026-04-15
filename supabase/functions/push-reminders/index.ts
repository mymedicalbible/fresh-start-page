/// <reference path="../deno.d.ts" />
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
}

type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  appointment_reminders_enabled: boolean
  daily_nudge_enabled: boolean
  daily_nudge_time_local: string | null
  timezone_offset_minutes: number | null
}

type AppointmentRow = {
  id: string
  doctor: string | null
  appointment_date: string
  appointment_time: string | null
  visit_logged: boolean | null
}

type ManualTestBody = {
  trigger?: string
}

function nowIso (): string {
  return new Date().toISOString()
}

function parseAppointmentUtcMs (row: AppointmentRow, offsetMinutes: number): number {
  const [y, m, d] = row.appointment_date.split('-').map((v) => Number(v))
  const t = (row.appointment_time || '09:00').slice(0, 5)
  const [hh, mm] = t.split(':').map((v) => Number(v))
  const utc = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0)
  return utc - (offsetMinutes * 60 * 1000)
}

function doctorNorm (v: string | null | undefined): string {
  return String(v ?? '').trim().toLowerCase()
}

function sameDoctorLabel (a: string | null | undefined, b: string | null | undefined): boolean {
  return doctorNorm(a).replace(/^dr\.?\s+/i, '') === doctorNorm(b).replace(/^dr\.?\s+/i, '')
}

async function alreadySent (
  db: ReturnType<typeof createClient>,
  subscriptionId: string,
  dedupeKey: string,
): Promise<boolean> {
  const { data } = await db
    .from('push_reminder_dispatch_log')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()
  return !!data?.id
}

async function sendPush (
  db: ReturnType<typeof createClient>,
  sub: PushSubscriptionRow,
  payload: Record<string, unknown>,
  kind: 'pre_appt_questions' | 'post_appt_pending' | 'daily_log_nudge',
  dedupeKey: string,
  scheduledForIso: string,
) {
  if (await alreadySent(db, sub.id, dedupeKey)) return
  const details = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  }
  try {
    await webpush.sendNotification(details, JSON.stringify(payload))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('404') || message.includes('410')) {
      await db.from('push_subscriptions').delete().eq('id', sub.id)
      return
    }
    throw err
  }
  await db.from('push_reminder_dispatch_log').insert({
    user_id: sub.user_id,
    subscription_id: sub.id,
    reminder_kind: kind,
    dedupe_key: dedupeKey,
    scheduled_for: scheduledForIso,
    sent_at: nowIso(),
    payload,
  })
}

async function processSubscription (
  db: ReturnType<typeof createClient>,
  sub: PushSubscriptionRow,
  nowMs: number,
) {
  const offset = sub.timezone_offset_minutes ?? 0
  const windowMs = 5 * 60 * 1000

  if (sub.appointment_reminders_enabled) {
    const { data: appts } = await db
      .from('appointments')
      .select('id, doctor, appointment_date, appointment_time, visit_logged')
      .eq('user_id', sub.user_id)
      .gte('appointment_date', new Date(nowMs - (36 * 60 * 60 * 1000)).toISOString().slice(0, 10))
      .lte('appointment_date', new Date(nowMs + (2 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10))
    for (const appt of ((appts ?? []) as AppointmentRow[])) {
      const apptMs = parseAppointmentUtcMs(appt, offset)
      const preMs = apptMs - (60 * 60 * 1000)
      const postMs = apptMs + (60 * 60 * 1000)
      const doctor = doctorNorm(appt.doctor)

      if (Math.abs(nowMs - preMs) <= windowMs) {
        const { data: questionRows } = await db
          .from('doctor_questions')
          .select('id, doctor')
          .eq('user_id', sub.user_id)
          .eq('appointment_date', appt.appointment_date)
        const matchingQuestions = (questionRows ?? []).filter((row) => sameDoctorLabel(row.doctor, appt.doctor))
        if (matchingQuestions.length === 0) {
          await sendPush(
            db,
            sub,
            {
              title: 'Medical Bible — Add questions for your visit',
              body: `Appointment with ${appt.doctor ?? 'your doctor'} is in about 1 hour. Add questions if you have them.`,
              url: `/app/questions?tab=open${doctor ? `&doctor=${encodeURIComponent(appt.doctor ?? '')}` : ''}`,
              tag: `pre-appt-${appt.id}`,
              icon: '/app-icon.png',
            },
            'pre_appt_questions',
            `pre_appt_questions:${appt.id}`,
            new Date(preMs).toISOString(),
          )
        }
      }

      if (Math.abs(nowMs - postMs) <= windowMs) {
        const { data: questionRows } = await db
          .from('doctor_questions')
          .select('id, doctor, status')
          .eq('user_id', sub.user_id)
          .eq('appointment_date', appt.appointment_date)
        const unanswered = (questionRows ?? []).filter((row) =>
          sameDoctorLabel(row.doctor, appt.doctor) && String(row.status ?? '') === 'Unanswered',
        ).length

        const { data: visitRows } = await db
          .from('doctor_visits')
          .select('id, doctor, status')
          .eq('user_id', sub.user_id)
          .eq('visit_date', appt.appointment_date)
        const pendingVisits = (visitRows ?? []).filter((row) =>
          sameDoctorLabel(row.doctor, appt.doctor) && String(row.status ?? '') === 'pending',
        ).length

        const pendingLog = appt.visit_logged !== true || pendingVisits > 0
        const hasPendingQuestions = unanswered > 0
        if (pendingLog || hasPendingQuestions) {
          await sendPush(
            db,
            sub,
            {
              title: 'Medical Bible — Finish visit follow-up',
              body: `Appointment with ${appt.doctor ?? 'your doctor'} was about an hour ago. Log your visit notes and questions.`,
              url: `/app/visits?returnTo=${encodeURIComponent('/app/profile')}`,
              tag: `post-appt-${appt.id}`,
              icon: '/app-icon.png',
            },
            'post_appt_pending',
            `post_appt_pending:${appt.id}`,
            new Date(postMs).toISOString(),
          )
        }
      }
    }
  }

  if (sub.daily_nudge_enabled && sub.daily_nudge_time_local) {
    const t = sub.daily_nudge_time_local.slice(0, 5)
    const [hh, mm] = t.split(':').map((v) => Number(v))
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      const localNow = new Date(nowMs + (offset * 60 * 1000))
      const y = localNow.getUTCFullYear()
      const m = localNow.getUTCMonth()
      const d = localNow.getUTCDate()
      const localNudgeUtcMs = Date.UTC(y, m, d, hh, mm, 0, 0) - (offset * 60 * 1000)
      if (Math.abs(nowMs - localNudgeUtcMs) <= windowMs) {
        const localDate = new Date(localNudgeUtcMs + (offset * 60 * 1000)).toISOString().slice(0, 10)
        const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - (offset * 60 * 1000)).toISOString()
        const endUtc = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0) - (offset * 60 * 1000)).toISOString()
        const [p, s] = await Promise.all([
          db.from('pain_entries').select('id', { head: true, count: 'exact' }).eq('user_id', sub.user_id).gte('created_at', startUtc).lt('created_at', endUtc),
          db.from('mcas_symptom_logs').select('id', { head: true, count: 'exact' }).eq('user_id', sub.user_id).gte('created_at', startUtc).lt('created_at', endUtc),
        ])
        if ((p.count ?? 0) + (s.count ?? 0) === 0) {
          await sendPush(
            db,
            sub,
            {
              title: 'Medical Bible — Daily log nudge',
              body: 'No entries yet today. Add a quick pain or symptom log.',
              url: '/app/log',
              tag: `daily-nudge-${localDate}`,
              icon: '/app-icon.png',
            },
            'daily_log_nudge',
            `daily_log_nudge:${localDate}`,
            new Date(localNudgeUtcMs).toISOString(),
          )
        }
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim()
    const serviceRole = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim()
    const vapidPublicKey = (Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY') ?? '').trim()
    const vapidPrivateKey = (Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY') ?? '').trim()
    const vapidSubject = (Deno.env.get('WEB_PUSH_VAPID_SUBJECT') ?? 'mailto:alerts@example.com').trim()
    const cronToken = (Deno.env.get('PUSH_REMINDER_CRON_TOKEN') ?? '').trim()

    if (!supabaseUrl || !serviceRole) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    if (!vapidPublicKey || !vapidPrivateKey) throw new Error('Missing WEB_PUSH_VAPID_PUBLIC_KEY/WEB_PUSH_VAPID_PRIVATE_KEY.')
    if (!cronToken) {
      return new Response(
        JSON.stringify({ error: 'Configure PUSH_REMINDER_CRON_TOKEN in Edge Function secrets.' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } },
      )
    }
    let requestBody: ManualTestBody = {}
    try {
      requestBody = await req.json()
    } catch {
      requestBody = {}
    }
    const tokenHeader = (req.headers.get('x-cron-token') ?? '').trim()
    const authBearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    const isCronAuthorized = tokenHeader === cronToken || authBearer === cronToken

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
    if (!isCronAuthorized && requestBody.trigger === 'manual-test') {
      if (!authBearer) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      const { data: authData, error: authError } = await db.auth.getUser(authBearer)
      const userId = authData.user?.id
      if (authError || !userId) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      const { data: userSubs, error: userSubError } = await db
        .from('push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth')
        .eq('user_id', userId)
        .eq('notifications_enabled', true)
      if (userSubError) throw userSubError

      let sent = 0
      for (const sub of ((userSubs ?? []) as Array<Pick<PushSubscriptionRow, 'id' | 'user_id' | 'endpoint' | 'p256dh' | 'auth'>>)) {
        const details = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        }
        try {
          await webpush.sendNotification(details, JSON.stringify({
            title: 'Medical Bible test notification',
            body: 'Push is working for this device.',
            url: '/app/profile',
            tag: 'manual-test-push',
            icon: '/app-icon.png',
          }))
          sent += 1
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('404') || message.includes('410')) {
            await db.from('push_subscriptions').delete().eq('id', sub.id)
          }
        }
      }

      return new Response(JSON.stringify({ ok: true, mode: 'manual-test', processed: (userSubs ?? []).length, sent }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (!isCronAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const { data: subs, error } = await db
      .from('push_subscriptions')
      .select('id,user_id,endpoint,p256dh,auth,appointment_reminders_enabled,daily_nudge_enabled,daily_nudge_time_local,timezone_offset_minutes')
      .eq('notifications_enabled', true)
    if (error) throw error

    const now = Date.now()
    for (const sub of ((subs ?? []) as PushSubscriptionRow[])) {
      await processSubscription(db, sub, now)
    }

    return new Response(JSON.stringify({ ok: true, processed: (subs ?? []).length }), {
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

