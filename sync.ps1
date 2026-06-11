# ============================================================
# Stallion Pit — File Sync Script
# Copies downloaded files to correct src/ locations then commits
# Usage: Right-click → Run with PowerShell
#        OR run from PowerShell: .\sync.ps1
# ============================================================

$PROJECT = "D:\stallion-pit"
$DOWNLOADS = "$env:USERPROFILE\Downloads"

# ── File map: filename → relative path inside src/ ──────────
$FILES = @{
  # Root src files
  "App.jsx"              = "src"
  "App.css"              = "src"
  "index.css"            = "src"
  "main.jsx"             = "src"

  # lib
  "supabase.js"          = "src\lib"

  # contexts
  "AuthContext.jsx"      = "src\contexts"
  "VehicleContext.jsx"   = "src\contexts"

  # components
  "Layout.jsx"           = "src\components"
  "VehicleSelector.jsx"  = "src\components"

  # pages
  "Login.jsx"            = "src\pages"
  "Dashboard.jsx"        = "src\pages"
  "Fleet.jsx"            = "src\pages"
  "FuelLog.jsx"          = "src\pages"
  "ServiceLog.jsx"       = "src\pages"
  "PartsLog.jsx"         = "src\pages"
  "Maintenance.jsx"      = "src\pages"
  "Snags.jsx"            = "src\pages"
  "Analysis.jsx"         = "src\pages"
}

Write-Host ""
Write-Host "STALLION PIT — File Sync" -ForegroundColor Yellow
Write-Host "========================" -ForegroundColor Yellow
Write-Host ""

$copied = 0
$skipped = 0
$missing = 0

foreach ($file in $FILES.Keys) {
  $src  = Join-Path $DOWNLOADS $file
  $dest = Join-Path $PROJECT $FILES[$file]

  if (Test-Path $src) {
    # Ensure destination folder exists
    if (-not (Test-Path $dest)) {
      New-Item -ItemType Directory -Path $dest -Force | Out-Null
    }
    Copy-Item -Path $src -Destination $dest -Force
    Write-Host "  COPIED  $file → $($FILES[$file])\" -ForegroundColor Green
    $copied++
  } else {
    Write-Host "  SKIP    $file (not in Downloads)" -ForegroundColor DarkGray
    $skipped++
  }
}

Write-Host ""
Write-Host "Done: $copied copied, $skipped skipped" -ForegroundColor Cyan
Write-Host ""

# ── Git commit and push ──────────────────────────────────────
$commit = Read-Host "Commit message (press Enter to skip git push)"

if ($commit -ne "") {
  Set-Location $PROJECT
  git add .
  git commit -m $commit
  git push
  Write-Host ""
  Write-Host "Pushed to GitHub." -ForegroundColor Green
} else {
  Write-Host "Skipped git push." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
