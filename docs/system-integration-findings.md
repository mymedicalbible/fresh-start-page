# System Integration Findings

This report is based on repo inspection and safe validation commands. The prompt listed 11 chains, so this report covers all 11.

## Validation Basis

- Repo inspection across routes, pages, helpers, storage helpers, and Supabase Edge Functions
- Safe terminal validation including search, route/function inspection, and a production build
- Existing smoke result in this workspace was also available: `npx playwright test` passed after the earlier stale test assertion fix

## 1. Auth -> Protected `/app/*` Routes -> Dashboard Shell

Files inspected:
- `src/App.tsx`
- `src/contexts/AuthContext.tsx`
- `src/components/AppLayout.tsx`

Creates data:
- Supabase auth session and current user state

Should update:
- Protected `/app/*` routes
- Shared app shell and nested outlet pages

Working:
- Signed-out users are redirected to `/login`
- Signed-in users can open `/app/*` inside the app shell

Broken:
- Unauthenticated access reaches `/app/*`
- Authenticated users hit redirect loops or blank outlet content

Assessment:
- Likely working

Concrete findings:
- `Protected` in `src/App.tsx` gates `/app`.
- `AuthContext` restores the session and listens for auth-state changes.
- `AppLayout` provides the common shell around app pages.

Still needs manual testing:
- Real session expiry and token refresh behavior

## 2. Quick Log -> Dashboard -> Records / Charts / Analytics

Files inspected:
- `src/pages/QuickLogPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/RecordsPage.tsx`
- `src/pages/AnalyticsPage.tsx`

Creates data:
- `pain_entries`
- `mcas_symptom_logs`
- `doctor_questions`

Should update:
- Dashboard activity state
- Records/Charts
- Analytics
- Questions page

Working:
- Quick Log saves produce visible downstream data

Broken:
- Quick Log saves succeed but downstream pages stay empty or inconsistent

Assessment:
- Likely working

Concrete findings:
- `QuickLogPage` writes pain, symptom, and question rows directly.
- Pain and symptom saves set `sessionStorage['mb-analytics-refresh']`.
- Post-save routes explicitly send the user to charts or questions views.

Still needs manual testing:
- Immediate downstream refresh behavior without a full reload

## 3. Doctors -> Appointments / Questions / Visits -> Doctor Profile Rollup

Files inspected:
- `src/pages/DoctorsPage.tsx`
- `src/pages/AppointmentsPage.tsx`
- `src/pages/QuestionsArchivePage.tsx`
- `src/pages/VisitsPage.tsx`
- `src/components/VisitLogWizard.tsx`
- `src/pages/DoctorProfilePage.tsx`
- `src/lib/ensureDoctorProfile.ts`

Creates data:
- Doctors page creates doctor rows
- Appointments page creates appointments
- Questions flows create `doctor_questions`
- Visit flows create `doctor_visits`

Should update:
- Doctor profile rollups for questions, visits, diagnoses, meds, and tests

Working:
- Related provider activity appears on the doctor profile across features

Broken:
- Related data exists but doctor profile misses it because the doctor label does not match

Assessment:
- Risky / unproven

Concrete findings:
- `ensureDoctorProfile` silently creates or backfills doctor rows from several entry points.
- `DoctorProfilePage` relies heavily on doctor-name matching and text matching.
- Medication rollup is especially brittle because it looks for provider text in medication notes.

Still needs manual testing:
- Same-doctor activity created from multiple pages with realistic name variations

## 4. Meds / Diagnoses / Tests -> Dashboard Handoff Summary

Files inspected:
- `src/pages/MedicationsPage.tsx`
- `src/pages/DiagnosesDirectoryPage.tsx`
- `src/pages/TestsOrderedPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/lib/handoffNarrative.ts`

Creates data:
- Medication, diagnosis, and test pages write to their own tables

Should update:
- Dashboard handoff summary
- Later archive/export behavior

Working:
- Summary includes recent meds, diagnoses, tests, visits, and unresolved questions

Broken:
- The summary omits obviously recent structured data

Assessment:
- Likely working

Concrete findings:
- `DashboardPage.generateSummary` explicitly reads meds, diagnoses, tests, visits, unanswered questions, and archived meds.
- `buildHandoffNarrative` assembles those into the handoff text.
- Summary generation also archives the result locally for the current user.

Still needs manual testing:
- Human review that the generated narrative is actually useful, not just populated

## 5. Medication Change Events -> Pain/Symptom Correlation -> Summary Output

