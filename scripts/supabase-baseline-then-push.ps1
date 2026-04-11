# Use when `supabase db push` fails with "relation already exists" on the FIRST migration:
# your Supabase database was created or migrated manually, but the CLI migration history is empty.
#
# This marks every migration EXCEPT `20260411120000_game_tokens_trial` as already applied,
# then runs `db push` so only the plushie/token migration runs.
#
# Prerequisites: `supabase link --project-ref YOUR_REF` (or env configured).
# If your DB is missing objects from any earlier migration, do NOT use this — fix schema first.
#
# Run from repo root:  powershell -ExecutionPolicy Bypass -File scripts/supabase-baseline-then-push.ps1

$ErrorActionPreference = 'Stop'

$versions = @(
  '20250325000000',
  '20250326000000',
  '20250403120000',
  '20250404100000',
  '20250404230000',
  '20250405000000',
  '20250406100000',
  '20250406200000',
  '20250406400000',
  '20250407100000',
  '20250408100000',
  '20250409000000',
  '20250410100000',
  '20260406120000',
  '20260408120000'
)

Write-Host 'Marking prior migrations as applied (remote)...' -ForegroundColor Cyan
npx --yes supabase migration repair --status applied @versions --yes
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Pushing pending migrations (e.g. game tokens)...' -ForegroundColor Cyan
npx --yes supabase db push --yes
exit $LASTEXITCODE
