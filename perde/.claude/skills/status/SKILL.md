---
name: status
description: Progress report for Perde — roadmap completion, content and test counts, next three items. Use at the start of a session or when asked "where are we".
---

# /status

1. Run `pnpm metrics` from `perde/` (regenerates `docs/PROGRESS.md`). If `apps/web/dist` is
   missing, run `pnpm build` first so the bundle size is real.
2. Read `docs/PROGRESS.md` and `docs/ROADMAP.md`.
3. Report, in this order and nothing else:
   - one line: roadmap `done/total (%)` and the current milestone
   - the per-milestone bar table
   - the next three unticked items, each with the files it will touch
   - anything red: failing `pnpm verify`, e2e, lint, or a metric below its target in
     `docs/METRICS.md` (kid-friendly lines < 100 %, bundle > 200 kB gz)
4. If asked "what next", pick the first unticked item of the current milestone and start it as a
   whole slice (code + tests + docs + roadmap tick + metrics). Do not ask for approval.
5. Commit `docs/PROGRESS.md` together with the work, never alone.
