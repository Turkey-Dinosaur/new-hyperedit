# HyperEdit

An AI-powered video editor built with React 19, Remotion, and Cloudflare Workers. Fork of [kevinbadi/hyperedit](https://github.com/kevinbadi/hyperedit), significantly extended with a full timeline editor, multiple AI agents, motion graphics, and a searchable video vault.

## Quick Start

```bash
git clone https://github.com/Turkey-Dinosaur/new-hyperedit.git
cd new-hyperedit
./setup-dev.ps1          # Windows — installs deps and creates .dev.vars
```

Then add your API keys to `.dev.vars` (see `.dev.vars.example`) and run:

```bash
npm run dev              # Terminal 1 — Vite (http://localhost:5173)
npm run ffmpeg-server    # Terminal 2 — FFmpeg server (port 3333)
```

See [SETUP.md](./SETUP.md) for full installation instructions including FFmpeg, Python/Whisper, and the optional Obsidian vault.

---

## What's New vs the Original

The original [kevinbadi/hyperedit](https://github.com/kevinbadi/hyperedit) was a bare scaffold. This fork turns it into a fully-featured editor:

### Timeline Editor
- **6-track timeline** — T1 (captions), V3/V2/V1 (video layers), A1/A2 (audio)
- Drag, resize, split, and trim clips on the timeline
- Auto-snap, ripple delete, and auto-order clips by timestamp
- Merge clips into a single asset
- Timeline tabs for editing individual clips in isolation
- Undo/redo history

### AI Director Agent
- Natural language video editing commands powered by Gemini
- Generate captions, motion graphics, and animations from a chat prompt
- Quick Actions menu for common workflows (dead air removal, auto-edit, timelapse, etc.)
- Context-aware: reads your timeline before suggesting edits

### Captions
- One-click transcription via local OpenAI Whisper (free, word-level timestamps)
- Three-tier fallback: local Whisper → OpenAI API → Gemini
- Fully styled captions: font, size, colour, position, animation (karaoke, bounce, typewriter, etc.)
- Interactive text overlays on the video canvas

### Motion Graphics
- 11 built-in Remotion templates (text, engagement, data, branding, mockup, showcase)
- AI-generated custom animations — describe what you want in chat, Gemini writes it
- Edit existing animations in-place without re-uploading

### Picasso Agent — Image Generation
- Generate images from text prompts via fal.ai
- Images drop directly into the asset library

### DiCaprio Agent — Video AI
- **Animate Image** — bring a still photo to life (Kling v1.5)
- **Restyle Video** — apply a style transfer to existing footage (LTX-2)
- **Remove Background** — AI background removal (Bria)

### GIF & Asset Tools
- Search GIPHY and add GIFs to the timeline
- Create animated GIFs from images with motion effects
- Extract audio from video into a separate A1 track
- Dead air removal (FFmpeg silence detection + segment concat)

### Obsidian Video Vault *(optional)*
- Search a personal video library by content, tags, and transcript
- PostgreSQL-backed — index your local video folder with `npm run db:scan`
- Import any result directly into your current session from the chat panel

### Project Management
- Landing page with project list, create, rename, and delete
- Session persistence via localStorage
- Auto-thumbnail generation for all assets

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS |
| Motion graphics | Remotion 4.x |
| Backend | Node.js FFmpeg server (local), Cloudflare Worker + Hono (production) |
| AI | Google Gemini 2.5 Flash, fal.ai, OpenAI Whisper |
| Video vault | PostgreSQL + pg |

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
