New Features Implementation Plan
Add 6 new AI-powered features to ClipWise (HyperEdit), all accessible from the Director tab → Quick Actions submenu in 
AIPromptPanel.tsx
.

User Review Required
IMPORTANT

External API Dependencies: Features 2 (Copy Video) and 5a (AI Voiceover) require OpenAI API calls. Feature 5c (Audio De-Noising) can use FFmpeg filters for a basic version, but a higher-quality version would need an external AI audio model. The OPENAI_API_KEY already exists in 
.dev.vars
 — confirm it should be used for TTS voiceover.

WARNING

FFmpeg Server Size: The server is already ~7,700 lines. Each feature adds 150-400 lines. Consider whether you'd like us to split it into separate files/modules as part of this work or keep everything in the single file for now.

IMPORTANT

Phased Delivery: These 6 features are substantial. We recommend implementing them in 3 phases (see bottom). Please confirm the priority order.

Current Architecture (Summary)
The app follows a 3-layer pattern for each feature:

Quick Action Button(AIPromptPanel.tsx)
Workflow Handler(AIPromptPanel.tsx)
Backend Endpoint(local-ffmpeg-server.js)
AI Analysis(worker/index.ts)
FFmpeg Processing
Gemini AI Analysis
Remotion Rendering
For each new feature, we touch these files:

File	Role
AIPromptPanel.tsx
Add to suggestions[], 
WorkflowType
, 
determineWorkflow()
, new handleXxxWorkflow()
Home.tsx
Wire new callback props from useProject to 
AIPromptPanel
useProject.ts
(If needed) Add new state/actions for timeline manipulation
local-ffmpeg-server.js
Add endpoint handlers + route registrations
AIPromptPanelProps
Add new callback prop types
Multi-Asset Selection Implementation Plan
Add the ability to select multiple assets in the left side panel using standard modifier keys (Ctrl/Cmd for toggling, Shift for range selection).

Proposed Changes
Feature 1: Auto-Edit ("Smart Storyboarder")
Goal: Turn raw footage clips into a 1-2 minute social media-ready video automatically.

[MODIFY] 
local-ffmpeg-server.js
New endpoint: POST /session/{id}/auto-edit

Gather asset metadata: List all video assets in the session, read filenames (which contain timestamps), get durations via ffprobe.
Extract preview frames: For each long clip (>30s), use FFmpeg to extract 1 frame every 10 seconds to a temp folder: ffmpeg -i clip.mp4 -vf "fps=1/10" -q:v 5 frame_%03d.jpg
Gemini analysis: Send the timestamped filenames, durations, and frame descriptions to Gemini with a structured prompt:
"You have these clips from a worktop restoration. Identify phases (Before, Sanding, Oiling, After). Select 3-5s of best action from each. For long clips (>60s), recommend timelapse speed. Return JSON edit list."
Output an Edit JSON: Return { editList: [{ assetId, start, duration, speed?, label }], totalDuration, phases: string[] }
Apply to timeline: The frontend reads the JSON and maps each entry to a TimelineClip on V1, using start/duration as in/out points with speed for timelapses.
Request body: { targetDuration?: number } (default: 60-120 seconds)

Response: { editList: EditListItem[], totalDuration: number }

[MODIFY] 
AIPromptPanel.tsx
Add 'auto-edit' to 
WorkflowType
 union (line ~880)
Add keyword matching in 
determineWorkflow()
 for prompts like "auto edit", "smart edit", "storyboard", "create from clips"
Add handleAutoEditWorkflow() handler:
POST to /session/{id}/auto-edit
Receive edit list JSON
Show a preview/summary in chat: "Found 4 phases: Before (5s), Sanding (10s timelapse), Oiling (8s), Reveal (5s). Total: 28s"
On approval, call onAutoEdit(editList) callback to place clips on timeline
Add to suggestions[] array: { icon: Sparkles, text: 'Auto-edit from clips' }
[Asset Library Component]
[MODIFY] 
AssetLibrary.tsx
Update AssetLibraryProps.onSelect to pass selection modifiers: onSelect?: (assetId: string, modifiers: { multi: boolean; range: boolean }) => void.
Update AssetLibraryProps.selectedAssetId to selectedAssetIds: string[].
Update 
AssetCard
 to capture e.ctrlKey (or e.metaKey) and e.shiftKey on click and pass them up.
