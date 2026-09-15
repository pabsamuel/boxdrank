# Prompt 04 — Phase 4: the scoring engine (red → green)

> Fresh Claude Code session, in `trendghost/`. This is the most important phase in the project.

---

Read `STATUS.md`, `CLAUDE.md`, and **all of** `docs/architecture/POSE_MATCHING.md`. Also `DECISIONS.md` D2, D4, D7.

Build **Phase 4**: `src/pose-core/` scoring, then wire it into the skeleton colours.

Part A — the engine (pure TypeScript, no DOM, no React):

1. `normalise.ts` — §1 exactly: hip-centre origin, torso-length scale, roll removal, low-confidence gating.
2. `features.ts` — §2: limb segment unit vectors (the table's 13 segments) plus the relative-offset features.
3. `score.ts` — §3 and §5: per-segment score with `tolFree`/`tolZero`, visibility → `unknown`, weighted overall, `unscored` when under 60% weight available.
4. `smooth.ts` — §7: landmark filter, score EMA, 2-frame colour hysteresis.
5. `align.ts` — §6: nearest reference frame by capture timestamp + latency constant, best match within ±120ms, reports a `timing` offset.
6. `src/config/scoring.config.ts` — **every** tunable number in one file: weights, tolerances, colour thresholds, sensitivity presets (chill/normal/strict), smoothing constants. Nothing numeric hardcoded elsewhere (`CLAUDE.md` rule 7).
7. No per-frame allocations — this runs 30×/second.

Part B — the fixtures. Implement all 7 test cases in `POSE_MATCHING.md` §9 as Vitest tests over landmark JSON in `fixtures/`. Generate synthetic fixtures where you can (identity, mirror, scale, translation, one-wrong-arm, occlusion, timing are all constructible from one base pose — do that rather than asking me to film things). **Case 5 (one wrong arm) is the product promise; if it doesn't pass, nothing else matters.**

Part C — wire it up: colour each segment of my skeleton red/amber/green/grey per §4, show live overall accuracy %, and add a `?debug=1` panel listing per-segment angle error and score so we can see *why* something is red.

Out of scope: cue text, framing coach, learn mode, recording.

When done: show the full test output, tell me how to try it on my phone, and ask me to report any pose where I disagree with the colour. Update `STATUS.md`, commit.

If something in `POSE_MATCHING.md` turns out to be wrong in practice, change the doc in the same commit and say so — the doc is the contract (`CLAUDE.md` rule 2).
