# Prompt 07 — Phase 7: photo mode

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md`, `CLAUDE.md`, `docs/architecture/GHOST_OVERLAY.md` (photo mode section) and `docs/architecture/POSE_MATCHING.md`.

Build **Phase 7 only**: match a single pose from a photo, and fire the shutter automatically.

Scope:

1. **Target from a still** — pick a photo from the camera roll, run the pose model on it, store as a one-frame timeline. Also allow "use this frame" from an existing routine's video.
2. **Ghost** — the target as an outline silhouette plus skeleton at ~0.5 opacity, fitted to the user in subject space exactly as in Phase 3.
3. **Scoring** — same engine, no time alignment (single frame). Per-joint colours as usual.
4. **Auto-shutter** — a ring fills while `overall ≥ 0.8` and drains when it drops; at 600ms sustained it fires a 3-frame burst with a beep and a flash, so I know without looking at the screen. Manual shutter always available.
5. **Pick screen** — the 3 frames with their accuracy scores, keep one / keep all / retake. Save to the device.
6. **Half-body targets** — allow a target that only has upper-body landmarks; score only the segments present, and tell the user "upper body only" in the framing coach rather than demanding feet.

Out of scope: video recording, learn mode changes.

Acceptance: I can pick a photo of a pose, stand in front of my phone, and get a usable photo of myself in that pose without touching the screen.

When done: `npm run verify` output, phone instructions, `STATUS.md` update, commit.