[Main Pages]
[MODIFY] 
Home.tsx
Add handleAutoEdit callback that maps the edit list to addClip() calls on V1 track
Wire as onAutoEdit prop to 
AIPromptPanel
Feature 2: Copy Video ("Style & Pace Transfer")
Goal: Analyze a reference video and replicate its pacing/style on your clips.

[MODIFY] 
local-ffmpeg-server.js
New endpoint: POST /session/{id}/analyze-reference

Accept reference video: Can use an asset already uploaded to the session, identified by assetId.
Scene detection: Use FFmpeg's scdet filter to detect cuts: ffmpeg -i ref.mp4 -filter:v "scdet=t=10" -f null - — parse the output for scene change timestamps.
Compute pace metadata:
Average cut length (total duration / number of cuts)
Cut length distribution (array of durations between cuts)
Overall pacing category: "fast" (<2s), "medium" (2-4s), "slow" (>4s)
Audio BPM detection (optional): Use FFmpeg ebur128 filter or a lightweight beat detection approach. Can also send a short audio clip to Gemini and ask it to estimate BPM.
Return pace metadata: { avgCutLength, cutLengths[], pacing, bpm?, totalCuts, transitions[] }
New endpoint: POST /session/{id}/apply-pace

Takes { paceMetadata, targetDuration? } alongside session assets
Uses the pace metadata to constrain the auto-edit algorithm (reuses logic from Feature 1)
Trims clips to match avgCutLength from reference
Returns same editList format as auto-edit
[MODIFY] 
AIPromptPanel.tsx
Add 'copy-video' to 
WorkflowType
Add keyword matching: "copy video", "match style", "pace transfer", "replicate edit"
Add handleCopyVideoWorkflow():
Prompt user to select an asset as the reference video (use the existing reference picker or a dedicated selector)
POST to /session/{id}/analyze-reference with the reference assetId
Show pace summary: "Reference style: Fast-paced (1.5s avg cuts, 120 BPM). Apply to your clips?"
On approval, POST to /session/{id}/apply-pace with pace metadata
Map result edit list to timeline
Add to suggestions[]: { icon: Copy, text: 'Copy video style' } (import Copy from lucide-react)
[MODIFY] 
Home.tsx
Add handleCopyVideoEdit callback (similar pattern to handleAutoEdit)
Wire as onCopyVideoEdit prop
Feature 3: Intelligent Timelapse
Goal: Create variable-speed timelapses of long clips, speeding up boring parts and slowing visually interesting parts.

[MODIFY] 
local-ffmpeg-server.js
New endpoint: POST /session/{id}/create-timelapse

Input: { assetId, targetDuration?, uniformSpeed? }
Activity analysis: Extract frames every 5 seconds. Use Gemini Vision to classify each segment as "low activity" (repetitive sanding) vs "high activity" (transitioning, applying oil, visible change).
Speed mapping: Assign speeds:
Low activity: 30x-50x
Medium activity: 10x-20x
High activity: 5x-10x
Key moments (first oil application etc.): 1x-2x (near real-time)
Segmented processing: Split asset into segments at activity boundaries using FFmpeg -ss/-t, apply setpts filter with the appropriate speed to each segment, then concat.
Output: Replace-in-place or create new asset. Return { assetId, duration, segments: [{ start, end, speed, label }] }
Alternative (simpler first pass): Accept a uniform speed multiplier and just use ffmpeg -i input.mp4 -filter:v "setpts=PTS/{speed}" -an output.mp4 for basic timelapse without AI analysis.

