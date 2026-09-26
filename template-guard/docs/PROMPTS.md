# Prompts — copy, paste, send

You said you're not sure how to drive this. You don't need to be. Each phase
below is one message. Paste it exactly, send nothing else, wait for the commit,
then paste the next one. Every prompt starts with the same line so I reload the
rules each time.

**The only decision that's actually yours is the one in Phase 0.** Everything
after it is mechanical.

---

## Phase 0 — the decision (answer this first, in your own words)

There is no prompt for this one. Read the Recommendation section of
`template-guard/docs/00-api-findings.md` and reply with one of:

- `Go with B plus flagged A.` ← what I recommend
- `Strict B only — no preview code at all.`
- `Strict A — I accept the preview-schema risk.`

And if you have a monday dev account or API token to test against, say so. If you
don't, say that too — it changes what I can verify and I'll plan around it.

---

## Phase 1 — Skeleton

```
Read template-guard/CLAUDE.md and docs/01-roadmap.md. Build Phase 1 only.

monday app manifest, OAuth flow, and a board view that renders inside monday and
lists the boards the user can reach. TypeScript, React, monday-sdk-js,
monday-ui-react-core. Pin API-Version 2026-07 in exactly one module.

Do not build the diff engine, repair, or any billing UI. Commit and push when it
builds clean, then tell me exactly what I need to do in the monday developer
console to see it running.
```

## Phase 2 — Snapshot

```
Read template-guard/CLAUDE.md. Build Phase 2 only.

Snapshot a board's full stable-API configuration: board, columns (typed settings,
not deprecated settings_str), groups, views, permissions, owners. One batched
query. Paginate users. Never fetch items. Emit a versioned BoardSnapshot type
with a schema version field.

Every read failure must surface as a visible degraded state, never a silently
short snapshot. Commit and push.
```

## Phase 3 — Diff engine

```
Read template-guard/CLAUDE.md. Build Phase 3 only.

Pure function diff(template, copy) -> Finding[]. No network, no SDK, no monday
import — it must be testable in isolation. Severities exactly: missing, miswired,
altered, cosmetic. Every finding carries what, why it matters, and how to fix.

Duplicated boards get new column IDs, so match by position + title + type
heuristics. That heuristic is the hard part — write the tests first.

Required fixture cases, all four: missing automation, mis-wired cross-board
reference, renamed column, changed column type. Add fixtures for the ambiguous
matches you find while writing it.

Commit and push with tests green, and tell me which heuristic you're least sure
about.
```

## Phase 4 — Repair

```
Read template-guard/CLAUDE.md. Build Phase 4 only.

Split findings into auto-repairable and manual. Auto: a mutation, always previewed
before it runs, always logged. Manual: a checklist item with a deep link into the
exact monday settings panel.

Per docs/00-api-findings.md, connect-board repair may need a manual board
connection first — if so it's manual, and say so in the UI rather than offering a
fix that fails. Never write to a board the user didn't explicitly select.

Commit and push.
```

## Phase 5 — Drift monitoring

```
Read template-guard/CLAUDE.md. Build Phase 5 only.

Scheduled re-snapshot of linked boards, compare against the stored template
snapshot, notify on divergence. Paid tier. Be aggressive about rate limits and
backoff — this is the feature most likely to get the app throttled. No billing
UI. Commit and push.
```

## Phase 6 — README

```
Read template-guard/CLAUDE.md. Write the README: local dev setup, the monday app
manifest, required scopes, and submission notes for marketplace review.

Include the data statement in plain language: we store board and column IDs and
configuration, never customer item data. Commit and push.
```

---

## Prompts for when things go sideways

**I don't understand what you built:**
```
Explain what you just built in template-guard/ as if I've never seen the code.
What does it do, what can't it do yet, and what's the riskiest part?
```

**Check the work before moving on:**
```
Review template-guard/ against docs/01-roadmap.md and CLAUDE.md. What's
incomplete, what's unverified, and what did you get wrong? Be blunt — don't
reassure me.
```

**Verify the API guesses once you have an account:**
```
I have a monday API token now. Re-verify every ✱ claim in
docs/00-api-findings.md against a live board, update the doc with what's actually
true, and tell me if anything changes the path decision.
```

**Something regressed:**
```
Tests in template-guard/ are failing. Diagnose the root cause before changing
anything, tell me what broke and why, then fix it.
```

---

## How to work with me on this, briefly

- **One phase per message.** Bigger asks get vaguer results.
- **"Read CLAUDE.md first"** is worth including every time. It reloads the rules.
- **When I say something is unverified, believe me.** The ✱ marks in the findings
  doc are real uncertainty, not hedging.
- **Ask me to be blunt when reviewing.** I default to agreeable; the review prompt
  above deliberately fights that.
