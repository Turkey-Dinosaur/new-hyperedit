# HyperEdit Setup Guide

## Prerequisites

Install these before running the setup script:

| Tool | Download | Notes |
|------|----------|-------|
| **Node.js 18+** | https://nodejs.org | LTS version recommended |
| **FFmpeg** | https://ffmpeg.org/download.html | Must be on your system PATH |
| **Python 3.8+** | https://python.org | For local Whisper transcription |

**Installing FFmpeg on Windows:** Download a build from https://www.gyan.dev/ffmpeg/builds/, extract it, and add the `bin` folder to your system PATH environment variable.

---

## Quick Start

```powershell
# 1. Clone and enter the repo
git clone https://github.com/Turkey-Dinosaur/new-hyperedit.git
cd new-hyperedit

# 2. Run the setup script (Windows)
./setup-dev.ps1
```

The setup script installs Node and Python dependencies and creates a `.dev.vars` file from the example template.

**Linux/macOS:** Run these manually instead:
```bash
npm install --legacy-peer-deps
pip install openai-whisper torch
cp .dev.vars.example .dev.vars
```

---

## API Keys

Open `.dev.vars` and fill in your keys:

```text
GEMINI_API_KEY=      # Required — Google AI Studio: https://aistudio.google.com
FAL_API_KEY=         # Required — fal.ai: https://fal.ai
GIPHY_API_KEY=       # Optional — GIPHY Developers: https://developers.giphy.com
OPENAI_API_KEY=      # Optional — OpenAI: https://platform.openai.com
```

---

## Running the App

You need two terminals running simultaneously:

**Terminal 1:**
```bash
npm run dev
```

**Terminal 2:**
```bash
npm run ffmpeg-server
```

Open **http://localhost:5173** in your browser.

---

## Stopping the App

Press `Ctrl+C` in both terminals.

If a port is still in use (Windows):
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3333).OwningProcess -Force  # FFmpeg server
Stop-Process -Id (Get-NetTCPConnection -LocalPort 5173).OwningProcess -Force  # Vite
```

---

## Optional: Obsidian Video Vault

The Obsidian tab lets you search a personal video library by content, tags, and transcript, then import clips directly into your session. It requires a PostgreSQL database.

### Setup

1. **Install PostgreSQL** — https://www.postgresql.org/download/windows/
2. **Create the database:**
   ```bash
   psql -U postgres -c "CREATE DATABASE hyperedit;"
   ```
3. **Add to `.dev.vars`:**
   ```text
   DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/hyperedit
   DATABASE_SSL=false
   OBSIDIAN_VIDEOS_PATH=C:\path\to\your\video\folder
   OBSIDIAN_VAULT_PATH=C:\path\to\your\obsidian\vault   # optional, for thumbnails
   ```
4. **Create tables and index your videos:**
   ```bash
   npm run db:setup   # creates videos + transcripts tables
   npm run db:scan    # scans OBSIDIAN_VIDEOS_PATH and inserts records
   ```

The Obsidian feature is fully optional — the app works normally without it.

---

## Caption Transcription

Captions use a three-tier fallback:

1. **Local Whisper (free, recommended)** — requires `pip install openai-whisper torch`
2. **OpenAI Whisper API** — requires `OPENAI_API_KEY`
3. **Gemini API** — automatic fallback, timestamps may drift on long clips

Local Whisper runs on CPU only (MPS/GPU not supported). The `base` model is used by default.
