# System Integration Test Pass

This is an ordered manual pass based on the real repo wiring. Run it on one test account in order so each later chain can reuse the data created earlier.

## Before You Start

- Sign in with one dedicated test account.
- Use one desktop browser that supports notifications and microphone access.
- Keep track of:
  - one doctor name
  - one appointment date/time
  - one medication name
  - one diagnosis name
  - one test name
- Reuse the same doctor label across steps when possible.

## 1. Auth -> Protected App Routes -> Dashboard Shell

Create first:
- No data required.

Go next:
- Open `/login`.
- Sign in.
- Open `/app`.
- In a signed-out tab, try opening `/app/profile`.

What should update:
- Signed-in navigation should load the app shell.
- Signed-out access to `/app/*` should redirect to `/login`.

Pass:
- Login reaches the app shell.
- App navigation is visible after login.
- Signed-out `/app/*` routes redirect to login.

Fail:
- Signed-out users can reach `/app/*`.
- Login succeeds but `/app` is blank or loops.

Watch for:
- Session restore issues after refresh.
- Outlet content missing even when the shell appears.

## 2. Quick Log -> Dashboard -> Records / Charts / Analytics

Create first:
- Add one pain entry.
- Add one symptom log.
- Add one doctor question using your chosen doctor name.

Go next:
- Start at `/app/log`.
- Then visit `/app`.
- Then `/app/charts-trends`.
- Then `/app/analytics`.
- Then `/app/questions`.

What should update:
- Dashboard should reflect recent activity.
- Records/Charts should show pain/symptom data.
- Analytics should have chartable data.
- Questions should show the new question.

Pass:
- Quick Log saves complete without errors.
- The new question appears in Questions.
- Records and Analytics show the new data.

Fail:
- Quick Log saves but downstream views stay empty.
- Question save succeeds but no question appears later.

Watch for:
- Pain save works but linked symptom save does not.
- Analytics only reflects changes after a hard reload.

## 3. Doctors -> Appointments / Questions / Visits -> Doctor Profile Rollup

Create first:
- Create a doctor.
- Create one appointment for that doctor.
- Create one unanswered question for that doctor.
- Create one visit for that doctor on the appointment date.

Go next:
- Visit `/app/doctors`.
- Open the doctor profile.
- Check `/app/appointments`, `/app/questions`, and `/app/visits`.
- Return to the doctor profile.

What should update:
- Doctor profile should roll up related questions and visits.
- The same doctor identity should feel consistent across all four pages.

Pass:
- Doctor profile loads.
- The related question appears under that doctor’s context.
- The related visit appears under that doctor’s context.

Fail:
- Questions or visits exist but do not show up on the doctor profile.
- The app treats minor doctor-name variations as separate people.

Watch for:
- `Dr. Name` vs `Name`.
- Meds tied back to the doctor only through note text.

## 4. Meds / Diagnoses / Tests -> Dashboard Handoff Summary

Create first:
- Add one active medication.
- Add one diagnosis.
- Add one test.

Go next:
- Visit `/app/meds`, `/app/diagnoses`, and `/app/tests`.
- Then return to `/app`.
- Generate the handoff summary.

What should update:
- The summary should mention the medication, diagnosis, and test context.
- A summary archive entry should be created.

Pass:
- Summary generation completes.
- The summary reflects the newly entered med/diagnosis/test data.
- The summary archive is visible later from Records.

Fail:
- Summary generates but omits clearly recent med/diagnosis/test data.
- Summary generation errors after those records exist.

Watch for:
- Summary slices recent windows for some tables, so old data may not show.

## 5. Medication Change Events -> Pain/Symptom Correlation -> Summary Output

Create first:
- Add a medication with a start date.
- Change its dose or frequency.
- Add at least one pain or symptom log near that medication change date.

Go next:
- Use `/app/meds` to edit the medication.
- Use `/app/log` to add pain or symptom data.
- Generate the summary again from `/app`.

What should update:
- The summary should include medication-change or correlation content.
- Export should carry the same correlation block if present.

Pass:
- After the med change and nearby logs, summary output contains medication-change correlation content.
- Export contains the same block or equivalent notes.

Fail:
- Medication edits save, but correlation content never appears.

Watch for:
- Correlation needs both event history and nearby log data.

## 6. Transcript / Solo Record -> Edge Function Invocation -> Usable Extracted Output

Create first:
- Prepare a short spoken script mentioning a doctor, symptoms, meds, tests, and follow-up.
- Prepare a short solo spoken update mentioning meds, diagnoses, questions, and tests.

Go next:
- Use the visit transcript flow from the visit workflow.
- Use `/app/solo-record` for the solo record flow.

