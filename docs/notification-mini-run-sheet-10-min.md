# Notification-only mini run sheet (10-minute isolate)

Goal: quickly prove whether push notifications are blocked by config, scheduling, timing, or browser/device state.

Use this in order. Stop at the first failed step and fix that before continuing.

## Minute 0-1: permission + secure context

- Open app on HTTPS (or `localhost`).
- In browser site settings for your app origin:
  - Notifications = **Allow**
  - Background/quiet mode is not blocking
- At OS level, turn off Focus Assist / Do Not Disturb during the test.

Expected: browser can legally display notifications for this origin.

## Minute 1-2: app toggle and subscription row

- In `/app/profile`, click **Enable push notifications**.
- Confirm success banner appears.
- Keep the tab open.

Expected: app registers a service-worker subscription and stores it in `push_subscriptions`.

## Minute 2-3: key alignment check (no rotation)

Confirm these values are already set and match:

- Frontend build env: `VITE_WEB_PUSH_PUBLIC_KEY`
- Edge secret: `WEB_PUSH_VAPID_PUBLIC_KEY`

These must be the same public key string. Do not change to new keys unless intentionally rotating.

## Minute 3-4: token + scheduler path check

Confirm same cron token value is used by all callers:

- Edge secret: `PUSH_REMINDER_CRON_TOKEN`
- Caller (local script or GitHub cron): `PUSH_REMINDER_CRON_TOKEN`

Expected: `push-reminders` accepts caller auth (`x-cron-token` / bearer token).

## Minute 4-6: force a known send window

Create conditions that are guaranteed to qualify:

- In profile push prefs:
  - Daily nudge = **On**
  - Time = **2-3 minutes from now**
- Ensure **no pain/symptom logs for today** on that account.

Why: daily nudge path is simplest and checked in a 5-minute window.

## Minute 6-7: trigger function once

Trigger one run during that window:

- Local: `npm run push:run`
- Or your cron runner if already configured

Expected: function is invoked while inside the window.

## Minute 7-9: inspect Edge logs and outcome

In Supabase logs for `push-reminders`, verify:

- No `401 Unauthorized` (token mismatch)
- No missing env errors (`WEB_PUSH_VAPID_*`, `PUSH_REMINDER_CRON_TOKEN`)
- Function processed subscriptions without runtime error

If logs show success but no popup appears, issue is usually browser/OS notification delivery state.

## Minute 9-10: classify failure quickly

- **Auth failure (`401`)** -> cron token mismatch between caller and Edge secret.
- **No send despite success** -> not actually in timing window, or business rule not met.
- **Function error** -> missing/invalid secrets or push endpoint failure.
- **No popup with successful send** -> OS/browser blocked presentation.

## Fast re-test loop

After one fix, repeat only:

1. Set daily nudge 2-3 min ahead.
2. Ensure no same-day logs.
3. Trigger `npm run push:run`.
4. Check popup + function logs.

This isolates push without retesting the full app.
