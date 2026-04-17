# HyperEdit Development Setup Script (Windows)
# Run this once after cloning the repo.

Write-Host "Starting HyperEdit Setup..." -ForegroundColor Cyan

# 1. Install Node.js dependencies
Write-Host "`nInstalling Node.js dependencies..." -ForegroundColor Yellow
npm install --legacy-peer-deps

# 2. Install Python dependencies
Write-Host "`nInstalling Python dependencies (Whisper for captions)..." -ForegroundColor Yellow
pip install openai-whisper torch

# 3. Check for .dev.vars
if (-not (Test-Path ".dev.vars")) {
    Write-Host "`n.dev.vars not found. Copying from .dev.vars.example..." -ForegroundColor Magenta
    Copy-Item ".dev.vars.example" ".dev.vars"
    Write-Host "Created .dev.vars — open it and fill in your API keys before starting." -ForegroundColor Green
} else {
    Write-Host "`n.dev.vars already exists." -ForegroundColor Green
}

Write-Host "`nSetup complete!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Gray
Write-Host "  1. Add your API keys to .dev.vars" -ForegroundColor Gray
Write-Host "  2. Open two terminals and run:" -ForegroundColor Gray
Write-Host "       npm run dev            (Vite, port 5173)" -ForegroundColor Gray
Write-Host "       npm run ffmpeg-server  (FFmpeg server, port 3333)" -ForegroundColor Gray
Write-Host "  3. Open http://localhost:5173 in your browser" -ForegroundColor Gray
Write-Host ""
Write-Host "Optional — Obsidian video vault:" -ForegroundColor Gray
Write-Host "  Install PostgreSQL, then run:" -ForegroundColor Gray
Write-Host "       npm run db:setup   (create tables)" -ForegroundColor Gray
Write-Host "       npm run db:scan    (index your video folder)" -ForegroundColor Gray
