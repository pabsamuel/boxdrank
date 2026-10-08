# 0006 — Perde lives in `boxdrank/perde` until extracted

**Status:** accepted (temporary)

## Context

The owner asked for a new repository. The GitHub App used by the automated session cannot create
repositories (403), and the existing `boxdrank` repository already hosts several unrelated
projects as subdirectories with path-filtered workflows.

## Decision

Build under `perde/` with its own lockfile, CI (`perde-ci.yml`) and deploy workflow
(`perde-deploy.yml`), all path-filtered. Provide `scripts/extract-to-own-repo.sh` that splits the
subtree with history into `pabsamuel/perde` once that empty repository exists.

## Consequences

- Nothing in Perde depends on the rest of `boxdrank`; the extraction is mechanical.
- Workflow files move from `.github/workflows/perde-*.yml` to `.github/workflows/*.yml` and drop
  the `perde/` path prefix and `working-directory`; the script prints the exact edits.
- Repository secrets/variables must be re-created on the new repository.
