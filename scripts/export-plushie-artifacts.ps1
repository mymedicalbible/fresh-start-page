# Builds dist/plushie-system-export-<date>.zip with migrations, docs, key sources, and lottie JSON.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $root "dist"
$zipName = "plushie-system-export-$stamp.zip"
$zipPath = Join-Path $outDir $zipName
$stage = Join-Path $env:TEMP "mb-plushie-export-$stamp"

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null

$migrationGlobs = @(
  "20260411120000_game_tokens_trial.sql",
  "20260411140000_panda_popcorn_lottie_path.sql",
  "20260412160000_turtle_plushie_fixed_price.sql",
  "20260413103000_plushie_rotation_monday_local_tz.sql",
  "20260414120000_plushie_display_names.sql",
  "20260415120000_remove_rustle_plant_catalog_name.sql",
  "20260416160000_plushie_turtle_slot_and_neutralize_rustle.sql",
  "20260416170000_plushie_turtle_name_oneal.sql",
  "20260418100000_plushie_next_week_rpc_and_copy.sql",
  "20260420150000_plushie_seven_slot_catalog_and_rpc.sql"
)

$migDest = Join-Path $stage "supabase/migrations"
New-Item -ItemType Directory -Path $migDest -Force | Out-Null
foreach ($g in $migrationGlobs) {
  $src = Join-Path $root "supabase/migrations/$g"
  if (Test-Path $src) { Copy-Item $src $migDest -Force }
  else { Write-Warning "Missing migration: $g" }
}

$docSrc = Join-Path $root "docs/plushie-system-export.md"
$docDest = Join-Path $stage "docs"
New-Item -ItemType Directory -Path $docDest -Force | Out-Null
if (Test-Path $docSrc) { Copy-Item $docSrc $docDest -Force }

$srcFiles = @(
  "src/lib/gameTokens.ts",
  "src/lib/dashPlushieDisplay.ts",
  "src/lib/useGameStateRefresh.ts",
  "src/pages/PlushieShopPage.tsx",
  "src/pages/MyPlushiesPage.tsx",
  "src/pages/DashboardPage.tsx",
  "src/pages/ProfilePage.tsx",
  "src/pages/MorePage.tsx",
  "src/App.tsx",
  "src/components/PlushieTokenVictoryModal.tsx",
  "src/components/more/PlushiesSparkles.tsx",
  "src/lib/fullDataExport.ts"
)
foreach ($rel in $srcFiles) {
  $s = Join-Path $root $rel
  if (-not (Test-Path $s)) { Write-Warning "Missing: $rel"; continue }
  $d = Join-Path $stage (Split-Path $rel -Parent)
  New-Item -ItemType Directory -Path $d -Force | Out-Null
  Copy-Item $s (Join-Path $stage $rel) -Force
}

$lottieDest = Join-Path $stage "public/lottie"
New-Item -ItemType Directory -Path $lottieDest -Force | Out-Null
Get-ChildItem (Join-Path $root "public/lottie") -File | ForEach-Object {
  Copy-Item $_.FullName $lottieDest -Force
}

Compress-Archive -Path $stage -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $stage
Write-Host "Wrote $zipPath"
