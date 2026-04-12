# Developer documentation — Medical Bible / Medical Tracker

**Using the app?** Start with **[README.md](./README.md)** (plain-language guide for everyday users).

---

# Medical .Bible Project (Medical Tracker)

A **private, personal health tracker** web application. It helps you log pain, symptoms, visits, medications, tests, diagnoses, and doctor questions in one place—then assemble a **doctor-ready clinical handoff narrative** (with optional AI polish and **PDF export**). Authentication, database, and file storage run on **Supabase**; the client is **Vite + React 18 + TypeScript**.

> **Sensitive data:** This app is built to hold medical information. Protect your Supabase project, never commit real `.env` files, use HTTPS in production, and treat **Row Level Security (RLS)** as mandatory—not optional.

---

## Table of contents

1. [What this app does](#what-this-app-does)
2. [Feature map](#feature-map)
3. [Routes](#routes)
4. [Tech stack](#tech-stack)
5. [Architecture at a glance](#architecture-at-a-glance)
6. [Prerequisites](#prerequisites)
7. [Local development](#local-development)
8. [Environment variables](#environment-variables)
9. [Database and migrations](#database-and-migrations)
10. [Medication change events and correlation](#medication-change-events-and-correlation)
11. [Clinical handoff summary](#clinical-handoff-summary)
12. [Storage (visit documents)](#storage-visit-documents)
13. [Deploying the frontend](#deploying-the-frontend)
14. [Deploying the AI Edge Function](#deploying-the-ai-edge-function)
15. [Troubleshooting](#troubleshooting)
16. [Security and compliance](#security-and-compliance)
17. [Project structure](#project-structure)
18. [Scripts](#scripts)
19. [License / contributing](#license--contributing)

---

## What this app does

- **Capture** structured health data (pain, MCAS-style symptom episodes, quick symptom snapshots, visits, meds, tests, questions, diagnoses, appointments).
- **Organize** it by time, doctor, and record type so you can find things before an appointment.
- **Summarize** in first-person “handoff” prose suitable to share with a clinician, with a **~90-day data window** for aggregation and **30-day-highlight** copy for recent pain/symptom intensity where applicable.
- **Optionally enhance** that summary with an LLM via a **Supabase Edge Function** (keys stay on the server).
- **Export** the final text as a **PDF** on the device (jsPDF).

The UI uses a **pastel, accessible theme** (mint, butter, sky, blush) defined in global CSS—no emoji in the primary dashboard layout.

---

## Feature map

| Area | Path / entry | What you get |
|------|----------------|--------------|
| **Dashboard** | `/app` | Upcoming appointments, pending-visit nudge, **Log today** grid (pain, symptoms, questions, visit), **Clinical handoff** (opens a slide-up panel—not a full-page form), **Your care & records** bento links |
| **Quick log** | `/app/log` | Fast flows for pain and symptoms; navigation to archives after save |
| **Records** | `/app/charts-trends`, `/app/records` (same hub; `/app/flares` redirects) | Pain / episode archives, summaries, embedded Analytics tab |
| **Analytics** | `/app/analytics` | Standalone charts (Recharts); data stays in the browser unless you screenshot/share |
| **Visits** | `/app/visits` | Visit wizard; **after save, returns to dashboard** by default |
| **Doctors** | `/app/doctors` | Scannable list; each card links to a **Doctor profile** |
| **Doctor profile** | `/app/doctors/:id` | Full-width sections: visits, questions, diagnoses, medications, tests for one provider |
| **Tests & orders** | `/app/tests` | Pending vs archived; completing can move items out of “current” |
| **Medications** | `/app/meds` | List with **PRN vs scheduled** toggle on add/edit, **Log dose change** modal (events + optional med field updates), archive on remove |
| **Questions** | `/app/questions` | Archive with **All / Open / Answered** filters; **green +** on the banner opens **add question**; Quick log (`/app/log?tab=questions`) for fast capture |
| **Diagnoses** | `/app/diagnoses` | Diagnosis directory |
| **Auth** | `/login` | Supabase email auth; `/app/*` is protected |

---

## Routes

| Path | Page |
|------|------|
| `/`, `*` | Redirect to `/app` |
| `/login` | Login |
| `/app` | Dashboard (home) |
| `/app/log` | Quick log |
| `/app/charts-trends` | Records hub (canonical with bottom nav) |
| `/app/records` | Records hub (alias) |
| `/app/flares` | Redirects to `/app/charts-trends` |
| `/app/analytics` | Analytics |
| `/app/meds` | Medications |
| `/app/doctors` | Doctor list |
| `/app/doctors/:id` | Doctor profile |
| `/app/tests` | Tests & orders |
| `/app/questions` | Questions |
| `/app/diagnoses` | Diagnoses |
| `/app/visits` | Visits / visit wizard |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| UI | React 18, React Router 6 |
| Build | Vite 6, TypeScript 5 |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Charts | Recharts |
| PDF | jsPDF |
| Optional AI | Edge Function `generate-summary` — Anthropic Claude first, optional OpenAI fallback |

---

## Architecture at a glance

```
Browser (React)
  ├── Supabase JS client (anon key) → PostgREST + Auth + Storage
  └── Edge Functions.invoke('generate-summary') → server-side LLM (optional)

Postgres
  ├── Tables for logs, visits, meds, tests, etc. (see migrations)
  ├── RLS: row access scoped to auth.uid()
  └── Triggers: e.g. medication_change_events on current_medications
```

- **All patient rows** should be protected by RLS policies defined in migrations.
- **Never** put service-role keys or LLM API keys in `VITE_*` variables—they are bundled into the client.

---

## Prerequisites

- **Node.js** 20+ (recommended)
- A **Supabase** project: [supabase.com](https://supabase.com)
- **Optional:** [Supabase CLI](https://supabase.com/docs/guides/cli) for `db push`, `secrets`, and `functions deploy`

---

## Local development

```bash
git clone <your-repo-url>
cd "Medical Bible Project"
npm install
cp .env.example .env
```

1. Open **Supabase → Project Settings → API**.
2. Set in `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. Apply **all** SQL migrations to your project (see [Database and migrations](#database-and-migrations)).

```bash
npm run dev
```

Vite prints the local URL (typically `http://localhost:5173`).

**Lockfile note:** CI hosts (e.g. Cloudflare Pages) often run `npm ci`. If CI reports lockfile drift, regenerate with `npm install` and commit the updated `package-lock.json`.

---

## Environment variables

### Frontend (`.env` — safe to expose in build)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Anonymous public key |

### Edge Function secrets (Supabase dashboard or CLI — **not** in Vite)

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Primary LLM (Claude) for `generate-summary` |
| `OPENAI_API_KEY` | Optional fallback (e.g. rate limits) |
| `OPENAI_MODEL` | Optional; defaults to `gpt-4o-mini` in the Edge Function |
| `ANTHROPIC_MODEL_FAST` / `ANTHROPIC_MODEL_THOROUGH` | Optional model overrides |

Example:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
# optional
supabase secrets set OPENAI_API_KEY=sk-...
```

---

## Database and migrations

Schema and **Row Level Security** live under `supabase/migrations/`. Apply files **in filename order** using the SQL Editor or:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

### “Relation already exists” / baseline an existing database

If **`supabase db push`** fails on **`20250325000000_initial.sql`** with `relation "profiles" already exists`, your **remote** database already has that schema, but Supabase’s **migration history table** does not list those files as applied—so the CLI tries to create everything again.

**Option A — Mark old migrations as applied, then push only new ones** (typical when the DB was set up via SQL Editor or an older workflow):

1. Ensure the database really matches what those migrations would create (you’ve been using the app successfully).
2. From the project root, run (PowerShell):

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/supabase-baseline-then-push.ps1
   ```

   That runs `supabase migration repair --status applied` for every migration **before** `20260411120000_game_tokens_trial`, then `supabase db push` so **only pending** migrations (usually the plushie/token file) apply.

   Or repair **manually** for each version you know is already reflected, then push:

   ```bash
   npx supabase migration repair --status applied 20250325000000 20250326000000
   # ... all versions through 20260408120000, then:
   npx supabase db push
   ```

**Option B — Only add plushie tokens:** open **SQL Editor**, paste `supabase/migrations/20260411120000_game_tokens_trial.sql`, run once. Optionally insert a row into `supabase_migrations.schema_migrations` for that version if you later want CLI history to match (advanced).

**Do not** baseline migrations if your remote DB might be missing objects those files add—fix schema or apply missing migrations first.

### Migration inventory

| File | Purpose |
|------|---------|
| `20250325000000_initial.sql` | Core schema: profiles, visits, pain, MCAS episodes, medications, reactions, doctors, questions, diagnoses, tests, RLS, auth-related triggers, etc. |
| `20250326000000_visit_docs_storage.sql` | Private Storage bucket + policies for visit documents |
| `20250403120000_doctor_visits_status.sql` | `doctor_visits.status`: `complete` \| `pending` (pending visits finish later) |
| `20250404100000_appointments_visit_logged.sql` | Appointments + `visit_logged` for dashboard |
| `20250404230000_symptom_logs.sql` | `symptom_logs` quick snapshots |
| `20250405000000_missing_columns.sql` | Idempotent fixes: missing columns/tables on older DBs (`doctor_visits.status`, `mcas_episodes.activity`, `doctors`, `tests_ordered`, etc.) |
| `20250406100000_medication_change_events.sql` | `medication_change_events` table + trigger on `current_medications` (insert/update/delete) for audit + handoff correlation |
| `20250407100000_visit_docs_storage_update.sql` | Storage policy update on `visit-docs` so objects can be updated (needed for some client upload flows) |
| `20250408100000_doctor_questions_specialty.sql` | `doctor_questions.doctor_specialty` (optional specialty when doctor is free text) |
| `20260408120000_doctor_questions_visit_link.sql` | `doctor_questions.doctor_visit_id` — link questions to a visit |
| `20260411120000_game_tokens_trial.sql` | **Plushie token game (trial):** `token_ledger`, `plushie_catalog`, `user_plushie_unlocks`, `game_config`, earn triggers, RPCs `game_get_state`, `game_purchase_active_plushie`, `game_try_grant_handoff_summary_tokens`, `game_grant_transcript_visit` |
| `20260411140000_panda_popcorn_lottie_path.sql` | Sets panda plushie `lottie_path` to `/lottie/panda-popcorn.json` (for DBs that already ran the trial migration) |

### Plushie tokens (required for `/app/plushies`)

The app **always** shows **More → Plushies**, but **balance, purchases, and earns** only work after this migration is applied to your Supabase project.

1. **CLI (recommended)** — from the project root, with [Supabase CLI](https://supabase.com/docs/guides/cli) installed and linked:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
   That applies any pending files under `supabase/migrations/`, including `20260411120000_game_tokens_trial.sql`.

2. **Dashboard (manual)** — **SQL Editor → New query**, paste the full contents of `supabase/migrations/20260411120000_game_tokens_trial.sql`, run once. If objects already exist, fix errors (e.g. skip duplicate) or rely on migrations table only via CLI.

After applying, run `supabase/verify_plushie_tokens.sql` in the SQL Editor (or check **Database → Functions** for `game_get_state`, **Table editor** for `token_ledger`, `plushie_catalog`, `user_plushie_unlocks`, `game_config`). The client calls RPCs with the **anon key + user JWT** (`authenticated` role); no Edge Function is required for tokens.

To **disable** token RPC calls from the client only, set `VITE_GAME_TOKENS_ENABLED=false` in the frontend env (optional).

**Tests & orders → document uploads** use the private **`visit-docs`** bucket with paths `${user_id}/tests/${test_id}/...`. Apply `20250326000000_visit_docs_storage.sql` and `20250407100000_visit_docs_storage_update.sql` on your Supabase project, or uploads will fail at the storage API.

If the app errors with **“column not found”** or **“schema cache”** issues, the remote database is usually missing the latest migration—re-apply and refresh the Supabase API schema if needed.

### Authentication

- Enable **Email** provider under **Authentication → Providers** as needed.
- Configure **email confirmation** according to your security preference.
- New users typically get a `profiles` row via patterns in the initial migration—verify triggers match your project.

---

## Medication change events and correlation

Two mechanisms work together:

1. **Database trigger** (`20250406100000_medication_change_events.sql`): Any insert/update/delete on `current_medications` writes a row to `medication_change_events` (`start` / `adjustment` / `stop` with previous/new dose and frequency when applicable).

2. **App “Log dose change”** (Medications page): Inserts an explicit `medication_change_events` row and can update **dose, frequency, effectiveness, side effects** on the current medication row when you save from that popup—so your handoff and lists stay coherent.

**Handoff narrative** (`src/lib/handoffNarrative.ts` + `src/lib/medSymptomCorrelation.ts`) compares **loose** before/after windows (~3 weeks) of pain and symptom episode counts around each event. This is **not** clinical inference of causation—it's a **timeline hint** for you and your doctor.

---

## Clinical handoff summary

### Where it lives

- **UI:** Dashboard → **Clinical handoff summary** → opens a **bottom sheet / panel** (generate, optional depth, patient focus, PDF, links).
- **App narrative:** `src/lib/handoffNarrative.ts` — first-person template, including:
  - Title line with date
  - Opening context (diagnoses + current meds)
  - **Past 30 days** pain/symptom highlights (counts, average, flares ≥7, areas, character; top symptoms)
  - **What I need to address today**
  - **Recent visits** / **Recent results**
  - **Medication changes & what happened** (correlation bullets)
  - **My questions for you**

### Optional AI

- Client sends **compact context** from `src/lib/summaryContext.ts` to `generate-summary`.
- If the function fails or keys are missing, the UI still shows the **app-generated** narrative and may show a short diagnostic message.
- **Patient focus** text is optional; it is persisted in `localStorage` (`mb-handoff-focus`) for convenience when generating again.

### PDF

- Implemented in `src/lib/summaryPdf.ts` using **jsPDF** (browser-only download).

---

## Storage (visit documents)

- Private bucket (see `20250326000000_visit_docs_storage.sql`, commonly `visit-docs`).
- Policies restrict object access to the owning authenticated user.
- Used by visit-related flows after migrations and bucket creation.

---

## Deploying the frontend

Typical static hosts: **Cloudflare Pages**, Netlify, Vercel, etc.

| Setting | Value |
|---------|--------|
| Install | `npm ci` (ensure `package-lock.json` is committed) or `npm install` |
| Build | `npm run build` |
| Output | `dist` |
| Env | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Do **not** expose the **service role** key or LLM keys in frontend environment variables.

---

## Deploying the AI Edge Function

1. Install and log in to Supabase CLI.
2. Link your project: `supabase link --project-ref YOUR_PROJECT_REF`
3. Set secrets (see [Environment variables](#environment-variables)).
4. Deploy:

```bash
supabase functions deploy generate-summary
```

Code: `supabase/functions/generate-summary/index.ts`.

If you do not deploy the function, the app **still works** with the built-in narrative.

---

## Troubleshooting

| Symptom | Likely cause | What to try |
|---------|----------------|-------------|
| `npm ci` fails / lockfile missing packages | Lockfile out of sync | Run `npm install`, commit `package-lock.json` |
| Type errors about missing `@types/*` | Corrupted or empty `node_modules` (e.g. cloud sync) | Delete broken folders under `node_modules/@types`, run `npm install` |
| “Column not found” / schema cache | Migration not applied | Run latest SQL migrations on Supabase |
| Edge Function invoke error | Not deployed, CORS, or missing secrets | Deploy function; set `ANTHROPIC_API_KEY`; check function logs |
| Pain/symptom data “missing” in summary | Date range | Summary aggregates ~90 days; opening paragraph emphasizes last 30 days where data exists |
| Medication correlation empty | No change events | Add/adjust meds or use **Log dose change**; ensure migration `20250406100000_*` is applied |

---

## Security and compliance

- This README is **not legal advice**. HIPAA, GDPR, and regional health-privacy rules may apply depending on how you host and who uses the app.
- Use **HTTPS**, strong passwords, and **RLS** on all user tables.
- Prefer **Edge Functions** (or another server) for third-party AI keys.
- If the repo lives in **OneDrive/iCloud**, occasional file-sync conflicts in `node_modules` can break installs; clean reinstall or exclude `node_modules` from sync.

---

## Project structure

```
src/
  App.tsx                    # Routes and auth guard
  main.tsx                   # React root + BrowserRouter
  index.css                  # Global pastel theme, buttons, cards, modals
  components/
    AppLayout.tsx            # Shell: header, outlet
    VisitLogWizard.tsx       # Visit logging flow
    ...                      # Other shared components
  contexts/
    AuthContext.tsx          # Supabase session
  pages/
    DashboardPage.tsx        # Home, handoff modal, bento links
    QuickLogPage.tsx
    RecordsPage.tsx
    AnalyticsPage.tsx
    MedicationsPage.tsx      # PRN toggle, dose-change popup, archive
    DoctorsPage.tsx
    DoctorProfilePage.tsx
    TestsOrderedPage.tsx
    QuestionsArchivePage.tsx
    DiagnosesDirectoryPage.tsx
    VisitsPage.tsx
    LoginPage.tsx
  lib/
    supabase.ts              # Browser client
    handoffNarrative.ts      # First-person handoff template
    medSymptomCorrelation.ts # Loose med change vs pain/symptom windows
    summaryContext.ts        # Compact blob for optional AI
    summaryPdf.ts            # PDF download
    parse.ts                 # Text helpers (areas, triggers, etc.)
supabase/
  migrations/                # Ordered SQL
  functions/
    generate-summary/        # Optional Claude / OpenAI handoff
public/                      # Icons, manifest (if used)
index.html                   # Entry HTML (e.g. theme-color)
.env.example                 # Template for VITE_* only
package.json
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` + production bundle to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run export:txt` | One **`.txt`** under `exports/` with **src**, **`supabase/migrations`**, **`supabase/functions`**, configs, CSS, etc. (skips `node_modules`, `dist`, `ExportedProject`, older `exports` dumps) |
| `npm run export` | **`git archive`** of tracked files as a **`.zip`** at repo root (requires Git) |
| `npm run test:e2e` | Playwright tests |

**Playwright** is listed in `devDependencies`; use `test:e2e` for the configured E2E suite.

### Full codebase text export

Use **`npm run export:txt`** when you want a single file to search, diff, or archive—especially to review **all SQL migrations** and app code together. Output path is printed when the script finishes (for example `exports/project-code-and-sql-2026-04-11-06-26-50.txt`).

---

## License / contributing

Add a **LICENSE** and contribution guidelines if you open-source or share the repository. When adding features:

- Prefer **new forward-only migrations** with clear timestamps.
- Document new **VITE_** vars here and new **Edge secrets** in the same section.
- Keep the ** anon** key in the client only; never commit `.env` with real secrets.

If you maintain a fork for a clinical study or caregiver use, document data retention and access controls separately.
