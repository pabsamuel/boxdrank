# Prompt 05 — Phase 5: framing coach

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md`, `CLAUDE.md`, `docs/product/PRODUCT_SPEC.md` (framing coach screen) and `ASSUMPTIONS.md` A2–A3.

Build **Phase 5 only**: get the user correctly in frame *before* a run starts, so we never score someone who was never trackable (`RISKS.md` R3).

Checks, each pass/fail with its own plain-English fix, evaluated live:

1. **Whole body visible** — head through feet inside the frame, with margin. Fix: "step back" / "tilt the phone down".
2. **Distance** — torso length within a target band. Fix: "come closer" / "step back a bit".
3. **Camera height & tilt** — estimated from the vertical foreshortening of the body; extreme floor-up or ceiling-down angles are rejected. Fix: "prop your phone about waist height".
4. **Lighting** — mean luminance and landmark confidence. Fix: "turn on a light" / "you're backlit — face the window".
5. **One person** — if several are detected, pick the largest and say "tracking the person in the middle".
6. **Space** — a one-time safety card: "make sure you have about 2m of clear space" (`RISKS.md` R9).

UX rules:

- Show **one** instruction at a time — the most important failing check, never a list of errors.
- A body-shaped silhouette guide that turns green when all checks pass.
- All checks green for 1.5 continuous seconds → 3-2-1 countdown → hand off to the practice screen.
- A "skip, I know what I'm doing" escape hatch that remembers my choice.
- Optional: the T-pose calibration from `POSE_MATCHING.md` §8, including measuring the real end-to-end latency constant. If you build it, use the measured value in `align.ts` instead of the default.

Out of scope: learn mode, recording, photo mode.

When done: `npm run verify` output, phone instructions, `STATUS.md` update, commit. Tell me which check is most likely to annoy a real user, and what you'd loosen.
