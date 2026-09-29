---
name: ship
description: Verify, commit and open a pull request for the current Perde work — the only way changes leave a session.
---

# /ship

1. From `perde/`: `pnpm verify`. If the change touched `apps/web`, `apps/relay` or
   `packages/shared`, also `pnpm build && pnpm e2e` (in sandboxes:
   `PERDE_CHROMIUM_PATH=/opt/pw-browsers/chromium`). Fix, don't skip.
2. `pnpm validate:content` if content changed; `pnpm metrics` if any number moved; commit the
   regenerated `docs/PROGRESS.md` with the work.
3. Roadmap: tick what is done, add boxes for what you discovered. No dates.
4. Re-read the diff adversarially: unused code, a test that asserts nothing, a string not in
   `i18n.ts`, a play line over 14 words, a secret.
5. Commit with an imperative subject and a body that says why. Keep model names out of code,
   docs and PR text; commit trailers are whatever the tooling adds.
6. Push the branch and open a **draft PR** with: what a family can now do that they could not
   before, the metrics delta (from `docs/PROGRESS.md`), how it was verified (commands run,
   screenshots if visual). Then follow `/steward` until it is green and merged.
