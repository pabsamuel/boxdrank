# Prompt — Phase 4: the monday app

Paste into a fresh Claude Code session in this repo.

---

Read `CLAUDE.md`. Phases 1 and 3 must be done.

Build the monday.com app surface so the audit runs inside monday instead of a
terminal.

- App type: a **dashboard widget** plus an **account-settings view**. Not a board
  view — this is an account-level tool and belongs where admins already are.
- React with monday's SDK and the Vibe / `monday-ui-react-core` components, so it
  looks native rather than bolted on.
- Screens: run-an-audit (with progress, because a full read is slow), the
  findings report, and a per-user drill-down showing that user's effective access
  with the *reason* for each grant — the reason is what makes it actionable.
- Free-tier gating: one audit, findings visible, subject lists truncated with a
  clear upgrade path. Never fake the numbers to force an upgrade; truncate the
  list, keep the total honest.
- Export findings to CSV. Admins live in spreadsheets.

Constraints:

- The audit engine is finished. **Import it.** Do not reimplement any rule in the
  UI layer.
- The web app can add build dependencies; the engine in `src/` stays dependency-
  free so it remains usable from the CLI.
- Handle the slow case properly: an account with 2,000 boards must show progress
  and stay responsive, never a frozen spinner.
- Empty state matters. A clean account should read as reassuring, not broken.

Done when: installable in a monday dev account, an audit runs end to end from
inside monday, and the free/paid boundary works.
