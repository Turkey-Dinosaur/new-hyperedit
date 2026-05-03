# Coedwig Creations — Viral Script Style Guide

This is the source-of-truth voice and structure for short-form social videos by **Coedwig Creations** (wood worktop restoration, ~90–110 seconds, vertical, designed for Instagram/TikTok).

It is loaded by:
1. The `viral-script-writer` Claude Code skill at `.claude/skills/viral-script-writer/SKILL.md`
2. The FFmpeg server's auto-edit pipeline (Pass 3 system instruction) in `scripts/local-ffmpeg-server.js`

Both consumers should treat this file as the single source. Edit here, propagate everywhere.

---

## Voice in one sentence

A confident craftsperson narrating their own restoration in real time — short sentences, brand-name-dropping, never overhyped, lets the visual transformation do the bragging.

## Structural beats (must include all 5, in order)

| # | Beat | Goal | Length |
|---|------|------|--------|
| 1 | **Hook** | Open with doubt or extreme claim. Make the viewer second-guess that this is fixable. | 1 short sentence (≈8–14 words) |
| 2 | **Setup** | Briefly anchor the job: location, backstory, or stakes. Optional emotional context (e.g. client about to pay thousands for replacement). | 1–2 sentences |
| 3 | **Process** | Walk through the steps in order, naming tools and grits. Each step is 1 sentence. Use present progressive ("I'm using…", "Switching over to…"). | 4–7 sentences |
| 4 | **Reveal** | The transformation moment. Emphasise compression of effort ("Four hours of work in just over a minute"). Pull out a visual highlight (grain, removed marks). | 1–2 sentences |
| 5 | **Closer** | Either a client testimonial line OR "the finish speaks for itself" / equivalent. Never a CTA — never "follow for more". | 1 sentence |

## Brand vocabulary (use the exact names when they appear)

| Item | Correct spelling |
|------|------------------|
| Hardwax oil | **Osmo Polyx Hardwax Oil** (or "Osmo Polyx") |
| Oil applicator | **Brillo applicator** |
| Buffing cloth | **microfiber cloth** |
| Random-orbit sander | **MIRCA RS600** |
| Detail sander | **mini belt sander** |
| Old-finish removal | **carbide scraper** |
| Sanding grits | **60 grit → 80 grit → 120 grit** (in this order) |

If the input notes mention a tool by generic name, swap it for the brand version above. If it's a tool *not* on this list, just describe it plainly.

## Sentence rhythm rules

- **Short**: 5–12 words per sentence on average. Long sentences feel un-Coedwig.
- **Present progressive** when describing steps: "I'm starting off…", "I'm using…", "Switching over to…".
- **First-person** ("I", never "we" or "you").
- **Conversational connectors**: "Now it's time for…", "Then…", "And that's it."
- **No filler**: no "Let me show you", no "In this video".
- **No CTAs** — no follow / like / save / link in bio.

## Length target

- **150–180 words total.** Read aloud at TTS pace this lands at ~90–110 seconds.
- **Hook + Setup ≤ 25 words combined** (must hit fast).
- **Process is the bulk** (~70–110 words).
- **Reveal + Closer ≤ 35 words combined.**

---

## Annotated example #1 — Cardiff worktop

> **HOOK:** Is this rooftop even savable? This has to be one of the worst rooftops I've ever seen. I mean, look at it.
>
> **SETUP:** I about these today I'm in Cardiff tackling this absolute mess of a worktop, so let's see what we can do with it. Honestly, I'm not sure if I'll end up making it worse trying to fix it or absolutely transform it and getting it looking as good as new again.
>
> **PROCESS:** I'm starting off using this brand new MIRCA RS600. This tool absolutely eats through the use of use and old finish, stripping it straight back to bare woods using the 60 grit sanding disc. Switching over to the orbital sanding now with another 60 grit disc as I'm noticing the rotary sander is clogging up the discs pretty quickly. I'll then go over the worktops again with an 80 grit and a 120 grit sanding disc. Now it's time for the best bit, the oil. I'm using this Osmo Poly X Hardwax oil and using a Brillo type applicator to ensure a nice even coating. I'll give all of the worktops a once over with the oil, leave it to set for a bit and then buff it off with a microfiber cloth.
>
> **REVEAL:** And that's it. Four hours worth of work in just over a minute and these worktops have been completely transformed looking absolutely amazing. All the black marks around the sinker be completely removed and the natural grain of the wood looks stunning in the daylight.
>
> **CLOSER:** This is what the client had to say. *"Oh wow what a difference. Wow. They're fabulous all even around the 90s and I mean that's night and day fantastic."*

## Annotated example #2 — Auntie's kitchen

> **HOOK:** Are these worktops beyond saving? Just wait until you see the result and see what the client had to say.
>
> **SETUP:** This client was ready to pay thousands for replacement worktops until he needs so one of my restorations on social media and hope that I could save her auntie's kitchen.
>
> **PROCESS:** I started by using a carbide scraper to remove the old varnish and reveal the condition of the wood underneath. Next I started the sanding process to remove all of the waymarks. This is the longest part of the process but also the most important part as all of the bad patches need to be removed before any oil can be applied. Then I used a new tool, a mini belt sanded that get in all of the worktop grooves and the tight spots around the tap as it couldn't be removed and I also followed up with some hands and in two. Now it's time for the best part, applying the oil. I use Osmo Polyx Hardwax oil for a durable finish and to really bring out the beauty of the natural oak grain. I use a Brillo type applicator to spread the oil evenly then buff it off with a microfiber cloth.
>
> **REVEAL & CLOSER:** It's a bit of a process but the finish speaks to itself.

---

## How to adapt to a new job

When given a video summary or notes, fill the beats in order:

1. **Hook**: pick the worst-looking moment from the input and frame it as a question. If the worktop has burns, water rings, or chemical damage — call it out.
2. **Setup**: location if given (e.g. "I'm in Bristol"), or backstory ("client found me on Instagram"). If neither, state stakes ("they were quoted £3k for replacements").
3. **Process**: list every tool/step that appears in the input, in temporal order, using brand names from the table above. Always mention grit progression if sanding is involved.
4. **Reveal**: include a "X hours into Y seconds" line if the source video is a timelapse. Otherwise emphasise a single visual highlight.
5. **Closer**: if a client reaction is in the input, quote it directly with quote marks. Otherwise, "the finish speaks for itself" or a one-line equivalent.

## Output format

Plain text only — no markdown, no labels, no emojis. The output is going to be read aloud by ElevenLabs TTS, then word-aligned for captions, so:

- **Use punctuation that ElevenLabs respects**: full stops, commas, question marks. Avoid em-dashes (ElevenLabs reads them awkwardly) — use commas or full stops instead.
- **Spell out numbers under 10** ("four hours" not "4 hours") for natural pronunciation.
- **No stage directions** like "[shot of sander]" — only the spoken words.
- **No newlines mid-sentence** — one paragraph per beat is fine, separated by a blank line.

## Improving this guide

This guide was distilled from two transcripts. As more videos are produced, drop new transcripts into `transcriptions/` and refine the patterns above — especially the brand vocabulary table and the closer phrasings. The hook/setup/process/reveal/closer skeleton is stable, but the exact word choices should sharpen with sample size.
