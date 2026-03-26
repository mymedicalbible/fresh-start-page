# Medical Tracker (Supabase + Vite + React)

Multi-user health diary migrated from Google Apps Script: quick logs, charts, in-app notifications, and AI summaries via a Supabase Edge Function.

## Prerequisites

- Node.js 20+ (for `npm run dev`)
- A [Supabase](https://supabase.com) project
- Optional: [Supabase CLI](https://supabase.com/docs/guides/cli) to apply migrations and deploy Edge Functions
- Optional: OpenAI API key for full AI narratives

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

## 3. AI summary Edge Function

1. Install CLI and link the project (see Supabase docs), or use the dashboard **Edge Functions** workflow.
2. Deploy the function in `supabase/functions/ai-summary` as **`ai-summary`** (name must match `supabase.functions.invoke('ai-summary')`).
3. Set secrets (CLI example):

```bash
supabase secrets set OPENAI_API_KEY=sk-...
# optional
supabase secrets set OPENAI_MODEL=gpt-4o-mini
```

If `OPENAI_API_KEY` is not set, the function still returns a short **data snapshot** so the UI works end-to-end.

## 4. Realtime

The migration adds `user_notifications` to the `supabase_realtime` publication so the app can refresh the bell badge and (optionally) fire browser notifications while the tab is open.

## 5. Mobile and notifications

- Layout uses a scrollable bottom navigation bar and responsive forms.
- **Browser notifications** are optional (Settings). They fire when new rows are inserted into `user_notifications` and permission is `granted`. Background push (service worker + FCM/Web Push) is not included; you can add that later if needed.

## 6. Product / compliance notes

- This app stores **sensitive health data**. Use strong passwords, HTTPS in production, and Supabase RLS (included) as part of your security posture.
- AI output is **not medical advice**; the Edge Function prompts are written to encourage clinician discussion, not autonomous diagnosis.

## Project layout

- `src/pages/QuickLogPage.tsx` — visit, reaction, MCAS, pain, questions, meds, diagnosis forms
- `src/pages/AnalyticsPage.tsx` — Recharts pain and medication charts
- `src/pages/AiSummariesPage.tsx` — calls `ai-summary` Edge Function
- `supabase/migrations/` — tables, RLS, auth trigger, Realtime publication
