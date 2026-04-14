import { supabase } from './supabase'

export type PushPrefs = {
  notificationsEnabled: boolean
  appointmentRemindersEnabled: boolean
  dailyNudgeEnabled: boolean
  dailyNudgeTimeLocal: string | null
}

type PushSubscriptionKeys = {
  p256dh: string
  auth: string
}

function getPublicVapidKey (): string {
  return String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY ?? '').trim()
}

function uint8FromBase64 (base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

function getSubscriptionKeys (sub: PushSubscription): PushSubscriptionKeys | null {
  const p256dh = sub.getKey('p256dh')
  const auth = sub.getKey('auth')
  if (!p256dh || !auth) return null
  const p256dhB64 = btoa(String.fromCharCode(...new Uint8Array(p256dh)))
  const authB64 = btoa(String.fromCharCode(...new Uint8Array(auth)))
  return { p256dh: p256dhB64, auth: authB64 }
}

export function canUseWebPush (): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export async function registerPushSubscription (prefs: PushPrefs): Promise<void> {
  if (!canUseWebPush()) throw new Error('This browser does not support web push notifications.')
  const vapidKey = getPublicVapidKey()
  if (!vapidKey) throw new Error('Missing VITE_WEB_PUSH_PUBLIC_KEY.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const registration = await navigator.serviceWorker.ready
  let sub = await registration.pushManager.getSubscription()
  if (!sub) {
    sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: uint8FromBase64(vapidKey),
    })
  }
  const keys = getSubscriptionKeys(sub)
  if (!keys) throw new Error('Unable to read push subscription keys.')

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null
  const timezoneOffsetMinutes = -new Date().getTimezoneOffset()
  const userAgent = navigator.userAgent
  const { data: me } = await supabase.auth.getUser()
  const userId = me.user?.id
  if (!userId) throw new Error('Not signed in.')

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: userAgent,
    notifications_enabled: prefs.notificationsEnabled,
    appointment_reminders_enabled: prefs.appointmentRemindersEnabled,
    daily_nudge_enabled: prefs.dailyNudgeEnabled,
    daily_nudge_time_local: prefs.dailyNudgeTimeLocal,
    timezone,
    timezone_offset_minutes: timezoneOffsetMinutes,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function syncPushPrefs (prefs: PushPrefs): Promise<void> {
  if (!canUseWebPush()) return
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return
  const { error } = await supabase
    .from('push_subscriptions')
    .update({
      notifications_enabled: prefs.notificationsEnabled,
      appointment_reminders_enabled: prefs.appointmentRemindersEnabled,
      daily_nudge_enabled: prefs.dailyNudgeEnabled,
      daily_nudge_time_local: prefs.dailyNudgeTimeLocal,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      timezone_offset_minutes: -new Date().getTimezoneOffset(),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('endpoint', sub.endpoint)
  if (error) throw error
}

export async function disablePushSubscription (): Promise<void> {
  if (!canUseWebPush()) return
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