[MODIFY] 
AIPromptPanel.tsx
Add 'timelapse' to 
WorkflowType
Add keyword matching: "timelapse", "time lapse", "speed up long", "fast forward"
Add handleTimelapseWorkflow():
If no specific clip referenced, offer selection — or default to longest clip
Ask "Intelligent (AI detects activity) or uniform speed?"
POST to /session/{id}/create-timelapse
Show segments summary: "Created 45s timelapse: Sanding (30x), Oil application (5x), Drying (50x)"
Update timeline clip with new duration
Add to suggestions[]: { icon: Timer, text: 'Create timelapse' } (Timer already imported)
[MODIFY] 
Home.tsx
Add handleCreateTimelapse callback — calls server, refreshes assets, updates clip duration
Wire as onCreateTimelapse prop
Feature 4: Create Ad (Motion Graphics Integration)
Goal: Generate a 15-30s ad/TikTok with text overlays, split-screens, and CTAs from existing footage.

[MODIFY] 
local-ffmpeg-server.js
New endpoint: POST /session/{id}/create-ad

Input: { format: '15s' | '30s' | '60s', platform: 'tiktok' | 'instagram' | 'youtube', style?: string }
Content analysis: Use existing 
getOrTranscribeVideo()
 + Gemini to identify:
"Hook" moment (most dramatic before/after contrast)
Key process phases
"Reveal" moment (finished result)
Ad structure generation: Ask Gemini to generate a Remotion scene structure:
Hook clip (grab attention in first 3 seconds)
Process montage (quick cuts/timelapses)
Text overlays ("Gross to Great", "Professional Restoration")
Before/After split-screen
CTA ("Follow for more", "Link in Bio")
Render via Remotion: Use existing 
handleGenerateAnimation
 pattern — Gemini produces the DynamicAnimation scene JSON, Remotion renders it with the user's actual video clips embedded.
Output: New asset with the rendered ad video
This heavily reuses the existing DynamicAnimation + Remotion rendering pipeline.

[MODIFY] 
AIPromptPanel.tsx
Add 'create-ad' to 
WorkflowType
Add keyword matching: "create ad", "tiktok ad", "promotional", "social media ad", "create promo"
Add handleCreateAdWorkflow():
Ask for platform/duration preference (use clarification options UI)
POST to /session/{id}/create-ad
Show ad structure for approval (reuse animation concept approval pattern)
Render and add to timeline on approval
Add to suggestions[]: { icon: Zap, text: 'Create social ad' } (or a new icon like Megaphone)
[MODIFY] 
Home.tsx
Wire onCreateAd callback (follows same pattern as onCreateCustomAnimation)
Feature 5: AI Extras (Voiceover, Satisfaction Detection, Audio Cleanup)
These are 3 smaller features grouped together.

5a. AI Voiceover (TTS)
[MODIFY] 
local-ffmpeg-server.js
New endpoint: POST /session/{id}/generate-voiceover

Input: { script?: string, autoGenerate?: boolean, voice?: string }
Script generation: If autoGenerate, use existing transcription + Gemini to write a narration script based on the video phases (e.g. "Now we move to 240 grit for that buttery smooth finish")
TTS synthesis: Call OpenAI audio/speech API (model: tts-1, voice: alloy/nova/etc.) — the OPENAI_API_KEY is already in 
.dev.vars
Save as audio asset: Write the MP3 to the session, register as new audio asset
Output: { assetId, filename, duration } — frontend places on A2 track
[MODIFY] 
AIPromptPanel.tsx
Add 'voiceover' to 
WorkflowType
Keyword matching: "voiceover", "narration", "voice over", "text to speech", "tts", "add narration"
handleVoiceoverWorkflow(): Ask for custom script or auto-generate, show script for approval, POST, add audio to A2
5b. Satisfaction Detection (Oil Reveal Slowdown)
[MODIFY] 
local-ffmpeg-server.js
New endpoint: POST /session/{id}/detect-satisfaction-moments

Input: { assetId }
Frame analysis: Extract frames every 2 seconds, send to Gemini Vision: "Identify the exact moments where oil is applied to wood and the color dramatically changes. Return timestamps."
Output: { moments: [{ timestamp, description, suggestedSpeed: 0.5 }] }
Apply: Frontend can use existing asset processing to slow these sections with: ffmpeg -i input.mp4 -filter:v "setpts=2.0*PTS" -filter:a "atempo=0.5" -ss {start} -t {duration} output.mp4
This integrates into the Timelapse feature (Feature 3) as an enhancement — satisfaction moments get automatic slow-mo.

