# STATUS — TrendGhost

> Living document. A new session should be able to resume from this file alone.
> Update it at the end of every working session.

## Current phase

**Phases 1–7 built and green; 8–9 partly built.** The app runs: camera, on-device
pose, ghost overlay, per-limb red/amber/green scoring, lookahead cues, framing
coach, learn gating, photo mode with auto-shutter, recording, library, settings,
onboarding, PWA + share target.

## Next exact action

**Open it on your phone and run a real trend through it.**

    https://pabsamuel.github.io/boxdrank/trendghost/

Deployed and live (see `DEPLOY.md`), so there is nothing to install or tunnel.
Add it to your home screen first — that is what registers the share target.

Then report four things, because everything left is tuning and tuning without a
phone is guessing:

1. the debug HUD numbers (`?debug=1`) — inference Hz, render fps, latency
2. whether the ghost actually sits on your body
3. whether the cues land early or late (the lead time is an untested 450 ms)
4. any pose where you disagree with the colour

## Phase log

| Phase | Scope | Status | Verified |
| --- | --- | --- | --- |
| 0 | Specs, architecture docs, build prompts, decisions/risks | ✅ | docs only |
| 1 | Camera + on-device pose + live skeleton + fps HUD | ✅ | e2e: camera opens, model loads, inference produces results |
| 2 | Reference ingest: share sheet / picker → timeline + cue track → local storage | ✅ | e2e: a real shared photo reaches ingest with the app closed and is consumed once; **still not run on a real video** |
| 3 | Ghost overlay, subject-space fitting, one playback clock, speed control | ✅ code | builds; **needs a phone** |
| 4 | Scoring engine: normalise, limb angles, per-limb score, smoothing, alignment | ✅ | 9/9 fixture tests incl. one-wrong-arm |
| 5 | Framing coach: body-in-frame, distance, angle, lighting, one instruction at a time | ✅ | e2e: says "step into the frame" with no person, never fake-red |
| 6 | Cue engine (prepare/go/hit/hold/correct) + learn-mode gating | ✅ | 13/13 cue tests incl. lead time, priority, cooldown |
| 7 | Photo mode: target pose, ghost outline, auto-shutter on sustained match | ✅ code | builds; **needs a phone** |
| 8 | Record mode + take review | ✅ | 7/7 review tests (dip detection, limb attribution, windowing); side-by-side scrub + per-limb breakdown built |
| 9 | Library, onboarding, settings, PWA, share target, privacy copy | ✅ | PNG icons (192/512/maskable) so Android offers the install that registers the share target; privacy copy in Settings; deployed to GitHub Pages |

## Test status

`npm run verify` → prettier + tsc (src, scripts **and e2e**) + eslint + **47/47 unit
tests**, green.

`npm run test:e2e` → **6/6 Playwright tests** in a real Chromium with a fake camera:
onboarding and the camera pre-permission screen, no-URL-field, camera + model +
render loop with zero off-device requests, the share-sheet handoff via a real
multipart POST, a shared *link* explained rather than fetched, and single-consumption
of a shared file.

`npm run test:e2e:pages` → the same 6 against a **`/boxdrank/trendghost/` build**,
which is what actually ships. The sub-path changes the service worker's scope and
the share-target URL, so this is not redundant — it has already caught one real bug.

## What is NOT verified

- **No real phone has ever run this.** Every performance figure in
  `docs/architecture/PERFORMANCE_BUDGET.md` is a target, not a measurement.
- **No real trend video has ever been ingested.** Ingest is proven on a 1×1 PNG
  fixture and on synthetic timelines, not on a dance clip.
- **Ghost alignment and the 450 ms cue lead are untuned guesses.**
- Headless Chromium runs on software GL, so its fps numbers mean nothing.
