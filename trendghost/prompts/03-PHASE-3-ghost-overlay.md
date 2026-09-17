# Prompt 03 — Phase 3: ghost overlay + playback clock

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md`, `CLAUDE.md`, and `docs/architecture/GHOST_OVERLAY.md` in full (plus `DECISIONS.md` D6, D8).

Build **Phase 3 only**: the ghost, correctly placed and correctly synced. No scoring yet.

Scope:

1. `src/playback/PlaybackClock.ts` — the single source of truth for time: `now()`, `play()`, `pause()`, `seek(t)`, `setRate(r)`, subscribe. Backed by the reference `<video>` element so audio can never drift from the ghost.
2. Render the layer stack from `GHOST_OVERLAY.md`: camera → ghost video (opacity slider 0.1–0.6) → ghost skeleton → HUD. User skeleton stays plain white for now.
3. **Subject-space fitting**: transform the ghost so it stands where I stand, at my size — the similarity transform from the ghost's hip/torso onto my smoothed hip/torso. Fall back to a centred placement when I'm not detected.
4. Transport UI: play/pause, scrub bar, speed 0.25/0.5/0.75/1×, ghost opacity, mirror toggle.
5. Mirror handling done exactly once, in `toSubjectSpace`, with the space of every code path commented (`CLAUDE.md` rule 8).
6. Reduced mode: a toggle that drops the ghost video layer and keeps only the ghost skeleton — verify the app is still usable.

Out of scope: scoring, colours, framing coach, recording.

Acceptance, and I will check these on my phone:

- Standing still with the ghost paused, the ghost skeleton sits roughly on top of my body, at my size, wherever I stand in frame.
- At 0.25× the ghost and its audio stay together, and the scrub bar matches.
- Flipping mirror mode flips both my preview and the ghost consistently — the ghost's raised arm is on the same side of the screen as mine.
- Render stays at/above the fps floor in `docs/architecture/PERFORMANCE_BUDGET.md` with all layers on; report the HUD numbers.

When done: `npm run verify` output, phone instructions, `STATUS.md` update, commit.
