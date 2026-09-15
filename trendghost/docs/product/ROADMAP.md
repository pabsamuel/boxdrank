# Roadmap

Phases match `STATUS.md` and the numbered files in `prompts/`. Each phase ends green (`npm run verify`) and with `STATUS.md` updated. Ship each as its own PR.

## Phase 1 — Camera + skeleton (the "is this even possible" spike)

Live camera on a phone, MediaPipe pose landmarker running on-device, skeleton drawn over the feed, fps counter on screen. Tests + `npm run verify` set up. **Stop here and look at it on a real phone before building anything else.**

## Phase 2 — Reference ingest

Get a video in (share sheet where the platform supports it, camera roll everywhere) → decode frames → run the heavier pose model → normalise → write a `PoseTimeline` JSON → persist locally. Preview screen to confirm the dancer was tracked. Handles bad input honestly. See `docs/product/CONTENT_SOURCING.md` — no URL fetching, ever.

## Phase 3 — Ghost overlay

Reference video drawn over the camera at adjustable opacity, plus its skeleton. One playback clock (D6) driving video, audio and reference-frame lookup. Speed control. Scrub bar.

## Phase 4 — Scoring engine

`pose-core`: normalisation, limb-angle features, per-limb score, smoothing, overall score. Unit tests against recorded fixtures (identical pose ≈ 1.0, mirrored pose, scaled person, off-centre person, one wrong arm). Then wire colours into the skeleton.

## Phase 5 — Framing coach

Pre-start checks: whole body in frame, distance band, camera height/tilt, light level, single subject. One instruction at a time, then countdown.

## Phase 6 — Learn mode + the cue engine

Segment the timeline into moves (key poses at motion minima + beat if available), classify each move, and generate a **cue track** stored with the routine: "arms up next" → "now" → "cut it" → "hold". Lookahead timing, voice, haptics, count-in, one-cue-at-a-time priority — all per `docs/architecture/CUE_ENGINE.md`. Learn mode adds per-move gating on top: advance only when the user holds the key pose. The cue engine is then used by Practice, Record and Photo too, at different verbosity.

## Phase 7 — Photo mode

Single target pose from a still or a chosen video frame. Outline ghost, per-joint colour, auto-shutter after a sustained match, 3-frame burst, pick-the-best screen.

## Phase 8 — Record mode + take review

Record camera (with audio) during a run, store the per-frame scores alongside, accuracy-over-time graph, tap a dip to compare with the ghost. Export to camera roll.

## Phase 9 — Library, onboarding, polish, ship prep

Routine library, empty states, permission pre-screen, settings (sensitivity, mirror, reduced mode, clear data), icon/splash, deploy or store prep per `OWNER_ACTIONS.md`.

## Later (explicitly not v1)

Community template library (rights-cleared, ours or licensed) · duet/two-person scoring · on-beat *scoring* (beat-aligned cues land in Phase 6) · streaks and practice history · native port (D1) · community routine library with rights-cleared content.
