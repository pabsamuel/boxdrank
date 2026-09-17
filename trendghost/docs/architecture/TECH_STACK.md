# Tech stack

Chosen for the MVP per `DECISIONS.md` D1–D3. Nothing here is precious except the boundary in D2.

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript, strict | |
| App shell | Vite + React (PWA) | Installable, opens on a phone from a URL over HTTPS/LAN. |
| Camera | `navigator.mediaDevices.getUserMedia` | `facingMode: 'user'`, request 1280×720 @30fps, accept what you get. |
| Pose | `@mediapipe/tasks-vision` `PoseLandmarker` | `pose_landmarker_lite` live, `_full` for ingest. GPU delegate with CPU fallback. |
| Rendering | Canvas 2D first | Upgrade to WebGL only if profiling says so. |
| Scoring | `src/pose-core/` — pure TS, no DOM | Portable to native later (D2). |
| Storage | IndexedDB (idb) for timelines/metadata, OPFS for video and takes | No server. |
| Recording | `MediaRecorder` over a canvas capture stream + mic/video track | iOS Safari is the weak spot; test early, degrade honestly. |
| State | Zustand (or plain context) | Keep it small. |
| Tests | Vitest for `pose-core` and utils, Playwright for a couple of smoke flows | Fixtures are landmark JSON, not video. |
| Formatting | Prettier + ESLint | |
| Verify | `npm run verify` = format check + typecheck + tests | The gate in `CLAUDE.md` rule 3. |

## Directory shape (target)

```
trendghost/
  src/
    pose-core/          # pure: normalise, features, score, smooth, timeline types
    camera/             # getUserMedia, device selection, capture timestamps
    inference/          # MediaPipe wrapper, worker, model loading, fps metering
    ingest/             # video decode -> timeline
    render/             # canvas layers: camera, ghost, skeletons, HUD
    playback/           # PlaybackClock, speed, transport
    coach/              # framing checks, cue selection, learn-mode gating
    storage/            # IndexedDB + OPFS
    ui/                 # screens and components
    config/             # scoring.config.ts and friends — all tunables live here
  fixtures/             # landmark JSON test fixtures (NO third-party video)
  docs/
  prompts/
```

## Notes on the native port (later)

React Native + Expo, `react-native-vision-camera` frame processors, MediaPipe native tasks. `pose-core` and `coach` move over unchanged; `render` and `camera` are rewritten. Do it only when the matching already feels good.
