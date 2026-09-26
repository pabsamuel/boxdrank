# Prompt 02 — Phase 2: reference ingest (video → pose timeline)

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md`, `CLAUDE.md`, `docs/product/CONTENT_SOURCING.md`, `docs/architecture/POSE_MATCHING.md` (§1 normalisation, §6 timing) and `docs/architecture/TECH_STACK.md`.

Build **Phase 2 only**: turn a user-supplied video into a stored pose timeline.

Scope:

1. `src/pose-core/types.ts` — define `PoseTimeline`: metadata (id, name, duration, source fps, created) plus a 30fps-resampled array of frames, each with the 33 landmarks, per-landmark visibility, and a `confidence`/`lowConfidence` flag. Version the format (`version: 1`).
2. **Two import lanes** per `CONTENT_SOURCING.md`:
   - **Share sheet** — a Web Share Target entry in the manifest accepting `video/*`, so the user can tap Share → TrendGhost from TikTok/Reels on Android. Detect whether the platform supports it and only show the "share it to us" hint where it actually works. On iOS say plainly: "save the video first, then pick it here" — do not fake support.
   - **Camera roll picker** — always available, the universal fallback.
3. Ingest pipeline: video in → decode frames → run `PoseLandmarker` (`full` model, video mode) → normalise per `POSE_MATCHING.md` §1 → resample to a fixed 30fps grid → write the timeline.
4. Progress UI with a cancel button. A 15s clip must not look frozen.
5. Storage: timeline JSON in IndexedDB, the source video in OPFS, both keyed by routine id. Nothing leaves the device (`CLAUDE.md` rule 4).
6. A confirm screen: scrub through the video with the detected skeleton drawn over it, so I can see whether the dancer was actually tracked. Big "looks right / try another video" choice.
7. Honest rejection: if more than ~35% of frames are low-confidence, or no person is found, or multiple people dominate, say so specifically ("the dancer is too small in frame for the last 4 seconds") instead of producing a garbage timeline.

Out of scope: overlay, scoring, playback, library UI beyond the minimum to trigger ingest.

Hard rules:

- **No downloading from TikTok/Instagram/YouTube**, no URL input field anywhere, no yt-dlp, no scraping — the share sheet and the file picker are the only ways in (`CLAUDE.md` rule 5, `RISKS.md` R1, `CONTENT_SOURCING.md` "the fourth lane"). If a task seems to need it, stop and ask.
- Do not commit any video to the repo. Fixtures are landmark JSON only.

Tests: unit-test the resampler (variable source fps → exact 30fps grid) and the normaliser (a synthetic pose scaled ×2 and translated produces near-identical normalised output).

When done: show `npm run verify` output, tell me how to try it on my phone with my own video, update `STATUS.md`, commit.
