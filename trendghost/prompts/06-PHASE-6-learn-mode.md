# Prompt 06 — Phase 6: the cue engine + learn mode

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md`, `CLAUDE.md`, **all of `docs/architecture/CUE_ENGINE.md`**, `docs/product/PRODUCT_SPEC.md` (core loop, feedback design) and `docs/architecture/POSE_MATCHING.md`.

Build **Phase 6 only**: break a routine into teachable moves, generate a cue track that tells the user what's coming *before* it happens, and gate Learn mode on them actually hitting each move.

This is the phase that turns the app from a mirror into a teacher. The cue engine matters more than the gating.

Scope:

1. **Segmentation** — split the timeline into moves at *motion minima*: compute per-frame overall landmark velocity, smooth it, take local minima above a separation threshold as key poses; the span between two key poses is a move. Target 1–4s per move; merge shorter ones, split longer. Store the segmentation with the routine so it's computed once.
2. **Move classification + cue generation** — per `CUE_ENGINE.md` "Where cues come from": for each move compare its start and end key pose, find the 1–2 limb segments that changed most and their direction, read the velocity shape to decide whether it's a `go`, a `hold` or a sharp **`hit`** ("cut it"), and phrase it from the table in `src/coach/phrases.ts`. Three words or fewer, imperative, user's-side-aware. The whole cue track is generated once at ingest and stored with the routine.
3. **Lookahead scheduling** — cues fire at `moveStart - leadTime` (default 450ms, divided by playback rate) against the `PlaybackClock`, so scrubbing and speed changes reschedule automatically. One cue on screen at a time, resolved by the priority order in the spec. All timings in `src/config/cues.config.ts`, nothing hardcoded elsewhere.
4. **Output channels** — big centre text for `go`/`hit`, a next-move ribbon for `prepare`, a countdown ring for `hold`, Web Speech voice (cut off the previous utterance, never queue), `navigator.vibrate` on `go`/`hit`, and a count-in ("5,6,7,8" if a beat grid exists, else "3,2,1"). Readable and feelable from 3 metres away.
5. **Per-mode verbosity** — wire the same engine into Practice (prepare/go/hit/hold + one correction per move) and Record (hit/go only, voice off, haptics on). Learn mode is the verbose one.
6. **Gating** — the ghost plays the move at the chosen speed, then holds on the key pose and waits. Advance when the user's overall score stays ≥ threshold for ~500ms. A "skip this move" button after 10 seconds of struggling — never trap the user.
7. **Move list UI** — the moves down one side, current one highlighted, completed ones ticked, tap to jump.
8. **Chaining** — after the last move, offer "run it from the top at 0.5×".

Optional if it's cheap: beat detection over the decoded audio, snapping `go`/`hit` cues to the nearest beat within ±120ms, falling back to raw motion timing when confidence is low. Don't block the phase on it.

Out of scope: recording, photo mode, library.

Acceptance — the bar from `CUE_ENGINE.md` "How we'll know it works": I should be able to get through a 15s trend I've never seen at 0.5×, **without watching the reference separately first**, because the cues told me what was coming. Before polishing anything, show me the generated move list and cue track for a test routine (with timings) and ask whether they read like something a human teacher would say.

When done: `npm run verify` output, phone instructions, `STATUS.md` update, commit.
