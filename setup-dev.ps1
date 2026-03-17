# HyperEdit Development Setup Script (Windows)
# This script installs Node.js and Python dependencies.

Write-Host "🚀 Starting HyperEdit Setup..." -ForegroundColor Cyan

# 1. Install Node.js dependencies
Write-Host "`n📦 Installing Node.js dependencies..." -ForegroundColor Yellow
npm install --legacy-peer-deps

# 2. Install Python dependencies
Write-Host "`n🐍 Installing Python dependencies (Whisper)..." -ForegroundColor Yellow
pip install openai-whisper torch

# 3. Check for .dev.vars
if (-not (Test-Path ".dev.vars")) {
    Write-Host "`n⚠️  .dev.vars not found. Creating a template..." -ForegroundColor Magenta
    "GEMINI_API_KEY=`nOPENAI_API_KEY=`nFAL_API_KEY=`nGIPHY_API_KEY=" | Out-File -FilePath ".dev.vars" -Encoding utf8
    Write-Host "✅ Created .dev.vars template. Please add your API keys to it." -ForegroundColor Green
} else {
    Write-Host "`n✅ .dev.vars found." -ForegroundColor Green
}

Write-Host "`n✨ Setup Complete!" -ForegroundColor Cyan
Write-Host "To start the app, run:" -ForegroundColor Gray
Write-Host "  npm run dev            (Vite)" -ForegroundColor Gray
Write-Host "  npm run ffmpeg-server  (FFmpeg)" -ForegroundColor Gray
