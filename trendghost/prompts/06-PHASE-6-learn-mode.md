# Prompt 06 — Phase 6: learn mode (step-by-step moves)

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md`, `CLAUDE.md`, `docs/product/PRODUCT_SPEC.md` (core loop step 3, feedback design) and `docs/architecture/POSE_MATCHING.md`.

Build **Phase 6 only**: break a routine into teachable moves and gate progress on the user actually hitting them.

Scope:

1. **Segmentation** — split the timeline into moves at *motion minima*: compute per-frame overall landmark velocity, smooth it, take local minima above a separation threshold as key poses; the span between two key poses is a move. Target 1–4s per move; merge shorter ones, split longer. Store the segmentation with the routine so it's computed once.
2. **Cue generation** — for each move, compare its start and end key poses, find the 1–2 limb segments that changed most, and emit a short natural cue from a phrase table: e.g. `upperArmL` up → "left arm up"; `thighR` + `crouch` → "step right, drop low". Cues are fixes, never complaints (`PRODUCT_SPEC.md`). Keep the table in one file so the wording is editable in one place.
3. **Gating** — the ghost plays the move at the chosen speed, then holds on the key pose and waits. Advance when the user's overall score stays ≥ threshold for ~500ms. A "skip this move" button after 10 seconds of struggling — never trap the user.
4. **Move list UI** — the moves down one side, current one highlighted, completed ones ticked, tap to jump.
5. **Voice cues** (Web Speech API, toggleable): speak the cue once when the move starts. Short. The user is looking at their body, not the screen.
6. **Chaining** — after the last move, offer "run it from the top at 0.5×".

Out of scope: recording, photo mode, library.

Acceptance: on a real 15s clip, segmentation produces moves that feel like moves (not arbitrary cuts), and the cues are things a human would say. Show me the generated move list and cues for a test routine and ask whether they read right before polishing anything else.

When done: `npm run verify` output, phone instructions, `STATUS.md` update, commit.
