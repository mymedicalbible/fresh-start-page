# Medical Bible (Medical Tracker)

Medical Bible is a browser-based personal health journal for tracking pain, symptoms, visits, medications, tests, diagnoses, questions, and appointments.

Data is stored in your Supabase project. The app is for organization and handoff support, not diagnosis or treatment.

---

## Core Features

- Dashboard with upcoming/recent appointment context, quick log shortcuts, pending visit recovery, handoff summary generation, and transcript launch points.
- Quick logging for pain, symptoms, and doctor questions (with draft/resume support).
- Charts/Trends area for history logs plus embedded analytics.
- Visits workflow with pending-resume support, visit details, and optional transcript-assisted extraction.
- Dedicated pages for doctors, medications, tests & orders, questions, diagnoses, appointments, transcripts, and account/profile.

---

## Time Display Policy

- User-facing times are shown in 12-hour format (`h:mm AM/PM`).
- Stored values can remain SQL/browser time strings (`HH:mm` / `HH:mm:ss`).

---

## Local Development

```bash
npm install
# Create .env or .env.local with:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
# SUPABASE_DB_PASSWORD=...   # required for npm run supabase:push
# SUPABASE_SERVICE_ROLE_KEY=...   # optional, enables smoke-user auto-setup for npm run test:e2e
# If pushing migrations, ensure Supabase CLI is installed and linked:
# supabase link --project-ref YOUR_PROJECT_REF
npm run dev
npm run build
```

See `DEVELOPERS.md` for deployment, migration workflow, and environment details.

---

## Database and SQL

- Source of truth: `supabase/migrations/*.sql` (timestamp ordered).
- Push migrations: `npm run supabase:push` (wrapper around `supabase db push --yes` using `SUPABASE_DB_PASSWORD`).
- Env load order for helper scripts: `.env` first, then `.env.local` overrides.
- Manual utility SQL files under `supabase/` are not auto-run.

---

## Route Map

| Path | Area |
|------|------|
| `/login` | Sign in |
| `/app` | Dashboard |
| `/app/log` | Quick log |
| `/app/charts-trends`, `/app/records` | Records |
| `/app/flares` | Redirect to charts/trends |
| `/app/analytics` | Analytics |
| `/app/meds` | Medications |
| `/app/doctors`, `/app/doctors/:id` | Doctors |
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
| `/app/plushies`, `/app/plushies/mine` | Feature-flagged routes; redirect to `/app` when disabled |
| `/` | Redirects to `/login` |
| `/app/*` | Not found page |
| `*` | Not found page |

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run export:txt` | Writes one text dump to `exports/ALL_CODE_AND_SQL.txt` (overwrites each run) |
| `npm run export` | Creates timestamped git archive zip in `exports/` |
| `npm run assets:more-grass` | Asset utility script |
| `npm run supabase:push` | Push DB migrations |
| `npm run test:e2e` | Smoke-user setup + Playwright tests (setup uses `SUPABASE_SERVICE_ROLE_KEY` if present) |
| `npm run test:e2e:only` | Playwright tests only (no smoke-user setup step) |

---

## Optional Backend Functions

When configured in Supabase Edge Functions:

- `generate-summary` for AI-assisted summary polish.
- `transcribe-visit` for transcription token flow.

If not configured, the app still works with non-AI flows.

---

*Personal health organizer; not a substitute for professional medical advice.*
