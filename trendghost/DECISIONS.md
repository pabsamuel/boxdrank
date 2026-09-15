# DECISIONS

Decisions that shape the build. Each one: what, why, what it costs, and what would make us revisit.

## D1 — Web-first PWA for the MVP, native app later

**Decision.** Build the MVP as a mobile web app (PWA): TypeScript + Vite, camera via `getUserMedia`, pose via MediaPipe Tasks Vision (WASM/GPU) in the browser.

**Why.** It runs on both iPhone and Android with one codebase, needs no app-store review or developer account to test, and you can open it on your phone from a URL within minutes of a change. For a project whose core risk is "does the matching actually feel good", the fastest possible feedback loop is worth more than native polish.

**Cost.** Weaker access to camera controls, no background processing, video recording on iOS Safari is limited and the recorded output is lower quality than a native capture. Battery/thermals are worse than native.

**Revisit when.** The matching feels good and the bottleneck becomes recording quality or frame rate — then port to React Native + Expo with `react-native-vision-camera` and the MediaPipe native tasks, reusing the scoring engine verbatim (see D2).

## D2 — The scoring engine is a pure, platform-free TypeScript module

**Decision.** `packages/pose-core` (or `src/pose-core/`) contains normalisation, limb-angle extraction, scoring and smoothing as pure functions over plain arrays. No DOM, no camera, no React.

**Why.** It's the part that must be correct, it's the part worth unit-testing against recorded fixtures, and it's the part we want to carry unchanged into a native app.

**Cost.** A little extra plumbing at the boundaries.

## D3 — MediaPipe Pose Landmarker as the pose model

**Decision.** MediaPipe Tasks Vision `PoseLandmarker`, `lite` model on the live camera path, `full`/`heavy` allowed for offline reference processing where latency doesn't matter.

**Why.** 33 landmarks including feet, runs on-device in the browser, mature, free, good mobile performance, world-landmark output available.

**Cost.** One person at a time (that's fine for v1). Accuracy drops on fast motion, occlusion and unusual camera angles — the framing coach (Phase 5) exists to keep users inside the model's comfort zone.

**Revisit when.** Multi-person duets become a feature, or a materially better on-device model ships.

## D4 — Score on limb angles, not landmark positions

**Decision.** Compare the *direction of each limb segment* (and a few relative offsets), not raw or even normalised point distances.

**Why.** Angles are invariant to body size, camera distance and where the person stands in frame — exactly the things that differ between the reference creator and the user, and exactly the things we must not penalise. Point distance would punish a short user for being short.

**Cost.** Angles ignore some real differences (e.g. how far apart the feet are relative to the hips), so a small number of relative-distance features are added back deliberately. Detailed in `docs/architecture/POSE_MATCHING.md`.

## D5 — Reference videos are user-supplied and stay on the device

**Decision.** The user picks a video from their own camera roll. The app stores the derived pose timeline (JSON) and keeps the video in local storage (OPFS/IndexedDB) only. No server-side video, no downloading from social platforms.

**Why.** Legal exposure and platform ToS. A pose timeline is a set of coordinates derived for the user's personal practice; a hosted library of scraped TikToks is a lawsuit and an app-store rejection.

**Cost.** No instant "browse trending dances" tab in v1. Sharing a routine means sharing the *timeline*, not the video, which is a weaker (but legal) experience.

## D6 — Playback clock is the single source of truth for time

**Decision.** One monotonic clock drives ghost video position, reference-frame lookup, audio and scoring. Camera frames are timestamped and matched to the nearest reference frame; they never drive time themselves.

**Why.** Camera fps, render fps and video fps all differ and drift. Anything else produces feedback that lags the ghost, which users read as "the app is wrong".

## D7 — Feedback is per-limb colour plus one number, never a grade

**Decision.** Colour each limb segment red → amber → green from its own score; show one overall accuracy percentage; never show letter grades or "FAIL".

**Why.** The product's entire value is *which part of you is wrong*. A single aggregate tells the user nothing actionable, and harsh grading makes people quit in the first 30 seconds.

## D8 — Mirror by default, with a visible toggle

**Decision.** The camera preview is mirrored (people expect a mirror), and the reference is mirrored to match, so "raise the arm on the same side as the ghost's raised arm" is literally true on screen. Internally everything is converted into subject-space first. A toggle switches to "anatomical" mode for users who want to copy left/right exactly.

**Why.** Mirroring is the single most common source of confusion in dance tutorials, and of bugs in pose code. One documented convention, one helper, one toggle.

## D9 — Three import lanes, and never a video downloader

**Decision.** Routines enter the app by (1) the platform's own share sheet, (2) the camera roll picker, or (3) a bundled template pack we film or license. No URL input, no fetching, ever. Detail and reasoning in `docs/product/CONTENT_SOURCING.md`.

**Why.** Lane 1 gives the user the "it just grabs it" experience they actually want, while the *platform* does the exporting under the creator's own download settings. A built-in downloader would give the same UX and take the whole project down with it (`RISKS.md` R1).

**Cost.** iOS Safari has no Web Share Target, so iOS users are on the camera-roll picker until the native app exists. The template pack costs real money (a dancer, a shoot, or licensing) before it can ship.

**Revisit when.** Never for the downloader. The template pack's size and sourcing is an open owner decision.

## D10 — Cues lead the move; colour follows it

**Decision.** A cue engine generates a **cue track** at ingest — "arms up next", "now", "cut it", "hold" — fired ~450ms *before* each move, on the playback clock, through voice + large text + haptics. Colour feedback stays as-is, reporting the present. Spec: `docs/architecture/CUE_ENGINE.md`.

**Why.** Red/green alone is a mirror: by the time you're red, the moment is gone. Telling the user what's coming is what turns the app from a scoreboard into a teacher, and it's the thing that makes a fast trend learnable at all.

**Cost.** Lead time is a real tuning problem (wrong in either direction feels broken), and the cue *phrasing* has to be generated from pose deltas, which is fiddly. Both are isolated: timings in `cues.config.ts`, wording in `coach/phrases.ts`.
