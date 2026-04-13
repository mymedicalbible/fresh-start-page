<#
.SYNOPSIS
  Archives the WHOLE project: every source file, ALL supabase/migrations/*.sql,
  public assets, configs, scripts, docs, .github, .cursor, everything important.

  EXCLUDES only (regeneratable / bulky junk):
    - node_modules (run npm install after unzip)
    - .git       (use `git clone` for history)
    - dist       (run npm run build)
    - supabase\.temp (CLI cache)

  Output: dist\medical-bible-project-FULL-<timestamp>.zip
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path $root "dist"
$zipName = "medical-bible-project-FULL-$stamp.zip"
$zipPath = Join-Path $outDir $zipName
$stage = Join-Path $env:TEMP "mb-full-export-$stamp"

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
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
    $dst = Join-Path $DstRoot $name
    if ($_.PSIsContainer) {
      New-Item -ItemType Directory -Path $dst -Force | Out-Null
      Copy-TreeFiltered -SrcRoot $_.FullName -DstRoot $dst
    } else {
      Copy-Item -LiteralPath $_.FullName -Destination $dst -Force
    }
  }
}

Write-Host "Staging full project (excluding: $($excludeDirs -join ', '))..."
Copy-TreeFiltered -SrcRoot $root -DstRoot $stage

# Manifest: list EVERY .sql migration (proof nothing missed)
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
[void]$sb.AppendLine("Excluded: node_modules, .git, dist, supabase/.temp")
[void]$sb.AppendLine("Restore: unzip, npm install, npm run build")
$sb.ToString() | Set-Content -Path $manifestPath -Encoding UTF8

Write-Host "Creating zip ($zipPath) ..."
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$stage\*" -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $stage

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host ""
Write-Host "DONE: $zipPath  (${sizeMb} MB)"
Write-Host "Migrations bundled: $(if ($migrations) { $migrations.Count } else { 0 }) SQL files."
