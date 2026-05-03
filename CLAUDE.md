# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HyperEdit is an AI-powered video editor built with React 19, Remotion for motion graphics, and Cloudflare Workers for the backend. It's a Mocha platform app.

## Commands

```bash
npm install --legacy-peer-deps  # Install dependencies (required due to Vite 7 peer dep conflict)
npm run dev              # Start Vite dev server
npm run ffmpeg-server    # Start local FFmpeg server (port 3333) - run in separate terminal
npm run build            # TypeScript + Vite production build
npm run lint             # ESLint
npm run check            # Full validation: type check + build + deploy dry-run
npm run knip             # Check for unused dependencies
npm run cf-typegen       # Generate Cloudflare worker types
```

**Local development** requires both `npm run dev` and `npm run ffmpeg-server` running simultaneously. Open `http://localhost:5173` in your browser. For first-time Windows setup, run `./setup-dev.ps1`.

If a port is already in use (EADDRINUSE), kill it in PowerShell:
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3333).OwningProcess -Force  # FFmpeg server
Stop-Process -Id (Get-NetTCPConnection -LocalPort 5173).OwningProcess -Force  # Vite
```

## Architecture

```
src/
├── react-app/           # Frontend React SPA
│   ├── components/      # UI: Timeline, VideoPreview, AssetLibrary, AIPromptPanel, MotionGraphicsPanel
│   ├── hooks/           # useProject (main state), useFFmpeg, useVideoSession
│   └── pages/           # Home.tsx (main editor), LandingPage.tsx
├── worker/index.ts      # Hono backend API (AI editing via Gemini)
├── remotion/            # Motion graphics system
│   ├── DynamicAnimation.tsx  # AI-generated scenes (~107KB)
│   └── templates/       # 11 templates with registry in index.ts
├── shared/types.ts      # Shared client-server types (Zod schemas)
└── types/env.d.ts       # Environment type definitions
scripts/
└── local-ffmpeg-server.js  # Session-based FFmpeg server with Whisper transcription
```

**Available Google Fonts** (loaded in `index.html`): Bebas Neue, Inter, Montserrat, Oswald, Poppins, Roboto.

**Largest files** (where most complexity lives):
- `src/react-app/pages/Home.tsx` — ~2400 lines (main editor orchestration)
- `src/react-app/hooks/useProject.ts` — ~1200 lines (central state manager)
- `scripts/local-ffmpeg-server.js` — ~7900 lines (all video processing)

**Key patterns:**
- Multi-track timeline with 6 tracks: T1 (captions), V3 (top overlay), V2 (overlay), V1 (base video), A1/A2 (audio)
- `useProject()` hook manages all project state: assets, clips, playback, captions, rendering
- Local FFmpeg server (port 3333) handles sessions, asset storage, thumbnail generation, rendering, and Whisper-based transcription for captions
- Cloudflare Worker (Hono) with D1 database and R2 bucket for production — 3 endpoints: `POST /api/ai-edit/start` (async job), `GET /api/ai-edit/status/:jobId` (poll), `POST /api/ai-edit` (legacy sync)

## State Management

The `useProject()` hook in `src/react-app/hooks/useProject.ts` is the central state manager. Key concepts:

- **Assets**: Source files (video/image/audio) with metadata, thumbnails, and stream URLs
- **TimelineClips**: Instances of assets placed on tracks with start time, duration, in/out points, and transforms
- **CaptionData**: Word-level timing from Whisper transcription, stored separately with style configuration keyed by clip ID. Caption clips on T1 have `assetId: ''` — never look for caption content in the asset library.
- **TimelineTabs**: Each tab stores its own `clips: TimelineClip[]` separately. `activeClips` in Home.tsx switches between main `clips` and `tab.clips`. All move/resize/delete operations must check `activeTabId !== 'main'` and dispatch to `updateTabClips` instead.

**Critical patterns:**
- The hook uses parallel refs (`tracksRef`, `clipsRef`, `settingsRef`) synced via `useEffect` so debounced/async operations read latest state without stale closures. This is essential for `saveProject` and `renderProject`.
- Session ID is persisted in `localStorage` under key `hyperedit-session`. If the FFmpeg server restarts, the stored session may be invalid (404), in which case localStorage is cleared and a new session is created on next asset upload.
- Tracks are always initialized client-side (never loaded from server) to guard against outdated server data.
- Auto-save is intentionally disabled to prevent excessive saves during drag operations. Saves must be triggered explicitly via `saveProject()`.
- `refreshAssets` appends `?v=Date.now()` to `streamUrl` for cache-busting after server-side file modifications.
- Assets with `aiGenerated: true` are deprioritized when selecting context video for new animation generation.

**Two parallel session systems exist:**
- `useProject` (modern) — multi-asset, full timeline
- `useVideoSession` (legacy) — single-video, still used exclusively for `generateChapters` in Home.tsx

## FFmpeg Server

The local FFmpeg server (`scripts/local-ffmpeg-server.js`, ~7900 lines) is a raw Node.js `http.createServer` with regex-based route matching. It handles all video processing, asset management, Remotion rendering, transcription, and fal.ai calls. The Cloudflare Worker only generates FFmpeg commands via Gemini — it does NOT execute them.

Key endpoints on `localhost:3333`:
- `POST /session/create` - Create new editing session
- `POST /session/{id}/assets` - Upload asset (auto-generates thumbnails)
- `POST /session/{id}/transcribe` - Whisper transcription for captions
- `POST /session/{id}/render` - Render final video
- `POST /session/{id}/render-motion-graphic` - Render Remotion animation
- `POST /session/{id}/generate-animation` - AI-generated Remotion code (Gemini writes JSX → Remotion CLI renders)
- `POST /session/{id}/edit-animation` - Modify existing Remotion source in-place (same asset ID reused after re-render)
- `POST /session/{id}/process-asset` - Apply FFmpeg command to a specific asset (replaces in-place)
- `POST /session/{id}/extract-audio` - Split video into muted video + audio on A1
- `POST /session/{id}/generate-video` - Image-to-video via fal.ai (DiCaprio)
- `POST /session/{id}/restyle-video` - Video-to-video style transfer (DiCaprio)
- `POST /session/{id}/remove-video-bg` - Background removal (DiCaprio)
- `POST /session/{id}/generate-image` - Picasso image generation
- `POST /session/{id}/giphy/*` - GIPHY search/trending/add proxy
- `POST /session/{id}/create-gif` - Animated GIF from image with motion effects

Sessions persist to `/tmp/hyperedit-ffmpeg/sessions/{sessionId}/` with assets, renders, project.json, and assets-meta.json (stores `aiGenerated`, `duration`, `editCount`).

## TypeScript Configuration

Three separate tsconfig files:
- `tsconfig.app.json` - React app (ES2020, strict)
- `tsconfig.worker.json` - Cloudflare Worker
- `tsconfig.node.json` - Build tools

Path alias: `@/` → `./src/`

## Remotion Integration

Motion graphics use Remotion 4.x. Two distinct subsystems coexist:

**Static Templates** (`src/remotion/templates/`): 11 pre-built components registered in `MOTION_TEMPLATES` with categories (text, engagement, data, branding, mockup, showcase). Used by `MotionGraphicsPanel` with `@remotion/player` for live preview.

**AI-Generated Dynamic Animations** (`src/remotion/DynamicAnimation.tsx`): Takes `scenes: Scene[]` prop with types like title, steps, features, stats, chart, countdown, emoji, gif, lottie, etc. Composition `id="DynamicAnimation"` is what the FFmpeg server renders. Uses `@remotion/shapes`, `@remotion/animated-emoji`, `@remotion/gif`, `@remotion/lottie`, `@remotion/three`.

When working on templates, use the `/remotion-best-practices` skill for domain-specific guidance. Tailwind only scans `./src/react-app/` — not the remotion directory.

## Environment Variables

Required in `.dev.vars` for local development:
- `GEMINI_API_KEY` - Google AI for editing commands (worker uses `gemini-2.5-flash`)
- `FAL_API_KEY` - fal.ai for Picasso/DiCaprio (note: server aliases this to `FAL_KEY` for the fal.ai SDK)
- `GIPHY_API_KEY` - GIF search
- `OPENAI_API_KEY` - Additional AI features
- `ELEVENLABS_API_KEY` - ElevenLabs TTS for the Auto-Edit Full pipeline (voice ID hardcoded as `wUkGqD7qevNIshEdEC5s`)

## Auto-Edit Full Pipeline

The Auto Edit button in `AIPromptPanel` triggers `handleAutoEditFull` in `Home.tsx`, which chains:

1. `handleAutoOrder` — sorts raw clips on each track by filename timestamps
2. `handleMergeAll` — merges all video clips into a single V1 asset (server: `POST /session/:id/merge-all`)
3. `POST /session/:id/auto-edit-full` — server-side, this is `handleUseTemplate` invoked with `{ runVoiceover: true }`. Steps inside the IIFE:
   1. Mute the source (ffmpeg `-c:v copy -an`) so the user's voiceover plays clean
   2. Existing pipeline: scene detect → frame extract → Gemini Pass 1 (content analysis) → Pass 2 (edit decisions) → timelapse asset creation
   3. Pass 3: `generateViralScript()` calls Gemini with `prompts/viral-script-style.md` as the system instruction
   4. Returns the script in the job result; **TTS is not done server-side**.
4. Frontend shows `VoiceoverModal` with the generated script (copy button + audio file picker). User records/generates the voiceover externally and uploads the MP3.
5. Frontend uploads the audio via `uploadAsset`, then calls `POST /session/:id/transcribe` (Whisper) to get word-level timing.
6. Frontend stitches the edit decisions into a single V1 video by calling `/merge-all` again, then drops the merged V1 clip + uploaded audio on A1 + Whisper-aligned captions on T1 (chunked via the 5-word / 0.7s-pause rule).

A `synthesizeWithElevenLabs()` helper still exists in `local-ffmpeg-server.js` and the `ELEVENLABS_API_KEY` env var is still read but no caller invokes it. Re-enable by calling it from the auto-edit-full IIFE if you want to revive the API path.

**Style guide source of truth**: `prompts/viral-script-style.md`. Also referenced by the `viral-script-writer` Claude Code skill at `.claude/skills/viral-script-writer/SKILL.md`. Edit the markdown to change the voice; both consumers pick it up automatically (skill at invocation, server at startup).

The legacy `POST /session/:id/use-template` endpoint is preserved for a future "cuts only, keep my voice" mode but has no UI in v1.

## AI Agents

The right panel has three AI agents accessible via tabs. All three panels are always mounted but toggled with `hidden` CSS class to preserve chat state.
- **Director** (AIPromptPanel): Video editing commands, captions, motion graphics, animations
- **Picasso** (PicassoPanel): Image generation using fal.ai nano-banana-pro model
- **DiCaprio** (DiCaprioPanel): Video generation with Animate Image (Kling v1.5), Restyle Video (LTX-2 19B), Remove Background (Bria)

## UI Layout Conventions

- **Track placement**: AI-generated animations always go on V2. B-roll images go on V3 with default `scale: 0.2`, centered.
- **Image clips** default to 5-second duration everywhere (`addClip`, `handleDropAsset`, `addCaptionClip`).
- **Caption word timestamps** are relative to clip start, not absolute project time. Conversion happens in `getPreviewLayers()`.
- **Caption chunking**: Max 5 words per chunk OR when there's a 0.7s pause between words (hardcoded in Home.tsx `handleTranscribeAndAddCaptions`).
- **Ripple delete**: When `autoSnap` is true, deleting a clip shifts subsequent clips on the same track backward via the `ripple` parameter on `deleteClip`.
- **`splitClip`** has a 0.05s guard — returns `null` if split point is within 50ms of either edge.
- **Properties panel**: Left panel bottom half shows `CaptionPropertiesPanel` when selected clip is on T1, otherwise `ClipPropertiesPanel`.
- **Resizable panels**: Left (assets + properties), right (AI agents), and timeline height are all user-resizable via `ResizablePanel`/`ResizableVerticalPanel`.

## Local Whisper Transcription

Captions use local OpenAI Whisper (`scripts/whisper-transcribe.py`). Setup:
```bash
pip install openai-whisper torch
```
- **MPS (Apple GPU) is NOT supported** — Whisper's sparse tensors crash on MPS. The script runs on CPU only. Do not add `device="mps"`.
- The server checks for both `python3` and `python` commands for Windows/Unix compatibility.
- 3-tier fallback: local Whisper (free) → OpenAI Whisper API (requires `OPENAI_API_KEY`) → Gemini API (timestamps may drift on long audio).
- The `base` model is used by default (good speed/accuracy balance).

## Dead Air Removal

The remove dead air workflow (`POST /session/{id}/remove-dead-air`) is stable — **do not modify it**. How it works:
1. FFmpeg `silencedetect` finds silence periods (threshold: -26dB, min duration: 0.4s — set in `Home.tsx handleRemoveDeadAir`)
2. Each non-silent segment is extracted individually with `-ss`/`-t` and re-encoded (`libx264 ultrafast, aac`)
3. Segments are concatenated with `-c copy` into the final output
4. The original file is replaced in-place on disk
5. Frontend calls `refreshAssets()` to get a cache-busted URL and updates the V1 clip duration

The segment-based approach (extract + concat) is required — single-pass filter approaches (`select`/`aselect`, `trim`/`atrim`) drop audio streams. The `VideoPreview` component uses a stable `key` on the base video element and manually calls `video.load()` when the source URL changes, preserving browser audio permission from the user's play gesture.

## Build & Deployment

- Vite config uses `@cloudflare/vite-plugin` and `@getmocha/vite-plugins`. `chunkSizeWarningLimit: 5000` due to Remotion's size.
- `wrangler.json` app name is a UUID (Mocha app ID). SPA routing via `not_found_handling: "single-page-application"`.
- `remotion.config.ts` at root sets video image format to JPEG and enables output overwrite.
- No tests exist in the codebase. No testing framework is configured.
