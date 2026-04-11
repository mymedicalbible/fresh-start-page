# Medical Bible (Medical Tracker)

**Medical Bible** is a personal health journal you use in the **browser** (phone, tablet, or desktop). It helps you capture **pain**, **symptom episodes**, **doctor visits**, **medications**, **tests and orders**, **diagnoses**, **questions for clinicians**, and **appointments**—then find them again by time or by doctor, spot patterns in **charts**, and build a **clinical handoff narrative** (optionally polished with AI) that you can **save as a PDF**.

The running name in code is `medical-tracker-web`; data lives in **Supabase** (your own project). This app **does not** diagnose, prescribe, or replace care from a licensed professional. **You** decide what to log and what to share.

---

## What you can do (features)

### Dashboard (home)

- **Upcoming appointments** — see what is on your calendar; open **open questions** for that doctor when the app has them stored.
- **Pending visits** — visits you logged as not yet finished (e.g. tests or follow-up still outstanding); jump back into the visit flow.
- **Log today** — shortcuts to **Pain**, **Episodes** (symptom episodes), **Questions**, and **Visit log** (starts the visit wizard).
- **Doctor handoff summary** — opens a panel that builds a **first-person narrative** from your saved data (recent pain/episodes, meds, changes, visits, questions). You can generate **short** or **thorough** wording, optionally run **AI** enhancement when the backend is configured, **copy** text, **download PDF**, and each generation can be **archived on this device** for later.
- **Visit transcription** — record audio for a visit, get live transcription, then **extract structured fields** (findings, instructions, tests, meds, follow-up, etc.) into the visit log when you confirm.
- **Browser notifications** (optional) — if you enable them, reminders tied to appointments can nudge you after visit times (behavior depends on the device and browser).
- **Your records** — links into doctors, medications, tests, diagnoses, visits, questions, charts, appointments, and profile.

### Quick log (`/app/log`)

Fast paths to log **pain** (intensity, location, time, notes, triggers, relief) and **symptom episodes** (features/severity, activity, etc.) without drilling through every screen. Add **questions for your doctor** from here. Drafts can be **saved for later** if you leave mid-entry.

### Records (`/app/records` or **flares** in the nav)

Searchable history with tabs:

- **Pain** — past pain entries.
- **Episodes** — past symptom episodes; you can remove individual **features** from an entry without deleting the whole episode.
- **Summaries** — **device-local archive** of generated handoff summaries (same idea as in the handoff panel; not a second cloud list).
- **Transcripts** — **device-local archive** of visit transcripts you chose to save from the transcription flow.

### Charts & trends (`/app/analytics`)

- **Pain over time** — average intensity by day.
- **Top pain areas** — from location text you entered.
- **Common episode features** — frequency of features across episodes.
- **Pain / episodes by time of day** — heatmaps when entries include times.

Charts are for **your awareness** and for **conversation with your care team**, not for self-diagnosis.

### Visits (`/app/visits`)

- **List** all visits or filter to **pending**; expand rows for details.
- **Visit wizard** — step-by-step visit log (reason, notes, diagnoses, meds, tests, documents when configured, etc.). Visits can be **complete** or **pending** to finish later.
- **Transcript** — optional recording + extraction flow integrated into logging.

### Doctors (`/app/doctors` and `/app/doctors/:id`)

- **Directory** of providers; open a **profile** with **visits**, **questions**, **diagnoses**, **medications**, and **tests** linked to that doctor.
- **Archive** a doctor (with optional reason) instead of losing history; restore later.

### Medications (`/app/meds`)

- **Current** vs **discontinued** lists; filter by prescriber when that data is present.
- **PRN** (as needed) vs scheduled-style frequency on add/edit.
- **Dose change** logging with **change events** and optional updates to the med record.
- Removing a current med moves it to **discontinued** with a reason.

### Tests & orders (`/app/tests`)

Track labs/imaging and similar with status; **pending** vs **archived** style workflows.

### Questions (`/app/questions`)

- List questions with **All / Open / Answered** views; priority; optional ties to appointment dates.
- Answer inline when supported.

### Diagnoses (`/app/diagnoses`)

- Central directory of conditions (confirmed/suspected, dates, linked doctor where applicable).

### Appointments (`/app/appointments`)

- Manage upcoming (and related) appointment records tied to your workflow.

### More (`/app/more`)

- Shortcuts to **Visits**, **Questions**, **Charts & trends**, **Diagnoses**.

### Doctor note (bottom nav)

- **Note for a doctor** — quick capture tied to the doctor-note flow (modal), separate from full visit logging.

### Profile (`/app/profile`)

- Account-oriented screen (per your setup).

### Sign-in (`/login`)

- Email/password auth via **Supabase**; the `/app/*` area is protected.

---

## Optional AI and transcription (hosted backend)

These need **Supabase Edge Functions** and **secrets** on the project (never put API keys in `VITE_*` client env vars):

| Function | What it does | Typical secret |
|----------|----------------|------------------|
| **`generate-summary`** | Builds or polishes the handoff narrative; **extract** mode structures visit transcripts into JSON for the visit log. | `ANTHROPIC_API_KEY` (Claude); optional OpenAI fallback |
| **`transcribe-visit`** | Returns a short-lived token for **AssemblyAI** live transcription. | `ASSEMBLYAI_API_KEY` |

If these are not deployed or keys are missing, handoff still works from **rule-based narrative**; AI polish and live transcription simply will not run until configured.

---

## Tech stack (short)

| Layer | Choice |
|-------|--------|
| UI | React 18, React Router 6, TypeScript |
| Build | Vite 6 |
| Backend | Supabase (Postgres, Auth, Row Level Security, Storage, Edge Functions) |
| Charts | Recharts |
| PDF | jsPDF |

---

## Local development

```bash
npm install
# Add .env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY — see DEVELOPERS.md
npm run dev
npm run build
```

Full setup, migrations, deploy, and troubleshooting: **[DEVELOPERS.md](./DEVELOPERS.md)**.

---

## Exporting all code and SQL to one file

```bash
npm run export:txt
```

Writes `exports/project-code-and-sql-YYYY-MM-DD-HH-MM-SS.txt` (app source, `supabase/migrations`, Edge Functions, configs; skips `node_modules`, `dist`, etc.). Git-based zip: `npm run export`.

---

## Route map

| Path | Area |
|------|------|
| `/app` | Dashboard |
| `/app/log` | Quick log |
| `/app/records`, `/app/flares` | Records |
| `/app/analytics` | Charts & trends |
| `/app/meds` | Medications |
| `/app/doctors`, `/app/doctors/:id` | Doctors / profile |
| `/app/tests` | Tests & orders |
| `/app/questions` | Questions |
| `/app/diagnoses` | Diagnoses |
| `/app/visits` | Visits |
| `/app/appointments` | Appointments |
| `/app/more` | More |
| `/app/profile` | Profile |
| `/login` | Sign in |

---

*Personal health organizer—not a substitute for professional medical advice.*
