# STATUS — TrendGhost

> Living document. A new session should be able to resume from this file alone.
> Update it at the end of every working session.

## Current phase

**Phases 1–7 built and green; 8–9 partly built.** The app runs: camera, on-device
pose, ghost overlay, per-limb red/amber/green scoring, lookahead cues, framing
coach, learn gating, photo mode with auto-shutter, recording, library, settings,
onboarding, PWA + share target.

## Next exact action

**Open it on a real phone and use it.** `npm install && npm run fetch-models && npm run dev -- --host`,
then reach it over HTTPS (see `DEPLOY.md` — a tunnel is the quickest). Run a real
trend through it and report back: the debug HUD numbers (`?debug=1`), whether the
ghost sits on your body correctly, whether the cue timing feels early/late, and any
pose where you disagree with the colour. Everything after this is tuning, and tuning
without a phone is guessing.

## Phase log

| Phase | Scope | Status | Verified |
| --- | --- | --- | --- |
| 0 | Specs, architecture docs, build prompts, decisions/risks | ✅ | docs only |
| 1 | Camera + on-device pose + live skeleton + fps HUD | ✅ | e2e: camera opens, model loads, inference produces results |
| 2 | Reference ingest: share sheet / picker → timeline + cue track → local storage | ✅ code | unit: resampler + normalisation; **not yet run on a real video** |
| 3 | Ghost overlay, subject-space fitting, one playback clock, speed control | ✅ code | builds; **needs a phone** |
| 4 | Scoring engine: normalise, limb angles, per-limb score, smoothing, alignment | ✅ | 9/9 fixture tests incl. one-wrong-arm |
| 5 | Framing coach: body-in-frame, distance, angle, lighting, one instruction at a time | ✅ | e2e: says "step into the frame" with no person, never fake-red |
| 6 | Cue engine (prepare/go/hit/hold/correct) + learn-mode gating | ✅ | 13/13 cue tests incl. lead time, priority, cooldown |
| 7 | Photo mode: target pose, ghost outline, auto-shutter on sustained match | ✅ code | builds; **needs a phone** |
| 8 | Record mode + stored score track | 🟡 | recording + take storage done; **take-review timeline UI not built** |
| 9 | Library, onboarding, settings, PWA, share target, privacy copy | 🟡 | done except the in-app privacy page and icons beyond the SVG |

## Test status

`npm run verify` → prettier + tsc + eslint + **25/25 unit tests**, green.
`npm run test:e2e` → 3 Playwright smoke tests in a real Chromium with a fake camera.
The third (camera + model + render loop) needed its IndexedDB seeding rewritten —
it was racing the app's own schema creation. Re-run it before trusting a green
board; if you touch storage, that test is the one that notices.

Unit coverage is deliberately concentrated where correctness is hard and testable:
the 7 scoring fixtures from `docs/architecture/POSE_MATCHING.md` §9 and the cue
engine's timing/priority rules.

## What is NOT verified

Be honest about this — it is the difference between "built" and "works":

- **No real phone has run this.** Every performance number in `PERFORMANCE_BUDGET.md`
  is still a target, not a measurement. The one measurement we have (~2fps, 350ms
  inference) is from headless software GL in a container and means nothing.
- **No real video has been ingested.** The ingest pipeline typechecks and follows the
  spec, but it has never decoded an actual TikTok clip.
- **Ghost alignment and cue lead time are untuned.** 450ms is a literature number, not
  something we measured on a person.
- **iOS `MediaRecorder` is unverified**, which is the known weak spot of the web-first
  choice (`DECISIONS.md` D1).

## Open questions for the owner

`OWNER_ACTIONS.md`. Nothing blocks trying the app.

## Session notes

- _(newest first: date — what changed — what was verified)_
- 2026-09-15 — Built phases 1–7 and most of 8–9: pose-core (normalise/features/score/smooth/align/timeline), cue engine (segment/cues/phrases/voice), framing coach, MediaPipe wrapper, camera, playback clock, canvas renderer, IndexedDB+OPFS storage, video and photo ingest, all screens, PWA + share target, model fetch script. Two real bugs found and fixed by testing: the overall score was far too forgiving of one wrong limb (added the worst-segment blend, `POSE_MATCHING.md` §5), and the lighting check was doing a full-canvas GPU readback every frame (moved to a 32×32 offscreen sampler). `npm run verify` green, 22/22 unit tests, 3/3 e2e.
- 2026-09-15 — Added `CONTENT_SOURCING.md` (three import lanes, never a downloader) and `CUE_ENGINE.md` (lookahead cues). Decisions D9/D10.
- 2026-09-15 — Phase 0: project scaffolded. Docs only.
