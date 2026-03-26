import { supabase } from './supabase'

export async function fetchNotificationPrefs () {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  return data as {
    browser_push_enabled: boolean | null
    high_pain_alert: boolean | null
    appointment_reminders: boolean | null
  } | null
}

export function tryBrowserNotification (title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, icon: undefined })
  } catch {
    /* ignore */
  }
}

export async function createInAppNotification (
  userId: string,
  title: string,
  body: string,
  notificationType: 'info' | 'warning' | 'reminder' | 'ai' = 'info',
) {
  await supabase.from('user_notifications').insert({
    user_id: userId,
    title,
    body,
    notification_type: notificationType,
  })
}

export async function maybeNotifyHighPain (userId: string, intensity: number) {
  const prefs = await fetchNotificationPrefs()
  if (prefs?.high_pain_alert === false) return
  if (intensity < 8) return

  await createInAppNotification(
    userId,
    'High pain entry logged',
    `You logged intensity ${intensity}/10. Consider contacting your clinician if this is new, worsening, or concerning.`,
    'warning',
  )

  if (prefs?.browser_push_enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    tryBrowserNotification('High pain logged', `Intensity ${intensity}/10 — check your tracker for details.`)
  }
}

export async function notifyMcasSuggestion (userId: string) {
  await createInAppNotification(
    userId,
    'Possible MCAS pattern',
    'Your reaction text matched common mast-cell type symptoms. Consider logging an MCAS episode if appropriate.',
    'info',
  )
}
