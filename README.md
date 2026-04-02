# Medical Bible Project (Supabase + Vite + React)

Multi-user health diary migrated from Google Apps Script: quick logs, records, analytics, and doctor visit document uploads via Supabase.

## Prerequisites

- Node.js 20+ (for `npm run dev`)
- A [Supabase](https://supabase.com) project
- Optional: [Supabase CLI](https://supabase.com/docs/guides/cli) to apply migrations and deploy Edge Functions

## 1. Database and security

1. In the Supabase dashboard, open **SQL Editor** and run the contents of `supabase/migrations/20250325000000_initial.sql`.
2. Confirm **Authentication → Providers → Email** is enabled. Adjust “Confirm email” to match whether you want email confirmation before first sign-in.
3. Under **Project Settings → API**, copy `Project URL` and `anon public` key.

## 2. Frontend environment

```bash
cp .env.example .env
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then:

```bash
npm install
npm run dev
```

## 3. Doctor document uploads (PDF/images)

Uploads are stored in a private Supabase Storage bucket named `visit-docs`.

Run the SQL in:
- `supabase/migrations/20250326000000_visit_docs_storage.sql`

Then go to **Records → Doctor visits** and upload files for a specific visit.

## 4. Charts and “accuracy without AI”

- Pain “areas” and MCAS “triggers” are parsed deterministically from your free text using simple matching rules.
- Charts are not sent to any AI model in this version (no AI calls).

## 5. Product / compliance notes

- This app stores **sensitive health data**. Use strong passwords, HTTPS in production, and Supabase RLS (included) as part of your security posture.
- AI is not used in this version.

## Project layout

- `src/App.tsx` — routes (login + protected app)
- `src/pages/LoginPage.tsx` — sign-in UI
- `src/pages/DashboardPage.tsx` — overview dashboard
- `src/pages/QuickLogPage.tsx` — fast entry for key daily/visit data
- `src/pages/RecordsPage.tsx` — browsable history lists + document uploads entry points
- `src/pages/VisitsPage.tsx` — doctor visits (and associated documents)
- `src/pages/DoctorsPage.tsx` — doctor directory
- `src/pages/TestsOrderedPage.tsx` — tests ordered tracking
- `src/pages/MedicationsPage.tsx` — medications tracking
- `src/pages/QuestionsArchivePage.tsx` — questions archive
- `src/pages/DiagnosesDirectoryPage.tsx` — diagnoses directory
- `src/pages/AnalyticsPage.tsx` — pain/MCAS/side-effect charts (no AI)
- `src/lib/supabase.ts` — Supabase client bootstrap
- `supabase/migrations/` — tables, RLS, auth trigger, Realtime publication + storage policies
