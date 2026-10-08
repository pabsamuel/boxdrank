---
name: steward
description: How to look after an open Perde pull request — CI failures, review comments, merge conflicts — until it is green and merged. Used automatically by sessions that own a PR.
---

# /steward

Posture for PRs in this repository:

- **CI red is yours.** Reproduce locally (`pnpm verify`, `pnpm e2e`), fix, push. A failing test is
  never "flaky" here; the e2e suite runs against the real runtime and is deterministic.
- **Workflows are path-filtered.** Only `perde-ci.yml` and `perde-deploy.yml` run for `perde/**`;
  a red check from another project's workflow is not this PR's unless the PR touched that path.
- **Deploy skip is not a failure.** `perde-deploy.yml` warns and exits green when the Cloudflare
  secrets are missing; see `docs/DEPLOY.md` and `docs/SETUP_WITH_CHROME.md`.
- **Review comments:** implement nits and small asks and push; answer intent questions from the
  diff; larger asks get a proposal in the thread and a roadmap box.
- **Merge conflicts:** merge `main` into the branch (no rebase on shared branches), regenerate
  `pnpm-lock.yaml` with `pnpm install` if it conflicted, `pnpm verify`, push.
- **Done means:** CI green, no unresolved threads, `docs/PROGRESS.md` current, roadmap ticked.
  Mark the draft ready for review; the owner has authorised merging once green.
