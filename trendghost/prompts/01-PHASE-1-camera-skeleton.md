# Prompt 01 — Phase 1: camera + live skeleton

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md` and `CLAUDE.md` first, then `docs/architecture/TECH_STACK.md` and `docs/architecture/PERFORMANCE_BUDGET.md`.

Build **Phase 1 only**: prove that a phone browser can run on-device pose estimation over a live camera feed fast enough for this product.

Scope:

1. A single screen: full-bleed live camera (front camera, mirrored), with the pose skeleton drawn on top in plain white.
2. MediaPipe Tasks Vision `PoseLandmarker`, `lite` model, GPU delegate with CPU fallback, loaded once and reused. Model files served locally — no CDN dependency at runtime.
3. Inference decoupled from rendering: `requestAnimationFrame` always draws the latest available result and never waits for inference.
4. A debug HUD (visible with `?debug=1`): render fps, inference Hz, ms per stage (capture / inference / draw), and capture→draw latency.
5. Honest states: permission denied, no camera, model failed to load, no person detected. Each with a plain-English message, not a blank screen.
6. Camera frames carry a capture timestamp through to the result — we'll need it in Phase 4.

Out of scope, do not build: scoring, ghost, reference videos, storage, navigation, styling beyond what's needed to read the HUD.

Constraints:

- Dev server must be reachable from my phone over the LAN with HTTPS (getUserMedia needs a secure context). Tell me the exact command and URL to use, and how to trust the certificate on iOS/Android if that's needed.
- Follow the directory shape in `docs/architecture/TECH_STACK.md`.
- Code must pass `npm run verify`.

When done:

- Show me the real `npm run verify` output.
- Tell me exactly how to open it on my phone.
- Ask me for the HUD numbers from my phone, and record them in `docs/architecture/PERFORMANCE_BUDGET.md` under a "Measured" section once I give them.
- Update `STATUS.md` (phase row, verify evidence, next exact action) and commit.

If the numbers come back below the hard floors in the performance budget, **stop and tell me** — that's a re-plan, not something to code around.
