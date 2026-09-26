# Prompt 08 — Phase 8: record mode + take review

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md`, `CLAUDE.md`, `docs/product/PRODUCT_SPEC.md` (core loop steps 5–6) and `docs/architecture/PERFORMANCE_BUDGET.md` (recording is the heaviest mode).

Build **Phase 8 only**.

Scope:

1. **Record** — capture my camera (with audio) for the duration of a run via `MediaRecorder`. The ghost fades to ~0.1 during recording and the HUD is minimal; the recording contains **me**, not the overlay (offer an "include ghost" toggle, default off).
2. **Score track** — store the raw per-frame overall score and per-segment scores alongside the take, time-aligned to the clock.
3. **Performance** — while recording, drop inference to ~15Hz and keep render at 60 per the budget. Report the measured numbers.
4. **Take review** — play the take back with an accuracy-over-time graph underneath; automatically mark the 2–3 worst dips; tap a dip to scrub both my take and the ghost to that moment, side by side, with the per-segment scores for that frame.
5. **Storage** — takes in OPFS, metadata in IndexedDB, with the size shown and a delete action. Export/save to camera roll. Nothing uploads anywhere (`CLAUDE.md` rule 4).
6. **iOS reality check** — verify `MediaRecorder` behaviour on iOS Safari early in the phase. If output quality or codec support is unusable, **tell me before building the rest of the phase**; don't paper over it. That's the D1 revisit trigger.

Out of scope: filters, trimming beyond start/end, sharing to social platforms.

When done: `npm run verify` output, phone instructions, `STATUS.md` update, commit. Tell me honestly how the recorded video quality compares to the phone's native camera app.
