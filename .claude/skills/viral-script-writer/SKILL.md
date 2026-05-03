---
name: viral-script-writer
description: Use when the user wants a script written for a Coedwig Creations wood-worktop restoration video in their established viral style. Loads the project style guide and produces a ready-to-record script from notes, a video summary, or a rough transcript.
metadata:
  tags: scriptwriting, social-media, voiceover, coedwig
---

## When to use

Invoke this skill any time the user asks for a script, voiceover, caption draft, or video copy for one of their wood-worktop restoration videos. Also invoke if they paste rough notes about a job and ask "write this up" or "turn this into a reel."

Do **not** invoke for: technical FFmpeg work, generic copywriting, or non-restoration video projects.

## How it works

1. **Load the style guide** at `prompts/viral-script-style.md` (relative to the repo root). That file is the source of truth — read it in full before writing. Do not paraphrase or rely on memory; the brand vocabulary and beat structure live there and may be edited between sessions.
2. **Collect the inputs.** From the user message, extract:
   - Location (e.g. "Cardiff", "Bristol")
   - Worktop condition (burns, water rings, varnish, chemical damage, etc.)
   - Tools used (sanders, scrapers, etc.)
   - Oil/finish used
   - Client backstory or reaction (if any)
   - Whether the source video is a timelapse
3. If any input is missing and the user hasn't said it doesn't apply, ask once for the missing piece — but only the ones that affect the **Setup** or **Closer** beats. Process tools should be inferred from the table in the style guide if not given.
4. **Write the script following the five beats in order** (Hook → Setup → Process → Reveal → Closer) per the style guide's rules.
5. **Output plain text only** in the format described in the style guide's "Output format" section. No markdown, no beat labels, no emojis. The output may be fed to ElevenLabs TTS verbatim.

## Quality checks before returning the script

- [ ] Total length is 150–180 words
- [ ] Hook is a doubt/question or extreme claim
- [ ] Brand vocabulary uses exact spellings from the style guide table (Osmo Polyx Hardwax Oil, Brillo applicator, microfiber cloth, MIRCA RS600, etc.)
- [ ] Sentences average 5–12 words
- [ ] Present progressive verbs in the Process beat ("I'm using…", "Switching over to…")
- [ ] No CTA in the closer
- [ ] No em-dashes; commas/full stops only
- [ ] Numbers under 10 spelled out

If any check fails, revise before returning.

## Relationship to the runtime pipeline

The same `prompts/viral-script-style.md` is loaded by `scripts/local-ffmpeg-server.js` as the system instruction for the Pass 3 step of the auto-edit pipeline (`POST /session/{id}/auto-edit-full`). Improvements to the style guide automatically apply both here and there — there's only one copy.
