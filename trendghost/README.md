# 👻 TrendGhost

**Learn any viral dance or photo pose by copying a ghost of the original — live, through your camera.**

You open the camera. The original video plays as a semi-transparent "ghost" layered on top of your own camera feed. You move your body into the ghost. The app tracks your body in real time and paints you **red when you're off, amber when you're close, green when you nail it** — joint by joint, so you can see *which* arm is wrong, not just "you failed".

Same idea for photos: pick a trending pose, the ghost shows where your head, shoulders, hips and hands should be, and the shutter fires by itself the moment you match.

---

## Why this exists

Copying a TikTok dance from a flat video is hard because:

- the original is mirrored relative to you,
- you can't see yourself and the reference at the same time,
- nobody tells you *which* part of your body is wrong,
- you find out you were off-frame only after recording.

TrendGhost fixes all four: overlay instead of side-by-side, per-joint colour feedback instead of a single score, and a framing check *before* you start.

---

## How it works (one paragraph)

You get a routine in by sharing it straight from TikTok/Reels into the app, picking it from your camera roll, or starting from a built-in template (`docs/product/CONTENT_SOURCING.md` — we never download anyone's video from a link). Every reference video is then pre-processed once into a **pose timeline** and a **cue track**: for each frame, the 33 body landmarks, normalised so body size and camera distance don't matter. At practice time the camera feed is run through the same pose model at ~30fps, normalised the same way, and compared against the reference frame for the current playback time. The comparison is done on **limb angles**, not pixel positions, so tall/short, near/far, left/right of frame all still score correctly. Each limb gets a score 0–1 → colour (`docs/architecture/POSE_MATCHING.md`), while the cue track fires ~450ms *ahead* of each move so you're told what's coming instead of just being marked on what you missed (`docs/architecture/CUE_ENGINE.md`).

---

## Modes

| Mode | What it does |
| --- | --- |
| **Learn** | Ghost plays at 0.25×–1× speed, step by step, calling each move before it happens — "arms up next… **now**… **cut it**… hold, 2, 1". Waits for you to hit each key pose before advancing. |
| **Practice** | Full-speed ghost, live per-joint colour feedback, live accuracy %, cues still calling the next move. No recording. |
| **Record** | Full-speed, ghost fades to near-invisible, records your take with the music. Post-take timeline shows where you lost sync. |
| **Photo** | Single target pose. Ghost outline + auto-shutter when you hold the match for ~0.6s. |

---

## Project status

**It runs.** Camera, on-device pose tracking, ghost overlay, per-limb red/amber/green
scoring, lookahead cues, framing coach, learn mode, photo mode with auto-shutter,
recording with a take-review graph, library, settings, PWA with share target.

What has **not** happened yet: nobody has used it on a real phone with a real trend
video. Every performance and feel number is still a target. That's the next step, and
it's the one thing AI can't do for you — see [`STATUS.md`](STATUS.md).

```bash
npm install
npm run fetch-models
npm run dev -- --host     # then open it on your phone over HTTPS — see DEPLOY.md
```

## Where to start

1. [`DEPLOY.md`](DEPLOY.md) — how to run it and get it onto your phone (the camera needs HTTPS).
2. [`STATUS.md`](STATUS.md) — what's built, what's verified, what isn't, and the next exact action.
3. [`docs/product/PRODUCT_SPEC.md`](docs/product/PRODUCT_SPEC.md) — what this is meant to be.
4. [`docs/architecture/`](docs/architecture/) — how the hard parts work: [pose matching](docs/architecture/POSE_MATCHING.md), [the cue engine](docs/architecture/CUE_ENGINE.md), [the ghost overlay](docs/architecture/GHOST_OVERLAY.md).
5. [`prompts/`](prompts/) — the phase prompts and [how to drive this with Claude Code](prompts/HOW_TO_USE_CLAUDE.md), for the work that's left.

## What's in the box

```
src/pose-core/   normalise · limb-angle features · scoring · smoothing · time alignment
src/coach/       move segmentation · cue track · phrases · framing checks · voice
src/inference/   MediaPipe pose landmarker wrapper
src/render/      canvas layers, ghost fitting
src/ingest/      video/photo -> pose timeline + cue track
src/storage/     IndexedDB + OPFS, local only
src/ui/          library · ingest · practice · photo · take review · settings · onboarding
```

`src/pose-core/` and `src/coach/` are pure TypeScript with no DOM — they're unit
tested against synthetic fixtures, and they're what ports to a native app later.

## Legal note, up front

TrendGhost does **not** download, host, or redistribute anyone's TikTok/Reels/Shorts videos. Users supply a video from their own camera roll, and the app keeps only the derived **pose timeline** (a list of numbers) plus a local-only copy of the video on the user's own device. See `RISKS.md`.