Files inspected:
- `src/pages/MedicationsPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/lib/medSymptomCorrelation.ts`
- `src/lib/fullDataExport.ts`

Creates data:
- Medication edit flows generate change events through RPC `insert_medication_change_event` with fallback handling

Should update:
- Summary correlation block
- Export correlation content

Working:
- Medication changes near pain/symptom logs appear in summary/export correlation output

Broken:
- Medication edits never produce correlation output despite nearby logs

Assessment:
- Risky / unproven

Concrete findings:
- Dashboard tries RPC `get_medication_change_events`, then falls back to direct table reads.
- Synthetic start events are generated for active meds missing explicit event history.
- Correlation output only appears if change events and nearby log data both exist.

Still needs manual testing:
- End-to-end check that real medication edits create usable change-event history in the target environment

## 6. Transcript / Solo Record -> Edge Function Invocation -> Usable Extracted Output

Files inspected:
- `src/components/VisitTranscriber.tsx`
- `src/components/SoloTranscriber.tsx`
- `src/components/VisitLogWizard.tsx`
- `src/lib/transcriptExtract.ts`
- `src/lib/soloTranscriptExtract.ts`
- `src/lib/applySoloTranscriptExtract.ts`
- `supabase/functions/transcribe-visit/index.ts`

Creates data:
- Visit and solo transcript UI invoke `transcribe-visit` and then run extraction helpers

Should update:
- Visit wizard prefill
- Solo transcript multi-table apply
- Local transcript archive

Working:
- Transcript flows return usable structured fields that drive the next step

Broken:
- Audio capture works but extraction cannot be used
- Solo transcript apply does not create the expected records

Assessment:
- Risky / unproven

Concrete findings:
- `transcribe-visit` requests an AssemblyAI realtime token and returns a build marker.
- Visit transcript output is staged into session storage for the visit wizard.
- Solo transcript apply can insert questions, update meds, update diagnoses, and insert tests.

Still needs manual testing:
- Real microphone/browser behavior, AssemblyAI secret validity, and extraction quality

## 7. Profile -> Push Subscription -> Push-Reminders Delivery Conditions

Files inspected:
- `src/pages/ProfilePage.tsx`
- `src/lib/pushNotifications.ts`
- `public/sw.js`
- `supabase/functions/push-reminders/index.ts`
- `supabase/migrations/20260414190000_push_subscriptions_and_reminder_log.sql`

Creates data:
- Profile page creates/updates `push_subscriptions` for the current browser/device

Should update:
- Test push behavior
- Reminder scheduler eligibility

Working:
- Enabling push creates a valid device subscription and allows reminders to target it

Broken:
- UI says push is enabled but no usable subscription or delivery path exists

Assessment:
- Risky / unproven

Concrete findings:
- Frontend registration depends on `VITE_WEB_PUSH_PUBLIC_KEY`, browser permission, and service worker support.
- The Edge Function requires VAPID secrets and `PUSH_REMINDER_CRON_TOKEN`.
- Manual test push uses the same Edge Function path and cleans up dead subscriptions on 404/410.

Still needs manual testing:
- Actual push delivery in the intended deployment environment

## 8. Appointments / Questions / Visits -> Pre-Appointment And Post-Appointment Push Logic

Files inspected:
- `supabase/functions/push-reminders/index.ts`
- `src/pages/QuestionsArchivePage.tsx`
- `src/components/VisitLogWizard.tsx`
- `src/pages/DoctorProfilePage.tsx`
- `src/lib/markAppointmentsVisitLogged.ts`

Creates data:
- Appointment, question, and visit flows create the rows the scheduler checks

Should update:
- Pre-appointment "add questions" reminder
- Post-appointment "finish visit follow-up" reminder

Working:
- Reminders fire only when the corresponding work is still missing

Broken:
- Reminders fire after the work is already done
- Reminders never fire despite a valid subscription and matching time window

Assessment:
- Risky / unproven

Concrete findings:
- Reminder windows are approximately one hour before and one hour after appointment time with a 5-minute send window.
- Doctor matching now uses normalized `sameDoctorLabel`.
- Post-appointment logic considers both `appointments.visit_logged` and pending visit rows.

Still needs manual testing:
- Live-time verification with real scheduled runs

## 9. Summary Generation -> Archive / Export Behavior

Files inspected:
- `src/pages/DashboardPage.tsx`
- `src/lib/summaryArchive.ts`
- `src/lib/transcriptArchive.ts`
- `src/pages/RecordsPage.tsx`
- `src/pages/TranscriptsPage.tsx`
- `src/lib/fullDataExport.ts`
- `src/pages/ProfilePage.tsx`

