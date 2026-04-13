#
# Full project archive. ALL output stays under the repo: exports/ only (never dist, never TEMP).
#
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$exportsRoot = Join-Path $root "exports"
$outDir = $exportsRoot
$zipName = "medical-bible-project-FULL-$stamp.zip"
$zipPath = Join-Path $outDir $zipName
$stage = Join-Path $exportsRoot "_staging_full_$stamp"

New-Item -ItemType Directory -Path $exportsRoot -Force | Out-Null
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Path $stage | Out-Null

$excludeDirs = @(
  "node_modules",
  ".git",
  "dist",
  ".temp"
)

function Copy-TreeFiltered {
  param([string]$SrcRoot, [string]$DstRoot)
  Get-ChildItem -LiteralPath $SrcRoot -Force | ForEach-Object {
    $name = $_.Name
    if ($excludeDirs -contains $name) { return }
    if ($name.StartsWith("_staging_")) { return }
    $dst = Join-Path $DstRoot $name
    if ($_.PSIsContainer) {
      New-Item -ItemType Directory -Path $dst -Force | Out-Null
      Copy-TreeFiltered -SrcRoot $_.FullName -DstRoot $dst
    } else {
      Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
    }
  }
}

Write-Host "Staging full project into exports\_staging_* (excludes: $($excludeDirs -join ', '))..."
Copy-TreeFiltered -SrcRoot $root -DstRoot $stage

$migrations = Get-ChildItem -Path (Join-Path $stage "supabase\migrations") -Filter "*.sql" -File -ErrorAction SilentlyContinue | Sort-Object Name
$manifestPath = Join-Path $stage "EXPORT_MANIFEST.txt"
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("Medical Bible Project - FULL export $stamp")
[void]$sb.AppendLine("Root: $root")
[void]$sb.AppendLine("")
$c = if ($migrations) { $migrations.Count } else { 0 }
[void]$sb.AppendLine("Supabase migrations ($c files):")
if ($migrations) {
  foreach ($f in $migrations) { [void]$sb.AppendLine($f.Name) }
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("Output: exports\$zipName (project folder only)")
[void]$sb.AppendLine("Excluded from zip: node_modules, .git, dist, supabase/.temp, exports\_staging_*")
[void]$sb.AppendLine("Restore: unzip, npm install, npm run build")
$sb.ToString() | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host "Creating zip: exports\$zipName"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$stage\*" -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $stage

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "DONE (project folder only): $zipPath  (${sizeMb} MB)"
Write-Host "Migrations bundled: $(if ($migrations) { $migrations.Count } else { 0 }) SQL files."
