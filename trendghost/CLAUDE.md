# CLAUDE.md — TrendGhost operating rules

Rules for any AI session working in `trendghost/`. Keep them short, keep them true.

1. **Read `STATUS.md` first.** Resume from "Next exact action". Update it at the end of every session: what changed, what was verified with which command, what's next. A new session must be able to continue from that file alone.
2. **Specs are the contract.** `docs/product/PRODUCT_SPEC.md` defines behaviour; `docs/architecture/*` defines how. If you need to deviate, write the reason into `DECISIONS.md` (or an ADR) in the same commit — don't silently diverge.
3. **Verify before claiming.** `npm run verify` (format + typecheck + tests) must pass before any phase is marked done, and the command output goes in `STATUS.md`. "Should work" is not done.
4. **Camera and body data are sensitive.** Hard rules, never break:
   - Pose estimation runs **on-device**. Camera frames never leave the device — no frame upload, no "just for debugging" endpoint.
   - Recorded takes stay local unless the user explicitly exports/shares them.
   - No analytics event ever contains landmark coordinates, frames, or thumbnails.
   - Ask for camera permission *at the moment of first use*, with an in-app explanation screen before the OS prompt.
5. **Never fetch or scrape third-party video.** No TikTok/Instagram/YouTube downloaders, no undocumented endpoints, no yt-dlp. Reference videos come from the user's own file picker / camera roll. If a task seems to require downloading someone's video, stop and flag it in `OWNER_ACTIONS.md`.
6. **Performance is a feature, not a polish step.** Target ≥24fps pose inference on a mid-range phone. Any change to the camera → inference → render path must be measured (see `docs/architecture/PERFORMANCE_BUDGET.md`) and the numbers recorded. Never block the render thread with inference.
7. **The feedback must be explainable.** Every colour the user sees traces to one number from `docs/architecture/POSE_MATCHING.md`. No magic "vibes" scoring, no hidden fudge factors. Thresholds live in one config file, not scattered in components.
8. **Mirroring is a first-class bug source.** Selfie camera is mirrored, reference video is not, landmark "left" is the subject's left. Every new pose code path states which space it's in (`raw`, `mirrored`, `subject-space`) in a comment. There is one conversion helper; use it.
9. **Boring tech wins.** Prefer stable, well-documented libraries. A new dependency needs a one-line justification in the PR body. Feature-flag anything half-built.
10. **Small, honest commits.** One phase = one branch = one PR. Don't mark a checklist item done in `STATUS.md` in the same breath as writing the code — run it first.
11. **No secrets in the repo.** Every env var documented in `.env.example`.
12. **When the spec is ambiguous, ask once, then write the answer down** in `ASSUMPTIONS.md` and keep going. Don't stall the build on a question the owner can answer later.
