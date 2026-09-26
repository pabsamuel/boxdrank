# Recipes — small prompts for everyday jobs

Copy, fill in the blanks, paste.

## A bug, described as a symptom

> In `trendghost/`, read `STATUS.md` and the relevant docs first. Symptom: **[what you see, on which screen, on which phone]**. Expected: **[what should happen]**. Don't guess a fix — first add temporary logging or use the `?debug=1` panel to find the actual cause, tell me what it is, then fix it. Add a test that would have caught it.

## The colours feel wrong

> Read `docs/architecture/POSE_MATCHING.md`. When I do **[pose]**, my **[limb]** shows **[colour]** but it clearly matches / clearly doesn't. Show me the per-segment angle error and score for that frame from the debug panel, explain which number caused it, and propose a change to `src/config/scoring.config.ts` only — don't scatter new constants through the code.

## The ghost is misaligned

> Read `docs/architecture/GHOST_OVERLAY.md` (subject-space fitting). Symptom: **[e.g. the ghost is too big / sits above my head / lags my movement]**. Tell me whether this is a fitting problem, a clock problem, or a latency problem before changing anything.

## Make it faster

> Read `docs/architecture/PERFORMANCE_BUDGET.md`. Here are my HUD numbers from a real phone: **[paste]**. Find the top two costs, propose fixes ranked by effort, implement only the first one, and re-measure. Don't refactor anything unrelated.

## Before you trust a phase

> Show me the actual output of `npm run verify`. Then list what you changed, what you verified by running it, and what you have *not* verified. Be honest about the last part.

## The session has gone in circles

> Stop. Don't write any more code. Summarise in `STATUS.md`: what works, what's broken, what you tried, what you'd try next. Commit that. I'll start a fresh session.

## Undo something

> Show me `git log --oneline -10` and `git status`. I want to undo **[what]**. Tell me the exact command and what it will throw away before you run anything.

## Adding a feature that isn't in the plan

> I want **[feature]**. Before coding: does this belong in v1 per `docs/product/PRODUCT_SPEC.md`'s non-goals? If it doesn't, add it to `docs/product/ROADMAP.md` under "Later" and tell me why it can wait. If it does, tell me which phase it belongs in and what it breaks.

## Weekly check

> Read `STATUS.md`, `DECISIONS.md` and `RISKS.md`. Are any assumptions in `ASSUMPTIONS.md` now testable or falsified? Is any risk closer than it was? Update the docs and tell me the single most valuable next thing to build.
