# HyperEdit

An AI-powered video editor built with React 19, Remotion, and Cloudflare Workers.

## Quick Start

```bash
git clone https://github.com/Turkey-Dinosaur/new-hyperedit.git
cd new-hyperedit
./setup-dev.ps1          # Windows — installs deps and creates .dev.vars
```

Add your API keys to `.dev.vars` (see `.dev.vars.example`), then:

```bash
npm run dev              # Terminal 1 — Vite (http://localhost:5173)
npm run ffmpeg-server    # Terminal 2 — FFmpeg server (port 3333)
```

See [SETUP.md](./SETUP.md) for full instructions including FFmpeg, Python/Whisper, and the optional Obsidian vault.

---

## Features

### Timeline Editor
- 6-track timeline — T1 (captions), V3/V2/V1 (video layers), A1/A2 (audio)
- Drag, resize, split, and trim clips
- Auto-snap, ripple delete, and auto-order clips by timestamp
- Merge clips into a single asset
- Timeline tabs for editing individual clips in isolation
- Undo/redo history

### AI Director Agent
- Natural language video editing commands via Gemini
- Generate captions, motion graphics, and animations from a chat prompt
- Quick Actions for common tasks: dead air removal, timelapse, auto-edit, and more
- Reads your timeline before making suggestions

> **Note — Auto-Edit is opinionated by default.**
> The "Auto-Edit (Use Template)" feature uses two Gemini prompts in `scripts/local-ffmpeg-server.js`. The first pass (around line 8402) is generic content analysis. The second pass (around line 8469) contains a hardcoded editing template that was written for **worktop restoration videos** — it structures the output around before shots, sanding timelapses, oil application, and a client reveal.
>
> To tailor auto-edit to your own content, edit the `pass2Prompt` string starting at line 8469. Replace the `EDITING TEMPLATE` section with your own structure — describe your preferred shot order, section durations, and any content-specific rules. The `pass1Prompt` (line 8402) rarely needs changing unless you want Gemini to extract different metadata from the footage.

### Captions
- One-click transcription via local OpenAI Whisper (free, word-level timestamps)
- Three-tier fallback: local Whisper → OpenAI API → Gemini
- Style options: font, size, colour, position, animation (karaoke, bounce, typewriter, fade, pop)
- Interactive text overlays directly on the video canvas

### Motion Graphics
- 11 built-in Remotion templates across text, engagement, data, branding, and showcase categories
- AI-generated custom animations — describe what you want, Gemini writes and renders it
- Edit existing animations in-place

### Picasso — Image Generation
- Generate images from text prompts via fal.ai
- Results land directly in the asset library

### DiCaprio — Video AI
- **Animate Image** — bring a still photo to life (Kling v1.5)
- **Restyle Video** — apply style transfer to existing footage (LTX-2)
- **Remove Background** — AI background removal (Bria)

### GIF & Asset Tools
- GIPHY search — find and add GIFs to the timeline
- Create animated GIFs from images with motion effects
- Extract audio from video into a separate track
- Dead air removal — silence detection + segment concat via FFmpeg

### Obsidian Video Vault *(optional)*
- Search a personal video library by content, tags, and transcript
- PostgreSQL-backed — index your local video folder with `npm run db:scan`
- Import any result directly into your session from the chat panel

### Project Management
- Landing page with project list, create, rename, and delete
- Session persistence — reopen projects where you left off
- Auto-thumbnail generation for all assets

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Motion graphics | Remotion 4.x |
| Backend | Node.js FFmpeg server (local), Cloudflare Worker + Hono (production) |
| AI | Google Gemini 2.5 Flash, fal.ai, OpenAI Whisper |
| Video vault | PostgreSQL |

---

## Commands

```bash
npm run dev              # Vite dev server
npm run ffmpeg-server    # Local FFmpeg + AI server (port 3333)
npm run build            # Production build
npm run db:setup         # Create Obsidian vault DB tables
npm run db:scan          # Index video folder into DB
```

---

Built with [Mocha](https://getmocha.com). Join the community on [Discord](https://discord.gg/shDEGBSe2d).
