# Medical Bible (Medical Tracker)

**Medical Bible** is a personal health journal you use in the **browser** (phone, tablet, or desktop). It helps you capture **pain**, **symptoms**, **doctor visits**, **medications**, **tests and orders**, **diagnoses**, **questions for clinicians**, and **appointments**—then find them again by time or by doctor, spot patterns in **charts**, and build a **clinical handoff narrative** (optionally polished with AI) that you can **save as a PDF**.

The running name in code is `medical-tracker-web`; data lives in **Supabase** (your own project). This app **does not** diagnose, prescribe, or replace care from a licensed professional. **You** decide what to log and what to share.

---

## What you can do (features)

### Dashboard (home) — `/app`

- **Appointments** — Banner for upcoming, in-progress, or most recent visit; optional **browser notifications** when you enable them (behavior depends on the device and browser).
- **Pending visits** — Visits you logged as not yet finished; jump back into the visit flow from sticky notes below the banner.
- **Log today** — Shortcuts to **Pain**, **Symptoms** (symptom logs), **Questions**, and **Visit log** (starts the visit wizard).
- **Doctor handoff summary** — Opens a panel that builds a **first-person narrative** from your saved data. You can generate **short** or **thorough** wording, optionally run **AI** enhancement when the backend is configured, **copy** text, **download PDF**, and archive generations **on this device**.
- **Your records** — Sticker shortcuts: **Doctors**, **Medications**, **Tests & orders**. Use **Archives** in the bottom nav for **Visits**, **Questions**, **Transcripts**, and **Diagnoses**; use **More** for **Account**.
- **Profile** — Open **Account** from **More** or follow links from the dashboard when shown.

### Quick log — `/app/log`

Fast paths to log **pain** and **symptoms**; add **questions for your doctor**. Drafts can be **saved for later** if you leave mid-entry.

### Records — `/app/charts-trends`, `/app/records` (`/app/flares` redirects here)

Searchable history with tabs: **Pain**, **Symptoms**, **Summaries** (device-local handoff archive), **Analytics** (embedded charts).

### Analytics — `/app/analytics`

**Pain over time**, **top pain areas**, **symptom features**, **time-of-day** views. For awareness and conversations with your care team—not self-diagnosis.

### Visits — `/app/visits`

List and filters; **visit wizard**; optional **transcription** and structured extract when Edge Functions and keys are configured.

### Doctors — `/app/doctors`, `/app/doctors/:id`

Directory and **doctor profile** with linked visits, questions, diagnoses, medications, and tests. **Archive** / restore providers.

### Medications — `/app/meds`

Current vs discontinued; **PRN** vs scheduled; **dose change** events.

### Tests & orders — `/app/tests`

Track labs/imaging with status workflows.

### Questions — `/app/questions`

All / Open / Answered; priority; optional appointment ties.

### Diagnoses — `/app/diagnoses`

Directory of conditions with linkage to doctors where applicable.

### Appointments — `/app/appointments`

Manage upcoming and related appointment records.

### Archives — `/app/archives`

Redirects to the dashboard; use bottom-nav **Archives** destinations or go directly to `/app/visits`, `/app/questions`, `/app/transcripts`, `/app/diagnoses`.

### More — `/app/more`

Hub with links to **Account**.

### Solo recording — `/app/solo-record`

Standalone solo recording flow (when used in your build).

### Transcripts — `/app/transcripts`

Device-local archive of visit transcripts where applicable.

### Profile — `/app/profile`

Account, settings, and exports depending on build.

### Sign-in — `/login`

Email/password via **Supabase**; `/app/*` routes are protected.

---

## Optional AI and transcription (hosted backend)

These need **Supabase Edge Functions** and **secrets** on the project (never put API keys in `VITE_*` client env vars):

| Function | Purpose | Typical secret |
|----------|---------|------------------|
| **`generate-summary`** | Handoff narrative polish / extract mode for visit transcripts | `ANTHROPIC_API_KEY` (Claude); optional OpenAI fallback |
| **`transcribe-visit`** | Short-lived token for **AssemblyAI** live transcription | `ASSEMBLYAI_API_KEY` |