5c. Audio De-noising / Cleanup
[MODIFY] 
local-ffmpeg-server.js
New endpoint: POST /session/{id}/clean-audio

Input: { assetId, mode: 'denoise' | 'remove-tools' | 'asmr' }
Processing: Use FFmpeg audio filters:
denoise: afftdn=nf=-25 (already exists as an FFmpeg command suggestion)
remove-tools: highpass=f=300,lowpass=f=4000,afftdn=nf=-30 (aggressive tool noise removal)
asmr: highpass=f=100,lowpass=f=8000,afftdn=nf=-15,equalizer=f=2000:width_type=o:width=2:g=3 (keep wood scratching, remove motor noise)
Replace in-place: Same pattern as existing 
handleProcessAsset
Output: { assetId, mode }
[MODIFY] 
AIPromptPanel.tsx
Add 'clean-audio' to 
WorkflowType
Keyword matching: "clean audio", "denoise", "remove noise", "asmr audio", "audio cleanup"
handleCleanAudioWorkflow(): Use clarification UI for mode selection
Add to suggestions[]: { icon: Volume2, text: 'Clean audio (ASMR)' }
Feature 6: Auto Order
Goal: Automatically reorder timeline clips based on their filenames (date-time stamped).

[MODIFY] 
AIPromptPanel.tsx
This feature is frontend-only — no backend endpoint needed.

Add 'auto-order' to 
WorkflowType
Keyword matching: "auto order", "reorder clips", "sort clips", "chronological order", "order by time"
Add handleAutoOrderWorkflow():
Read all clips on V1 track
For each clip, look up the asset filename
Parse the date-time from filenames (e.g. 2024-01-15_14-30-00.mp4 or similar timestamped formats)
Sort clips chronologically
Reassign startTime values sequentially (clip₁.startTime = 0, clip₂.startTime = clip₁.duration, ...)
Show reorder summary in chat: "Reordered 8 clips chronologically: clip1 → clip4 → clip2 → ..."
Add to suggestions[]: { icon: ListOrdered, text: 'Auto-order clips' } (ListOrdered already imported in Home.tsx — add import in AIPromptPanel)
[MODIFY] 
Home.tsx
Add handleAutoOrder callback:
Get V1 clips + their asset filenames
Parse timestamps from filenames using regex patterns (support common formats: YYYY-MM-DD_HH-MM-SS, YYYYMMDD_HHMMSS, IMG_YYYYMMDD, etc.)
Sort and reassign start times
Call updateClips() or equivalent to update timeline state
Wire as onAutoOrder prop
Summary: All UI Changes to Quick Actions
New entries for the suggestions[] array in 
AIPromptPanel.tsx
:

typescript
const suggestions = [
  // ... existing 12 items ...
  { icon: Wand2, text: 'Auto-edit from clips' },     // Feature 1
  { icon: Copy, text: 'Copy video style' },           // Feature 2
  { icon: Timer, text: 'Create timelapse' },          // Feature 3
  { icon: Megaphone, text: 'Create social ad' },      // Feature 4
  { icon: Mic, text: 'Add AI voiceover' },            // Feature 5a
  { icon: Volume2, text: 'Clean audio (ASMR)' },      // Feature 5c
  { icon: ListOrdered, text: 'Auto-order clips' },    // Feature 6
];
New 
WorkflowType
 entries:

typescript
type WorkflowType =
  // ... existing types ...
  | 'auto-edit'           // Feature 1
  | 'copy-video'          // Feature 2
  | 'timelapse'           // Feature 3
  | 'create-ad'           // Feature 4
  | 'voiceover'           // Feature 5a
  | 'clean-audio'         // Feature 5c
  | 'auto-order';         // Feature 6
NOTE

