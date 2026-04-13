#
# Plushie migrations + key TS + docs + public/lottie. Output ONLY under exports/ (never dist, never TEMP).
#
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$exportsRoot = Join-Path $root "exports"
$zipName = "plushie-system-export-$stamp.zip"
$zipPath = Join-Path $exportsRoot $zipName
$stage = Join-Path $exportsRoot "_staging_plushie_$stamp"

New-Item -ItemType Directory -Path $exportsRoot -Force | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null

$migrationGlobs = @(
  "20260411120000_game_tokens_trial.sql",
  "20260411140000_panda_popcorn_lottie_path.sql",
  "20260412160000_turtle_plushie_fixed_price.sql",
  "20260413103000_plushie_rotation_monday_local_tz.sql",
  "20260414120100_plushie_display_names.sql",
  "20260415120000_remove_rustle_plant_catalog_name.sql",
  "20260416160000_plushie_turtle_slot_and_neutralize_rustle.sql",
  "20260416170000_plushie_turtle_name_oneal.sql",
  "20260418100000_plushie_next_week_rpc_and_copy.sql",
  "20260420150000_plushie_seven_slot_catalog_and_rpc.sql",
  "20260421140000_turtle_spotlight_strip_mystery_copy.sql"
)

$migDest = Join-Path $stage "supabase/migrations"
New-Item -ItemType Directory -Path $migDest -Force | Out-Null
foreach ($g in $migrationGlobs) {
  $src = Join-Path $root "supabase/migrations/$g"
  if (Test-Path $src) { Copy-Item $src $migDest -Force }
  else { Write-Warning "Missing migration: $g" }
}

$docFiles = @(
  "docs/plushie-system-export.md",
  "docs/full-project-export.md"
)
foreach ($df in $docFiles) {
  $docSrc = Join-Path $root $df
  if (Test-Path $docSrc) {
    $docDestDir = Join-Path $stage (Split-Path $df -Parent)
    New-Item -ItemType Directory -Path $docDestDir -Force | Out-Null
    Copy-Item $docSrc (Join-Path $stage $df) -Force
  }
}

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
Get-ChildItem (Join-Path $root "public/lottie") -File -ErrorAction SilentlyContinue | ForEach-Object {
  Copy-Item $_.FullName $lottieDest -Force
}

Write-Host "Creating zip: exports\$zipName"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$stage\*" -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $stage
Write-Host "DONE (project folder only): $zipPath"