If not deployed or keys are missing, handoff still uses **rule-based** narrative; AI polish and live transcription stay off until configured.

---

## Tech stack

| Layer | Choice |
|-------|--------|
| UI | React 18, React Router 6, TypeScript |
| Styling | Tailwind CSS v4, global CSS design tokens |
| Icons / motion | Lucide React, `tw-animate-css`, Lottie |
| Build | Vite 6 |
| Backend | Supabase (Postgres, Auth, RLS, Storage, Edge Functions) |
| Charts | Recharts |
| PDF | jsPDF, html2canvas |

---

## Local development

```bash
npm install
# Create .env with:
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
# SUPABASE_DB_PASSWORD=...   # required for npm run supabase:push
npm run dev
npm run build
```

Database migrations, env reference, deploy, and troubleshooting: **[DEVELOPERS.md](./DEVELOPERS.md)**.

---

## Database and SQL

- **Migrations (source of truth):** `supabase/migrations/*.sql` — apply with Supabase CLI (`supabase db push` or your hosted workflow). Ordering is by timestamp prefix on each file.
- **CLI migration command:** `npm run supabase:push` (wraps `supabase db push` and reads `SUPABASE_DB_PASSWORD` from `.env` / `.env.local`).
- **Ad-hoc / helper scripts (not auto-run):** SQL files under `supabase/` outside migrations are manual utilities; run only when you intentionally need them on a matching database.

The **single-file export** below includes all tracked `.sql` files the script walks (migrations + loose scripts under `supabase/`).

### Time format policy

- User-facing times are shown in **12-hour format** (`h:mm AM/PM`) across dashboard, records, appointments, and visit flows.
- Stored DB/input values can remain `HH:mm` or `HH:mm:ss`; display formatting is handled in app code.

---

## Exporting the project (code + SQL)

Two complementary outputs:

### 1. One text file — all source + SQL + configs

```bash
npm run export:txt
```

Writes a timestamped file under **`exports/`**, for example:

`exports/project-code-and-sql-YYYY-MM-DD-HH-MM-SS.txt`

Includes TypeScript/TSX/CSS, **`supabase/**/*.sql`**, JSON configs, scripts, markdown, etc. Skips `node_modules`, `dist`, `ExportedProject`, `coverage`, `.vite`, and the `exports/` folder itself (so old dumps are not nested into new ones). See `scripts/export-project-one-file.mjs` for the exact extension list.

### 2. Zip of everything Git tracks

```bash
npm run export
```

Creates **`medical-bible-code-export-YYYY-MM-DD-HH-MM-SS.zip`** in the project root via `git archive` (only **committed** files). Untracked files are not included—commit first if you need them in the zip.

---

## Route map

| Path | Area |
|------|------|
| `/login` | Sign in |
| `/app` | Dashboard (home) |
| `/app/log` | Quick log |
| `/app/charts-trends`, `/app/records` | Records hub |
| `/app/flares` | Redirect → charts-trends |
| `/app/analytics` | Analytics |
| `/app/meds` | Medications |
| `/app/doctors`, `/app/doctors/:id` | Doctors / doctor profile |
| `/app/tests` | Tests & orders |
| `/app/questions` | Questions |
| `/app/diagnoses` | Diagnoses |
| `/app/more` | More hub |
| `/app/transcripts` | Transcripts |
| `/app/solo-record` | Solo recording |
| `/app/appointments` | Appointments |
| `/app/visits` | Visits |
| `/app/profile` | Profile / account |
| `/`, `*` | Redirects (see `App.tsx`) |

---

## Scripts (npm)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview production build |
| `npm run export:txt` | Single `.txt` with code + SQL + configs → `exports/` |
| `npm run export` | Zip of git-tracked files |
| `npm run assets:more-grass` | Utility asset script for transparent grass variant |
| `npm run supabase:push` | Push migrations (Supabase CLI; uses `SUPABASE_DB_PASSWORD` from `.env`) |
| `npm run test:e2e` | Playwright tests |
| `npm run test:e2e:only` | Playwright tests only (no smoke-user setup script) |

---

*Personal health organizer—not a substitute for professional medical advice.*
