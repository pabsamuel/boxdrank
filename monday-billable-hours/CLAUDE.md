# CLAUDE.md — operating rules for this project

Read `README.md` at the start of every session before doing anything else.

## Current state

**Gate 0 FAILED on 16 Sep 2026. The billable-hours app is stopped** on the
evidence in `KILL-CHECKS.md`. Other monday work (the Board Schema Auditor in
`../monday-schema-auditor/`, Template Guard, new ideas) is not blocked by this.

## Scope

Each product's scope is set in its own docs. If Samet asks for something
outside it, say so; build it if he wants it now, otherwise add one line to
`BACKLOG.md`.

## Evidence discipline

- Label every claim: **FACT** (sourced) / **INFERENCE** (reasoned) /
  **ASSUMPTION** (unverified belief).
- Write **UNKNOWN** rather than guessing.
- **Never invent** install counts, review counts, star ratings, quotes, revenue
  figures or customer numbers. If a source is unreachable, say it is unreachable
  and say what Samet must check himself.
- Date every fact. monday changes.
- Never write monday API or manifest code from memory. Fetch live docs. If the
  environment blocks `developer.monday.com` (it did on 16 Sep 2026), stop and ask
  Samet to paste the relevant page rather than reconstructing it.

## Tone

Blunt. No hype, no motivational filler, no "great question," no softening a bad
result. If validation is failing, say it is failing in the first sentence.
"This is a bad opportunity, stop" is a welcome output and has already been the
correct one once.

Do not congratulate him for stopping either. Stopping cheaply is normal
competence, not an achievement.

## Standing constraints

- No company formation before Gate 4.
- $100 budget before first revenue.
- Gates are never renegotiated after seeing the result.
