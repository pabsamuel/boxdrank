# Template Guard is Board Schema Auditor

**Written:** 2026-09-17, after the two threads were found to be the same product.
**Status:** unresolved conflict. Read this before writing any more code here.

## What happened

Two sessions worked the same idea on the same repo on the same day and neither
knew about the other.

| | |
|---|---|
| `monday-billable-hours/` (branch `claude/monday-billable-hours-app-nv00q4`, PR #17) | Screened the idea, recommended it as **Candidate 1 — Board Schema Auditor**, set a gate, built nothing. |
| `template-guard/` (branch `claude/template-guard-monday-app-bm0xxv`, PR #18) | Built it. 76 tests, snapshot + diff + repair + UI + OAuth server. Never saw the gate. |

They are not adjacent ideas. From `monday-billable-hours/IDEAS.md`:

> a client-side app that reads the *structure* of boards in a workspace — column
> names, column types, ordering — and reports where boards that should match have
> drifted apart. "These 12 client boards came from one template; 4 are missing
> the Owner column, 3 renamed Status to Stage, 1 made Budget a text column
> instead of a number."

"Renamed Status to Stage" and "Budget a text column instead of a number" are,
near-verbatim, two of the four required test cases in `test/diff.test.ts`.

## The conflict that matters

The other thread did not just name the idea. It specified a **shape**, and gave
reasons. Template Guard violates three of them.

### 1. It was specified read-only. Template Guard writes.

> **Read-only.** It never writes to a board. Smallest possible blast radius, and
> a much easier security conversation.

Template Guard requests `boards:write` and ships three mutations
(`create_column`, `create_group`, `change_column_title`) in `src/repair/execute.ts`.

This is the most consequential difference. The read-only constraint was not
squeamishness — it was the thing that made the marketplace security review
tractable for a solo builder who says of himself *"I do NOT debug unfamiliar
platforms fast."* Every write mutation is surface area in a Burp scan and a
question on the review board.

**Note what this costs and what it buys.** The repair layer is genuinely useful,
and its most valuable finding — a mis-wired connect column — is *already* a
manual checklist item, by a separate line of reasoning recorded in ADR-006. So
the writes buy: create a missing column, create a missing group, rename a column
back. Three conveniences. They cost the read-only claim entirely.

### 2. It was specified client-side with no backend. Template Guard has a server.

> **Client-side only**, seamless auth, no backend, no stored data, no secrets.

Template Guard has an Express server, an OAuth flow, encrypted token storage at
rest, and a stored snapshot per template. That is a backend, credentials, and
stored data — three things the spec ruled out by name.

The reason is drift monitoring: a scheduled re-check cannot run in a browser tab.
Which is exactly the tension the other thread had already identified and
deliberately left open, rather than resolving it by building the backend:

> **Weak retention — the serious commercial objection.** An audit is something
> you run once, fix, and stop paying for. Subscription revenue needs a reason to
> open it every month. Continuous drift detection with alerts is that reason —
> and alerts need a backend, which breaks the shape advantage. **This tension is
> unresolved and it is the most likely way this idea fails.**

Template Guard picked a side without knowing there was a debate. It may be the
right side — recurring revenue needs recurring value — but it was chosen by
default, not on purpose, and it forfeits the security-review advantage that made
the idea fit this builder in the first place.

### 3. The connect-board feature was ranked as a second screen, not the headline.

The other thread's **Candidate 2 — Connected-Boards Integrity Checker** covers
broken connect links, and judged:

> real, silent, and nobody notices until a report is wrong. Same good shape as
> Candidate 1 — read-only, client-side. **But it is a feature, not a product.**
> Too narrow to sell alone. Most likely value is as the second screen inside
> Candidate 1, *after* Candidate 1 proves demand.

Template Guard makes mis-wiring detection the centre of the product and the
listing. That is arguably a real disagreement rather than an oversight — a
mis-wired column silently corrupting the wrong client's board is more severe than
a dead link showing empty — but it is a disagreement, and it should be settled on
purpose.

## What the other thread supplies that this one lacked

Not all of it is conflict. The market reasoning is work this thread never did:

- **FACT (their research):** monday's own answer to schema consistency is
  *Managed templates with Data Validation*, and it is **Enterprise-only**.
  Standard and Pro — most accounts — have no tooling for this. That is the gap
  Template Guard sells into, and it is a much better positioning line than
  anything in the current README.
- **FACT (their research):** consultants already sell workflow audits as a
  billable service, and "team members creating duplicate boards" appears in their
  own marketing. That is a named buyer.
- **Board structure is readable on every plan**, unlike the time-tracking data
  that killed their previous idea. Template Guard has no plan-tier trap.
- **Demand is INFERRED, not measured** — from consultant blog posts and monday's
  docs, not from one person saying "I'd pay." Their words: *"the exact weakness
  that should have killed the last idea sooner."*

## Outstanding gate items — neither thread has cleared these

From `monday-billable-hours/NEXT-GATE0.md`, all still open:

1. **Does an equivalent app already exist?** ~20 minutes in the marketplace.
   Their risk #2 says **UNKNOWN** — nothing surfaced in search, but they could
   not open a single marketplace listing page. This thread couldn't either.
   monday rejects duplicates. **This is the cheapest possible kill and it has not
   been run.**
2. **Can the builder explain this architecture, unprompted, to a reviewer?**
   monday rejects apps "built primarily with AI-generated vibe code." Template
   Guard is ~16k lines written by Claude in one session. The policy question is
   not about provenance, it is about whether the builder can defend the code.
3. **Can the builder personally remediate a Burp scan finding?** Every write
   mutation and the OAuth server enlarge this. Under the read-only client-side
   shape, the answer mattered much less.

Both sessions hit the same wall on #1: **the network egress policy blocks
`monday.com` and `developer.monday.com`.** No Claude session on this setup can
run that check. It has to be a human with a browser.

## The decision to make

Not "is the code good" — it passes 76 tests and builds clean. The question is
which product this is:

| | Read-only auditor | Auditor + repair + monitoring (what exists) |
|---|---|---|
| Security review | Easy. No writes, no backend, no secrets. | Three mutations, OAuth server, stored tokens. |
| Build already done | Diff engine + UI ship as-is; drop `repair/execute.ts`, `server/`, `drift/`. | Everything ships. |
| Retention | Weak — run once, fix, churn. | Real — scheduled drift is a reason to keep paying. |
| Fits the builder's stated constraints | Yes, by design. | Only if he can defend the server at review. |

The diff engine — the hard, valuable part — is identical either way. It is pure,
has no network dependency, and does not care which shell it ships in. Nothing
built today is wasted by choosing the narrower shape; the repair and server
layers just sit unbuilt-upon until the gate clears.

**Recommendation:** run gate item #1 first, because it can kill everything for
20 minutes of browser time. If it clears, ship the **read-only** shape to
marketplace review — smallest security conversation, fastest approval — and hold
`repair/` and `drift/` for a second release once the app is live and the review
relationship exists. That sequences the hard security conversation *after* the
product is approved rather than during its first submission.

## Cross-references

- Idea screening, market research, gate: `monday-billable-hours/IDEAS.md`,
  `NEXT-GATE0.md`, `KILL-CHECKS.md`, `DECISIONS.md`, `VERIFY.md` (branch
  `claude/monday-billable-hours-app-nv00q4`, PR #17)
- Implementation: this directory (branch
  `claude/template-guard-monday-app-bm0xxv`, PR #18)
- API findings, both threads blocked from developer.monday.com:
  `docs/00-api-findings.md`
