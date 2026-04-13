# Medical Bible (Medical Tracker)

**Medical Bible** is a personal health journal you use in the **browser** (phone, tablet, or desktop). It helps you capture **pain**, **symptom episodes**, **doctor visits**, **medications**, **tests and orders**, **diagnoses**, **questions for clinicians**, and **appointments**—then find them again by time or by doctor, spot patterns in **charts**, and build a **clinical handoff narrative** (optionally polished with AI) that you can **save as a PDF**.

The running name in code is `medical-tracker-web`; data lives in **Supabase** (your own project). This app **does not** diagnose, prescribe, or replace care from a licensed professional. **You** decide what to log and what to share.

---

## What you can do (features)

### Dashboard (home) — `/app`

- **Appointments** — Banner for upcoming, in-progress, or most recent visit; optional **browser notifications** when you enable them (behavior depends on the device and browser).
- **Plushie strip (when game tokens are enabled)** — If your project has the token economy enabled (`VITE_GAME_TOKENS_ENABLED` is not `false`), the appointment banner can show **this week’s rotation plush** as a **Lottie** beside the strip (no caption under it). The weekly art matches the shop hero for the current rotation whether or not you’ve purchased that plush yet; **profile** plushies and token line are separate. Optional **browser-stored** settings (when exposed in your build) can hide the strip or show a specific unlocked plush instead of the weekly default.
- **Pending visits** — Visits you logged as not yet finished; jump back into the visit flow from sticky notes below the banner.
- **Log today** — Shortcuts to **Pain**, **Episodes** (symptom episodes), **Questions**, and **Visit log** (starts the visit wizard).
- **Doctor handoff summary** — Opens a panel that builds a **first-person narrative** from your saved data. You can generate **short** or **thorough** wording, optionally run **AI** enhancement when the backend is configured, **copy** text, **download PDF**, and archive generations **on this device**.
- **Your records** — Sticker shortcuts: **Doctors**, **Medications**, **Tests & orders**. Use **Archives** in the bottom nav for **Visits**, **Questions**, **Transcripts**, and **Diagnoses**; use **More** for **Account** and **Plushies**.
- **Profile** — Open **Account** from **More** or follow links from the dashboard when shown.

### Quick log — `/app/log`

Fast paths to log **pain** and **symptom episodes**; add **questions for your doctor**. Drafts can be **saved for later** if you leave mid-entry.

### Records — `/app/charts-trends`, `/app/records` (`/app/flares` redirects here)

Searchable history with tabs: **Pain**, **Episodes**, **Summaries** (device-local handoff archive), **Analytics** (embedded charts).

### Analytics — `/app/analytics`

**Pain over time**, **top pain areas**, **episode features**, **time-of-day** views. For awareness and conversations with your care team—not self-diagnosis.

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

### Plushies — `/app/plushies`

Optional **game token** economy when enabled in Supabase and on the client:

- **This week’s plush** hero, **mystery “next week”** gift art, **countdown** to the weekly rotation boundary (Monday midnight in your local timezone, aligned with server RPCs when migrations are applied).
- **My Plushies** opens from the shop as a **modal** with polaroids for unlocked plushies.
- Earn tokens through logging and other actions defined in your backend; spend to unlock the active weekly plush when your balance allows.

### Archives — `/app/archives`

Redirects to the dashboard; use bottom-nav **Archives** destinations or go directly to `/app/visits`, `/app/questions`, `/app/transcripts`, `/app/diagnoses`.

### More — `/app/more`

Hub with polaroid-style links to **Account** and **Plushies** (shop).

### Solo recording — `/app/solo-record`

Standalone solo recording flow (when used in your build).

### Transcripts — `/app/transcripts`

Device-local archive of visit transcripts where applicable.

### Profile — `/app/profile`

Account, settings, token/plushie progress when the game is enabled, exports depending on build.

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
| Icons / motion | Lucide React, `tw-animate-css`, Lottie (plushies) |
| Build | Vite 6 |
| Backend | Supabase (Postgres, Auth, RLS, Storage, Edge Functions) |
| Charts | Recharts |
| PDF | jsPDF, html2canvas |

---

## Local development

```bash
npm install
# Create .env with at least VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY — see DEVELOPERS.md
npm run dev
npm run build
```

Database migrations, env reference, deploy, and troubleshooting: **[DEVELOPERS.md](./DEVELOPERS.md)**.

---

## Database and SQL

- **Migrations (source of truth):** `supabase/migrations/*.sql` — apply with Supabase CLI (`supabase db push` or your hosted workflow). Ordering is by timestamp prefix on each file.
- **Ad-hoc / helper scripts (not auto-run):** e.g. `supabase/reset_game_tokens_for_testing.sql`, `supabase/verify_plushie_tokens.sql` — use only when you intend to, on a matching database.

The **single-file export** below includes all tracked `.sql` files the script walks (migrations + loose scripts under `supabase/`).

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
| `/app/plushies` | Plushie shop |
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
| `npm run supabase:push` | Push migrations (Supabase CLI) |
| `npm run test:e2e` | Playwright tests |

---

*Personal health organizer—not a substitute for professional medical advice.*