What should update:
- Visit transcript flow should produce extracted fields that prefill the visit workflow.
- Solo transcript flow should produce extracted items that can be applied into the database.
- Transcript archive should store the transcript for the signed-in user.

Pass:
- Recording starts and stops normally.
- A structured extraction review appears.
- Visit transcript data prefills usable visit fields.
- Solo apply creates or updates real rows such as questions, meds, diagnoses, or tests.

Fail:
- Recording UI works but structured extraction never becomes usable.
- Transcript exists but cannot feed the visit flow or database.

Watch for:
- Missing AssemblyAI secret or stale Edge Function deploy.
- Browser microphone permission denial.

## 7. Profile -> Push Subscription -> Push-Reminders Delivery Conditions

Create first:
- Use a browser where notification permission is available.

Go next:
- Open `/app/profile`.
- Enable push notifications.
- Turn on appointment reminders.
- Turn on daily nudge and pick a nearby time if practical.
- Use the test notification action.

What should update:
- This device/browser should become the active push subscription.
- Test push should reach the same device if environment secrets are configured.

Pass:
- Browser permission is granted.
- Push stays enabled after reload.
- Test push arrives on the same device/browser.

Fail:
- The toggle appears enabled but resets on reload.
- Test push claims success but no notification arrives.

Watch for:
- Missing VAPID key or service worker issues.
- Push is device-scoped, not account-global.

## 8. Appointments / Questions / Visits -> Pre-Appointment And Post-Appointment Push Logic

Create first:
- Create an appointment about an hour in the future for your test doctor.
- Leave matching questions missing for the pre-appointment case.
- Create another appointment that is about an hour in the past, or wait for one to pass.
- For the post-appointment case, leave the visit unlogged or pending, or leave unanswered questions.

Go next:
- Use `/app/appointments`, `/app/questions`, and `/app/visits`.
- Keep push enabled from step 7.

What should update:
- Pre-appointment reminder should nudge question entry when the gap exists.
- Post-appointment reminder should nudge visit follow-up when logging or questions are still pending.

Pass:
- Reminders arrive only when the matching gap still exists.
- If you add questions before the window, pre-appointment reminder should not arrive.
- If you finish visit follow-up, post-appointment reminder should not arrive.

Fail:
- Reminders arrive after the user already handled the work.
- Reminders never arrive even though test push works and the conditions are met.

Watch for:
- Scheduler may not be invoking `push-reminders`.
- Timezone offset on the subscription matters.

## 9. Summary Generation -> Archive / Export Behavior

Create first:
- Generate at least one dashboard summary.
- Have at least one transcript in the transcript archive if possible.

Go next:
- Generate a summary from `/app`.
- Open `/app/charts-trends` and review the summary archive area.
- Open `/app/profile` and run export in JSON and PDF if both are available.

What should update:
- New summaries should appear in the local archive for the signed-in user.
- Export should include Supabase data plus local summary/transcript archives.

Pass:
- Summary generation creates an archive entry.
- Export completes.
- Exported content reflects both server data and local archives.

Fail:
- Summary appears on screen but is not archived.
- Export omits local transcript or summary archive data.
- Archive items from another account appear in this account.

Watch for:
- Browser local storage limits.

## 10. Profile / Avatar / Export / Storage Policies

Create first:
- Prepare a small square image file for avatar upload.

Go next:
- Open `/app/profile`.
- Upload an avatar.
- Reload the page.
- Remove the avatar.
- Run export again.

What should update:
- Avatar should persist after reload.
- Removing the avatar should clear the profile image state.
- Export should still work.

Pass:
- Avatar upload completes and still displays after reload.
- Avatar removal clears it cleanly.
- Export still succeeds.

Fail:
- Avatar uploads but disappears on refresh.
- Removing the avatar leaves a broken image state.

Watch for:
- Private storage bucket policy mismatch.
- Signed URL loads once but the stored path is wrong.

## 11. Navigation After Data Exists -> Route Resilience / Not Found Behavior

Create first:
- Reuse the data created above.

Go next:
- Open `/app/charts-trends?tab=transcripts`.
- Open `/app/questions?doctor=<doctor-name>&tab=open`.
- Open `/app/visits?returnTo=%2Fapp%2Fprofile`.
- Open `/app/does-not-exist`.

What should update:
- Old transcript links should land on the real transcripts page.
- Question deep links should open a usable question view.
- Visit routes should only accept safe in-app return paths.
- Unknown routes should show not-found behavior.

Pass:
- Stale transcript links redirect to the transcripts page.
- Question and visit deep links load usable pages.
- Invalid routes show not-found.

Fail:
- Old links land on the wrong page.
- Invalid `returnTo` values break navigation or escape the app.

Watch for:
- Old saved bookmarks using removed query params.
- Pages crashing on older data shapes.