Feature 5b (Satisfaction Detection) doesn't get its own Quick Action — it integrates into Feature 3 (Timelapse) as an automatic enhancement. When creating an intelligent timelapse, the system automatically detects and slow-mos satisfaction moments.

New Dependencies
Dependency	Purpose	Installation
None for npm	All features use existing deps	—
OpenAI TTS API	Voiceover (Feature 5a)	Already configured via OPENAI_API_KEY in 
.dev.vars
No new npm packages are required. All features leverage existing tools:

FFmpeg (already installed) for video processing, audio filtering, scene detection
Gemini API (already configured) for content analysis and script generation
Remotion (already configured) for motion graphics in Create Ad
OpenAI API (already configured) for TTS voiceover
Phased Implementation
Phase 1 — Core Features (Recommended First)
Feature 6: Auto Order — Frontend-only, quick win, immediately useful
Feature 3: Intelligent Timelapse — High-value for the worktop use case
Feature 5c: Audio Cleanup — Simple FFmpeg filters, quick to implement
Phase 2 — AI-Powered Features
Feature 1: Auto-Edit — Complex but high-value; builds foundation for Feature 2
Feature 5a: AI Voiceover — Leverages existing OpenAI integration
Phase 3 — Advanced Features
Feature 2: Copy Video — Builds on Auto-Edit foundation
Feature 4: Create Ad — Most complex; needs Remotion + video compositing
Feature 5b: Satisfaction Detection — Enhancement to Timelapse
Change selectedAssetId state to selectedAssetIds: string[].
Update handleAssetSelect to implement selection logic:
Single Click: Set as the only selected ID.
Ctrl/Cmd + Click: Toggle the ID in the array.
Shift + Click: Select a range of assets from the last selected index to the current index.
Update onSelect and selectedAssetIds props passed to 
AssetLibrary
.
Verification Plan
NOTE

No test framework is currently configured in this project (
CLAUDE.md
 confirms: "No tests exist in the codebase. No testing framework is configured."). Verification will be manual via the browser and server logs.

Manual Verification (Per Feature)
Each feature will be verified by:

Start the dev servers: Run npm run dev and npm run ffmpeg-server in separate terminals
Upload test clips: Upload 3-5 short video clips with timestamped filenames to the app
Trigger via Quick Actions: Click the new Quick Action button for each feature
Verify chat flow: Confirm the chat shows the expected prompts, previews, and approval steps
Verify timeline result: Confirm clips appear correctly on the timeline after approval
Verify server logs: Check the FFmpeg server console for expected processing output
TypeScript build check: Run npm run build to confirm no type errors
Specific Feature Tests
Auto-Edit: Upload 5+ clips → click "Auto-edit from clips" → verify edit list JSON → approve → check V1 timeline has clips in logical order with appropriate durations
Copy Video: Upload a reference video + raw clips → click "Copy video style" → verify pace analysis numbers → approve → check clips match reference pacing
Timelapse: Upload a long clip (>1 min) → click "Create timelapse" → select "Intelligent" → verify segment breakdown → check output duration is reduced
Create Ad: Upload before/after clips → click "Create social ad" → select TikTok/15s → verify ad structure → approve render → check output has overlays
Voiceover: Upload video → click "Add AI voiceover" → approve generated script → verify audio asset appears on A2 track
Audio Cleanup: Upload video with tool noise → click "Clean audio" → select "ASMR" mode → verify audio is cleaned (compare before/after)
Auto Order: Upload clips with timestamp filenames → click "Auto-order clips" → verify V1 clips are reordered chronologically
Manual Verification
Single Selection: Clicking an asset selects only that asset.
Multi-Selection (Ctrl/Cmd): Holding Ctrl and clicking multiple assets highlights all of them.
Toggle (Ctrl/Cmd): Clicking an already selected asset while holding Ctrl deselects it.
Range Selection (Shift): Clicking an asset, then holding Shift and clicking another asset selects all assets between them.
Drag and Drop: Ensure dragging still works (should probably drag all selected assets, or at least the one being grabbed). Initial implementation will stay as-is for drag (dragging the grabbed asset) unless issues arise.