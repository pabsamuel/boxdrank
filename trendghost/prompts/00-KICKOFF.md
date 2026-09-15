# Prompt 00 — Kickoff

> Paste this into a fresh Claude Code session started in the `trendghost/` directory.

---

You are working in `trendghost/`, a project that helps people copy viral dance videos and photo poses by overlaying a "ghost" of the original on their live camera and colouring their body red→amber→green depending on how well they match.

Before doing anything:

1. Read `STATUS.md`, `CLAUDE.md`, `docs/product/PRODUCT_SPEC.md`, `docs/product/ROADMAP.md`, `docs/architecture/TECH_STACK.md`, `docs/architecture/POSE_MATCHING.md`, `docs/architecture/GHOST_OVERLAY.md`, `docs/architecture/PERFORMANCE_BUDGET.md`, `DECISIONS.md`, `ASSUMPTIONS.md` and `RISKS.md`.
2. Tell me, in under 200 words: what this product is, what the first phase is, and the single biggest technical risk.
3. Then **critique the plan**. Be blunt. Specifically:
   - Is the web-first PWA choice (D1) actually right, or will camera/recording limits on iOS Safari bite us so hard we should start with Expo instead?
   - Is angle-based scoring (D4) going to feel fair to a real user, or is something missing?
   - Is there anything in the spec that will not work on a phone at 24fps?
   Give me at most 5 points, each with a recommendation I can say yes/no to. Don't hedge.
4. Wait for my answers. Do not write application code yet.

After I answer, and only then:

5. Record my answers in `DECISIONS.md` (as new decisions) or `ASSUMPTIONS.md` (if we're guessing).
6. Set up the minimum project skeleton per `docs/architecture/TECH_STACK.md`: Vite + React + TypeScript strict, ESLint + Prettier, Vitest, and an `npm run verify` script that runs format check + typecheck + tests. Add `.gitignore`, `.env.example` (even if empty), and one trivial passing test so `verify` is meaningful.
7. Run `npm run verify` and show me the real output.
8. Update `STATUS.md`: mark Phase 0 complete with the verify evidence, and set "Next exact action" to Phase 1.
9. Commit with a clear message. Do not start Phase 1 in this session.
