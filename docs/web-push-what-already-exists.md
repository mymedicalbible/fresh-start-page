# Web push: what this repo already expects

This file summarizes how **this project** wires web push. It is not generic setup advice.

## What the app expects to exist

- **Browser (Vite build):** `VITE_WEB_PUSH_PUBLIC_KEY` is read when users enable push on the Profile page. It must be present at **build time** so the value is baked into the frontend bundle.
- **Supabase Edge Function `push-reminders`:** Secrets `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `PUSH_REMINDER_CRON_TOKEN`. Optionally `WEB_PUSH_VAPID_SUBJECT` (defaults to `mailto:alerts@example.com` in code if unset). The function also needs the usual `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (not listed in your four search terms, but required by the function).
- **Database:** Tables `push_subscriptions` and `push_reminder_dispatch_log` (from migrations), with RLS so users manage their own subscription rows.
- **Service worker:** `public/sw.js` handles incoming push and notification clicks; `src/main.tsx` registers `/sw.js` on load.
- **Scheduling (pick one path):** Something must **POST** to `https://<project>/functions/v1/push-reminders` about every five minutes with header `x-cron-token` matching `PUSH_REMINDER_CRON_TOKEN` (or the same value as `Authorization: Bearer …`). This repo supports:
  - `npm run push:run` (uses `.env` / `.env.local`), or
  - GitHub Actions (`.github/workflows/push-reminders.yml`), or
  - Optional **pg_cron** helper in migration `20260414193000_push_reminder_scheduler.sql` if database settings `app.settings.supabase_url` and `app.settings.push_cron_token` are set.

## What should stay in sync (do not change casually)

- **`VITE_WEB_PUSH_PUBLIC_KEY` and `WEB_PUSH_VAPID_PUBLIC_KEY`** must be the **same public VAPID key string**. If they drift apart, the browser subscription and the server signing keys no longer match, and sending can fail.
- **`WEB_PUSH_VAPID_PUBLIC_KEY` and `WEB_PUSH_VAPID_PRIVATE_KEY`** must stay a **matched pair** from the same generated VAPID key pair. Change both together when intentionally rotating keys.
- **`PUSH_REMINDER_CRON_TOKEN`** must be the **same secret** everywhere that calls the Edge Function: Edge Function secrets, local/CI env for `npm run push:run`, GitHub repository secrets for the workflow, and (if used) `app.settings.push_cron_token` in Postgres.

## What you normally should not touch unless you mean to rotate or reconfigure

- The VAPID **public** key in the frontend build and the VAPID **public + private** pair in Edge secrets (unless you are doing a deliberate key rotation and you are ready to have users re-enable push).
- The cron/shared secret `PUSH_REMINDER_CRON_TOKEN` (unless you are rotating it and updating every caller at once).

## What the code cannot show you (manual / outside the repo)

- The **actual secret strings** for VAPID keys and `PUSH_REMINDER_CRON_TOKEN` (they live in hosting env, Supabase Edge secrets, CI secrets, or optional DB settings—not in git).
- Whether **pg_cron** is actually enabled and the database URL/token settings were applied on your Supabase project.
- **Contact / subject** for VAPID: optional env `WEB_PUSH_VAPID_SUBJECT`; if unset, the Edge Function uses a default `mailto:` in code.
