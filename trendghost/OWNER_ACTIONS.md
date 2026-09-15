# OWNER_ACTIONS

Things only the human owner can do or decide. AI sessions should add to this list instead of guessing.

## Blocking nothing right now

Phase 1 can start immediately.

## Decide before Phase 2

- [ ] **Product name.** "TrendGhost" is a placeholder. Check it's not taken on the stores before any branding work.
- [ ] **Two or three reference videos to test against.** Ideally: one easy (arms-only, standing), one hard (full-body, fast, turning), one photo pose. Put them in `fixtures/` locally — do **not** commit third-party video to the repo.

## Decide before Phase 9 (shipping)

- [ ] **Distribution**: PWA on a URL, or native app stores? (See `DECISIONS.md` D1.)
- [ ] **Privacy policy** — required by both stores the moment the camera is used. Draft exists nowhere yet; needs a human review.
- [ ] **Hosting** — if anything server-side appears (routine sharing, analytics), pick a provider and add env vars to `.env.example`.
- [ ] **Do you want accounts at all?** v1 assumes no. Accounts bring age-gating and privacy obligations (`RISKS.md` R10).

## Never delegate to AI

- Anything that downloads or rehosts third-party video (we don't do it — see `RISKS.md` R1).
- Signing keys, store credentials, published privacy policies.
