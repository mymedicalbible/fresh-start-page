# Medical Tracker (Supabase + Vite + React)

Multi-user health diary migrated from Google Apps Script: quick logs, records lists, charts, and doctor document uploads via Supabase.

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

- `src/pages/QuickLogPage.tsx` — visit, reaction, MCAS, pain, questions, meds, diagnosis forms
- `src/pages/RecordsPage.tsx` — browsable history lists + document uploads
- `src/pages/AnalyticsPage.tsx` — pain/MCAS/side-effect charts (no AI)
- `supabase/migrations/` — tables, RLS, auth trigger, Realtime publication
