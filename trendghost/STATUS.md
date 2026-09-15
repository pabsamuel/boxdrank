# STATUS — TrendGhost

> Living document. A new session should be able to resume from this file alone.
> Update it at the end of every working session.

## Current phase

**Phase 0 — Scaffold & specs.** Docs and build prompts exist. No application code yet.

## Next exact action

Open `prompts/01-PHASE-1-camera-skeleton.md`, paste it into Claude Code, and let it build the camera + live skeleton spike. Nothing else should be built until a skeleton is drawing on top of a live camera feed at a measured frame rate.

## Phase log

| Phase | Scope | Status | Verified |
| --- | --- | --- | --- |
| 0 | Specs, architecture docs, build prompts, decisions/risks | ✅ | docs only — no commands to run |
| 1 | Camera feed + on-device pose model + live skeleton overlay + measured fps | ⬜ | — |
| 2 | Reference ingest: share sheet / camera roll → pose timeline JSON → save locally | ⬜ | — |
| 3 | Ghost overlay: reference video/skeleton drawn over camera, synced to a playback clock | ⬜ | — |
| 4 | Scoring engine: normalise, limb angles, per-joint score, red→amber→green | ⬜ | — |
| 5 | Framing coach: full-body-in-frame, distance and camera-angle guidance before start | ⬜ | — |
| 6 | Cue engine (lookahead "now" / "cut it" calls) + learn mode gating | ⬜ | — |
| 7 | Photo mode: single target pose, auto-shutter on sustained match | ⬜ | — |
| 8 | Record mode + post-take timeline of where sync was lost | ⬜ | — |
| 9 | Library, onboarding, permissions UX, polish, store/deploy prep | ⬜ | — |

## Test status

No test suite yet. Created in Phase 1 alongside the first code.

## Open questions for the owner

Tracked in `OWNER_ACTIONS.md`. Nothing is blocking Phase 1.

## Session notes

- _(append newest at the top: date — what changed — what was verified)_
- 2026-09-15 — Added `docs/product/CONTENT_SOURCING.md` (three import lanes: share sheet, camera roll, our own template pack — and why there is never a URL downloader) and `docs/architecture/CUE_ENGINE.md` (lookahead cues: "arms up next" → "now" → "cut it" → "hold", ~450ms ahead of the move, voice + text + haptics). Decisions D9/D10 recorded; product spec, roadmap, owner actions and prompts 02/06 updated to match. Docs only.
- 2026-09-15 — Phase 0: project scaffolded (README, CLAUDE.md, product spec, pose-matching spec, ghost-overlay spec, tech stack, performance budget, roadmap, prompts 00–09). Docs only, nothing executable yet.