Creates data:
- Summary generation creates local archive entries
- Transcript flows create local transcript archive entries
- Export reads both server data and local archives

Should update:
- Records summary archive
- Transcripts page
- Export payloads

Working:
- Summary/transcript artifacts are scoped to the current user and included in export output

Broken:
- Local archive data leaks across accounts on the same browser
- Export omits the local archives

Assessment:
- Likely working

Concrete findings:
- Summary and transcript archives use user-scoped localStorage keys.
- `fullDataExport.ts` reads those scoped archives and merges them into the export payload.
- Records and Transcripts pages consume the scoped archives.

Still needs manual testing:
- Multi-account browser verification and export content review

## 10. Profile / Avatar / Export / Storage Policies

Files inspected:
- `src/pages/ProfilePage.tsx`
- `src/lib/fullDataExport.ts`
- `src/lib/avatarImage.ts`
- `supabase/migrations/20260414153000_profile_avatar_uploads.sql`
- `supabase/migrations/20250326000000_visit_docs_storage.sql`
- `src/lib/visitDocsStorage.ts`

Creates data:
- Avatar uploads write to `profile-icons`
- Visit/test documents write to `visit-docs`
- Export reads user data and local archives

Should update:
- Avatar display after reload
- Signed URL access to private objects
- Export completeness

Working:
- Users can upload, view, and remove only their own stored objects

Broken:
- Storage path/policy mismatch causes upload success but later read failure
- Private objects are exposed outside the intended per-user path

Assessment:
- Risky / unproven

Concrete findings:
- Avatar migration creates a private `profile-icons` bucket with per-user path policies.
- Visit-doc migrations create a private `visit-docs` bucket with per-user path policies.
- Frontend uses signed URLs for private object access, which matches the storage model.

Still needs manual testing:
- Upload, reload, signed URL access, and delete behavior against the active Supabase project

## 11. Navigation After Data Exists -> Route Resilience / Not Found Behavior

Files inspected:
- `src/App.tsx`
- `src/pages/RecordsPage.tsx`
- `src/pages/QuestionsArchivePage.tsx`
- `src/pages/VisitsPage.tsx`
- `src/lib/safeReturnPath.ts`
- `src/pages/DoctorProfilePage.tsx`

Creates data:
- Existing records and old bookmarks stress these routes after the app has been used

Should update:
- Old and deep-linked routes should land on safe, usable pages

Working:
- Stale transcript links redirect correctly
- Unknown routes show not-found
- Return paths stay inside `/app`

Broken:
- Old links land on the wrong page
- `returnTo` breaks navigation or escapes the app

Assessment:
- Likely working

Concrete findings:
- `/app/charts-trends?tab=transcripts` now redirects to the real transcripts page.
- `safeReturnPath` only permits same-site `/app` paths.
- Both nested and top-level wildcard routes point to `NotFoundPage`.

Still needs manual testing:
- Browser back/forward behavior after deep-link flows

## Top 6 Highest-Risk Integration Points

1. Push delivery depends on browser permission, service worker state, VAPID secrets, and an external scheduler invoking `push-reminders`.
2. Transcript flows depend on AssemblyAI secrets, live microphone/browser behavior, and extraction quality that code inspection cannot prove.
3. Doctor profile rollups depend on doctor-name normalization and text matching rather than strict relations for every downstream section.
4. Medication-change correlation depends on both event creation and later RPC/table reads, so environment drift can silently suppress correlation output.
5. Private storage behavior for avatar and visit/test documents depends on the active Supabase bucket configuration matching the migrations.
6. Summary/export spans both Supabase data and browser-local archives, so cross-device and multi-account browser behavior still requires manual testing.

## Likely Working

- Auth gating and app shell routing
- Quick Log save paths into downstream record pages
- Dashboard summary assembly from meds/diagnoses/tests/visits/questions
- Summary/transcript archive scoping and export inclusion
- Route resilience for stale transcript links, safe return paths, and not-found handling

## Risky / Still Needs Manual Testing

- Doctor profile rollup completeness across mixed doctor-name formats
- Medication-change correlation after real med edits
- Transcript extraction quality and multi-table apply behavior
- Push subscription persistence and real notification delivery
- Pre/post-appointment reminder timing in a live environment
- Avatar and document storage behavior against the active Supabase project

## Likely Broken

- No additional chain was provably broken from repo inspection after the recent fixes

## Limits Of This Verification

- Code inspection cannot prove external services are configured correctly
- Build success proves compile-time integrity, not live service readiness
