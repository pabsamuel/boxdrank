# Prompt 09 — Phase 9: library, onboarding, polish, ship prep

> Fresh Claude Code session, in `trendghost/`.

---

Read `STATUS.md`, `CLAUDE.md`, `docs/product/PRODUCT_SPEC.md` (screens), `RISKS.md` and `OWNER_ACTIONS.md`.

Build **Phase 9**: make it something a stranger can use.

Scope:

1. **Library** — routine cards (thumbnail, duration, best accuracy, last practised), add/delete/rename, storage usage, and an empty state that explains the whole flow in three lines.
2. **Onboarding** — three screens: what it does, the camera-permission pre-screen (explain *before* the OS prompt, per `CLAUDE.md` rule 4), and the space/safety card. Then straight into adding a first routine.
3. **Settings** — mirror mode, sensitivity (chill/normal/strict), voice cues, reduced mode, colour-blind palette, reduce motion, and "delete all my data" that actually clears IndexedDB and OPFS.
4. **PWA** — manifest, icons, splash, offline shell, installable. Works with no network after first load (`ASSUMPTIONS.md` A7).
5. **Error and edge states everywhere** — permission denied, storage full, model load failure, unsupported browser. Plain English, with a way forward.
6. **Privacy** — a short in-app privacy page stating plainly: pose runs on your device, nothing is uploaded, videos stay on your phone. Mark in `OWNER_ACTIONS.md` that the real policy needs human review before any store submission.
7. **A verification pass against the hard rules**: grep the codebase and confirm there is no network call on the camera/practice path, no landmark data in any analytics/logging, and no third-party video fetching anywhere. Report what you found.

Then write `DEPLOY.md` for this project: how to build, where to host (HTTPS required for camera), and what `OWNER_ACTIONS.md` items are still open.

When done: `npm run verify` output, a link/instructions to install it on my phone, `STATUS.md` marked Phase 9 complete with evidence, commit.
