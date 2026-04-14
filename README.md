# Medical Bible (Medical Tracker)

Medical Bible is a browser-based personal health journal for tracking pain, symptoms, visits, medications, tests, diagnoses, questions, and appointments. Data lives in **your Supabase** project (Postgres, Auth, Storage). The app is for organization and handoff support, not diagnosis or treatment.

---

## Core features

- **Dashboard** — Upcoming appointments, quick log shortcuts, clinical handoff summary, PDF export, visit/solo transcript entry points.
- **Logging** — Pain and symptom flows (including MCAS-style logs), doctor questions, drafts/resume where applicable.
- **Records & analytics** — History, archived handoff summaries (see *Data on your device*), charts/trends.
- **Visits** — Wizard with optional transcript-assisted extraction; solo voice recording flow.
- **Care records** — Doctors (with profiles), medications (dose-change events), tests & orders, questions, diagnoses, appointments.
- **Account** — Profile (including optional **web push** reminders when configured).
- **Plushie shop** (optional) — Token earn/spend routes; disabled unless `VITE_GAME_TOKENS_ENABLED=true` and related migrations are applied.

---

## Where your data lives

| Kind | Storage |
|------|---------|
| Structured logs, visits, meds, auth user, etc. | **Supabase** (Postgres) — tied to your account |
| Saved **handoff summaries** list (Records → Summaries) | **Browser `localStorage`** on that origin only |
| **Archived transcripts** list | **Browser `localStorage`** only |
| Visit documents you upload | **Supabase Storage** (per migrations/RLS) |

Use the same site URL (e.g. production vs `localhost`) and browser, or archived summaries/transcripts will not appear—they are not synced to the cloud in the current app.

---

## Time display

User-facing times use 12-hour format (`h:mm AM/PM`). Stored values may use `HH:mm` / `HH:mm:ss` in SQL or the client.

---

## Local development

```bash
npm install
cp .env.example .env   # then fill in values (see below)
npm run dev
npm run build
```

**Supabase CLI** — Install and link the same project you use in `.env` when running migrations:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Deep-dive architecture, deployment, and troubleshooting: **[DEVELOPERS.md](./DEVELOPERS.md)**.

---

## Environment variables

Create **`.env`** or **`.env.local`** (see [`.env.example`](./.env.example)). Vite only exposes variables prefixed with **`VITE_`** to the browser at **build time**.

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Project URL (Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key (Settings → API) |
| `VITE_WEB_PUSH_PUBLIC_KEY` | For web push | Public VAPID key; must match Edge secret `WEB_PUSH_VAPID_PUBLIC_KEY` |
| `VITE_GAME_TOKENS_ENABLED` | No | Set to `true` to enable plushie shop routes and related RPCs |
| `VITE_SIMPLE_MASCOT_LOTTIE` | No | Custom Lottie path when plushies are off |
| `SUPABASE_DB_PASSWORD` | For `npm run supabase:push` | Database password so the CLI can apply migrations |
| `PUSH_REMINDER_CRON_TOKEN` | For `npm run push:run` / GitHub cron | Same value as Edge secret; never expose in frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Local/CI only — Playwright smoke-user setup (`npm run test:e2e`) |

**Production (e.g. Cloudflare Pages)** — Set the same `VITE_*` values in the host’s environment and **redeploy** so the bundle includes them. Do **not** put the VAPID **private** key or `PUSH_REMINDER_CRON_TOKEN` in static frontend env.

---

## Database and SQL

- **Source of truth:** `supabase/migrations/*.sql` (apply in filename order).
- **Push migrations:** `npm run supabase:push` (uses `SUPABASE_DB_PASSWORD` via wrapper script).
- Helper script load order: `.env`, then `.env.local` overrides.
- Ad-hoc SQL under `supabase/` that is not in `migrations/` is **not** applied automatically.

---

## Supabase Edge Functions (optional)

Deploy with `supabase functions deploy <name>` when you use these features. Secrets live in the Supabase Dashboard (or `supabase secrets set`).

| Function | Role |
|----------|------|
| **`push-reminders`** | Sends web push notifications for appointment/daily reminders; called on a schedule with `x-cron-token`. Configured in [`supabase/config.toml`](supabase/config.toml) (`verify_jwt = false` for cron). |
| **`generate-summary`** | Optional AI polish for the clinical handoff summary (server-side LLM keys). |
| **`transcribe-visit`** | Optional transcription-related flow. |

If these are not deployed, the app still works for manual logging and non-AI flows where applicable.

---

## Web push reminders (optional)

Requires `VITE_WEB_PUSH_PUBLIC_KEY`, VAPID keys and `PUSH_REMINDER_CRON_TOKEN` in **Edge Function secrets**, deployed `push-reminders`, and a **scheduler** (e.g. `npm run push:run` on a timer, or [`.github/workflows/push-reminders.yml`](.github/workflows/push-reminders.yml) with repository secrets). See `.env.example` and DEVELOPERS.md for details.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build locally |
| `npm run export:txt` | Three text files `exports/1.txt` … `3.txt`: full source + SQL split (see below) |
| `npm run export` | Timestamped zip of the codebase (see [`scripts/export-codebase.mjs`](scripts/export-codebase.mjs)) |
| `npm run supabase:push` | Apply database migrations to linked Supabase project |
| `npm run push:run` | POST to `push-reminders` Edge Function (needs `.env` tokens) |
| `npm run assets:more-grass` | Image asset helper |
| `npm run test:e2e` | Playwright + optional smoke user setup |
| `npm run test:e2e:only` | Playwright tests only |

---

## Full project export (three files: 1, 2, 3)

To generate a dump split across **three** text files of essentially all `.ts`, `.tsx`, `.sql`, configs, docs, workflows, etc. (excluding `node_modules`, `dist`, `exports`):

```bash
npm run export:txt
```

**Output (overwritten each run):** `exports/1.txt`, `exports/2.txt`, `exports/3.txt`. Part **1** contains the migration index / front matter; parts **2** and **3** continue the same `FILE:` sections in path order.

Details: [`docs/full-project-export.md`](docs/full-project-export.md).

---

## Route map

| Path | Area |
|------|------|
| `/` | Redirects to `/login` |
| `/login` | Sign in |
| `/app` | Dashboard (home) |
| `/app/log` | Quick log |
| `/app/charts-trends`, `/app/records` | Records hub |
| `/app/flares` | Redirect to charts/trends |
| `/app/analytics` | Analytics |
| `/app/meds` | Medications |
| `/app/doctors`, `/app/doctors/:id` | Doctors and doctor profile |
| `/app/tests` | Tests & orders |
| `/app/questions` | Questions |
| `/app/diagnoses` | Diagnoses |
| `/app/visits` | Visits |
| `/app/appointments` | Appointments |
| `/app/transcripts` | Transcripts |
| `/app/solo-record` | Solo recording |
| `/app/more` | More |
| `/app/profile` | Profile |
| `/app/archives` | Redirects to `/app` |
| `/app/plushies`, `/app/plushies/mine` | Plushie shop / mine (redirect to `/app` when feature off) |
| `/app/*` (unknown) | Not found |
| `*` (outside `/app`) | Not found |

---

## Service worker

[`public/sw.js`](public/sw.js) is registered from the client for **web push** when enabled. Requires a **secure context** (HTTPS or `localhost`).

---

*Personal health organizer; not a substitute for professional medical advice.*
