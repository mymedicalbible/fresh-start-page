# Medical Bible Project

A personal health tracker web app: multi-user, with Supabase for **authentication**, **Postgres**, and **private file storage**. Built with **Vite**, **React 18**, and **TypeScript**. The UI covers quick logging, archives, doctor relationships, tests and orders, medications, diagnoses, questions, visit notes, charts, and an optional **clinical handoff summary** (app-generated and/or AI via an Edge Function) with **PDF download**.

> This repository stores **sensitive medical information**. Treat keys, backups, and deployment settings accordingly.

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Local development](#local-development)
5. [Environment variables](#environment-variables)
6. [Database (Supabase)](#database-supabase)
7. [Storage (visit documents)](#storage-visit-documents)
8. [Dashboard health summary](#dashboard-health-summary)
9. [Deploying the frontend](#deploying-the-frontend)
10. [Security and compliance notes](#security-and-compliance-notes)
11. [Project structure](#project-structure)
12. [Scripts](#scripts)

---

## Features

| Area | Description |
|------|-------------|
| **Dashboard** | Upcoming appointments, quick 30-day stats, clinical handoff summary (see below), PDF export, navigation into archives |
| **Quick log** | Fast entry flows for pain, symptoms (MCAS episodes), and related tracking |
| **Records** | Hub for pain/symptom archives and related entry points |
| **Analytics** | Charts and trends for logged pain, MCAS/symptom episodes, and reactions (client-side only; chart data is not sent to AI) |
| **Visits** | Doctor visit log / wizard; after save, navigation returns to the home dashboard by default |
| **Doctors** | Scannable list of providers; **Doctor profile** (`/app/doctors/:id`) holds visits, questions, diagnoses, medications, and tests for one doctor |
| **Tests & orders** | Pending vs archived views; completing orders moves them out of “current” |
| **Medications** | Medication list and tracking |
| **Questions** | Question archive with filters (e.g. open/unanswered) |
| **Diagnoses** | Diagnosis directory tied to your records |
| **Auth** | Email sign-in via Supabase Auth; routes under `/app` are protected |

---

## Tech stack

- **Frontend:** React 18, React Router 6, Vite 6, TypeScript 5  
- **Backend:** Supabase (PostgREST, GoTrue auth, Storage)  
- **Charts:** Recharts  
- **PDF:** jsPDF (handoff summary download)  
- **Optional AI:** Supabase Edge Function `generate-summary` (Claude primary, optional OpenAI fallback) — see [Dashboard health summary](#dashboard-health-summary)

---

## Prerequisites

- **Node.js** 20 or newer (recommended)  
- A **Supabase** project: [supabase.com](https://supabase.com)  
- **Optional:** [Supabase CLI](https://supabase.com/docs/guides/cli) for linking the project, pushing migrations, and deploying Edge Functions  

---

## Local development

```bash
git clone <your-repo-url>
cd "Medical Bible Project"
npm install
cp .env.example .env
```

Edit `.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from **Project Settings → API** in the Supabase dashboard.

Apply all database migrations (see [Database](#database-supabase)) before relying on the app.

```bash
npm run dev
```

The dev server is provided by Vite (default URL is printed in the terminal, usually `http://localhost:5173`).

---

## Environment variables

| Variable | Required | Where |
|----------|----------|--------|
| `VITE_SUPABASE_URL` | Yes | `.env` (browser) |
| `VITE_SUPABASE_ANON_KEY` | Yes | `.env` (browser) |

Secrets for AI (**never** put these in `.env` for Vite — they would ship to the browser):

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Claude API for `generate-summary` (primary) |
| `OPENAI_API_KEY` | Optional fallback if Anthropic is missing or rate-limited |
| `OPENAI_MODEL` | Optional; default `gpt-4o-mini` |
| `ANTHROPIC_MODEL_FAST` / `ANTHROPIC_MODEL_THOROUGH` | Optional overrides for Haiku / Sonnet-style models |

Set Edge Function secrets with the Supabase CLI, e.g. `supabase secrets set ANTHROPIC_API_KEY=...`.

---

## Database (Supabase)

Schema and Row Level Security (RLS) are defined in `supabase/migrations/`. Apply them **in chronological order** (by filename) using either:

- **SQL Editor:** paste and run each file’s contents in order, or  
- **CLI:** `supabase db push` (or your team’s equivalent workflow)

### Migration files (current set)

| File | Role |
|------|------|
| `20250325000000_initial.sql` | Core tables: profiles, doctor visits, pain entries, MCAS episodes, medications, reactions, doctors, questions, diagnoses, tests, RLS policies, auth hooks, etc. |
| `20250326000000_visit_docs_storage.sql` | Private Storage bucket and policies for visit-related documents |
| `20250403120000_doctor_visits_status.sql` | Adds `doctor_visits.status` (`complete` / `pending`) for the visit workflow |
| `20250404100000_appointments_visit_logged.sql` | `appointments` table and `visit_logged` flag for dashboard |
| `20250404230000_symptom_logs.sql` | `symptom_logs` table for quick symptom snapshots |
| `20250405000000_missing_columns.sql` | Idempotent fixes: `doctor_visits` status / `is_finalized`, `mcas_episodes.activity`, `doctors` and `tests_ordered` if missing |
| `20250406100000_medication_change_events.sql` | `medication_change_events` + triggers on `current_medications` (start / dose-frequency adjustment / stop) for handoff correlation |

Runs are safe if steps overlap (e.g. `status` uses `add column if not exists`).

If the dashboard or visits page errors on a **missing column**, re-check that the latest migrations have been applied on your Supabase project.

### Authentication

In the Supabase dashboard:

- Enable **Authentication → Providers → Email** as needed  
- Configure whether **email confirmation** is required before first login  

New users get a `profiles` row via the migration’s auth trigger pattern (see initial migration).

---

## Storage (visit documents)

Visit documents are stored in a **private** Supabase Storage bucket (configured in `20250326000000_visit_docs_storage.sql`, typically named `visit-docs`). Policies restrict access to the owning authenticated user.

After migrations and bucket creation, uploads are available from visit-related flows in the app.

---

## Dashboard health summary

The dashboard can build a **clinical handoff-style** summary for you (and **Download PDF**).

1. **App-generated narrative (default)**  
   Built entirely in the browser from your archives (pain, symptoms, meds, diagnoses, visits, tests, open questions). It is **concise and skimmable** by design — no API key required.

2. **Optional AI narrative**  
   The client calls `supabase.functions.invoke('generate-summary', …)` with compact patient context. The Edge Function lives at:

   `supabase/functions/generate-summary/index.ts`

   Deploy (example):

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-...
   # optional: supabase secrets set OPENAI_API_KEY=sk-...
   supabase functions deploy generate-summary
   ```

   If the function fails or is not configured, the UI still shows the app-generated summary and may display a short error hint for debugging.

**Patient focus field:** Optional free text (“most important for my next appointment”) is sent to the Edge Function when AI is used; it is also stored in `localStorage` for convenience.

---

## Deploying the frontend

Typical static hosting (e.g. **Cloudflare Pages**, Netlify, Vercel):

- **Build command:** `npm ci && npm run build` (or `npm install && npm run build`)  
- **Output directory:** `dist`  
- **Environment variables:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the host’s project settings  

The **anon** key is safe to expose to the browser; RLS enforces data access. Never expose the **service role** key or AI provider keys in frontend env vars.

---

## Security and compliance notes

- You are responsible for how you use and store health data (HIPAA, regional privacy laws, etc.). This README is not legal advice.  
- Use **HTTPS** in production, strong passwords, and keep Supabase RLS policies enabled and tested.  
- Restrict Storage bucket policies to authenticated users and object ownership as defined in migrations.  
- Prefer **Edge Functions** (or another server) for any third-party LLM API keys.  
- If the repo lives in cloud sync folders (e.g. OneDrive), occasional `node_modules` or lockfile quirks can occur; a clean `npm ci` in CI usually avoids drift.

---

## Project structure

```
src/
  App.tsx                 # Routes: /login, /app/* (protected)
  components/             # Shared UI (e.g. layout, visit wizard)
  contexts/               # Auth context
  pages/
    DashboardPage.tsx     # Home, summary, PDF, drawers
    QuickLogPage.tsx
    RecordsPage.tsx
    VisitsPage.tsx
    DoctorsPage.tsx
    DoctorProfilePage.tsx # /app/doctors/:id
    TestsOrderedPage.tsx
    MedicationsPage.tsx
    QuestionsArchivePage.tsx
    DiagnosesDirectoryPage.tsx
    AnalyticsPage.tsx
    LoginPage.tsx
  lib/
    supabase.ts           # Browser Supabase client
    summaryContext.ts     # Compact blob for optional AI
    summaryPdf.ts         # PDF download helper
    parse.ts              # Deterministic text parsing helpers (e.g. areas/triggers)
supabase/
  migrations/             # Ordered SQL migrations
  functions/
    generate-summary/     # Optional AI handoff (Claude + optional OpenAI)
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Typecheck (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Preview the production build locally |

---

## License / contributing

Add your preferred **LICENSE** and contribution guidelines if this repository is public or shared.

If you add features, keep migrations **forward-only** and document new env vars or Edge secrets in this file.
