# monday.com billable-hours reporting — Atesen Software

**STATUS: STOPPED AT GATE 0 — 16 Sep 2026.**
Read `KILL-CHECKS.md` for the evidence. Read `DECISIONS.md` for the decision.
Do not start building. Do not start outreach.

Owner: Samet, Sakarya, Türkiye. Solo. ~24–36 build hours/month across 3 usable
days a week. $100 budget before first revenue.

---

## Gate table

Gates are binding and dated. They are **never renegotiated after seeing the
result.** That rule is the whole point of having them.

| Gate | Due | Test | Status |
|---|---|---|---|
| **0** | 10 Sep 2026 | All three kill-checks answered, none fatal. Fail → stop. | **FAILED** — run 16 Sep, 6 days late. 2 of 3 fatal, plus a fatal contradiction. |
| 1 | 17 Sep 2026 | 30 outreach messages sent. ≥5 say they'd pay $39 AND ≥2 take a call, or 1 prepays. 3–4 → 20 more contacts. ≤2 → stop. | **MOOT** — 0 messages sent. Gate 0 failed. Do not run this gate. |
| 2 | 8 Oct 2026 | Working end-to-end in a real monday account, ≤20 build hours. | MOOT |
| 3 | 29 Oct 2026 | Submitted to marketplace, ≤30 cumulative build hours. | MOOT |
| 4 | 15 Dec 2026 | ≥1 paying customer. Fail → stop the marketplace thesis. | MOOT |

### Why Gate 0 failed, in four lines

1. **Tracket already ships the entire feature list** — billable/non-billable
   split, rates, per-client drill-down, invoice export, subitems, approvals.
2. **monday's policy rejects both halves of this app** — apps that "significantly
   replicate" existing marketplace apps, and apps "built primarily using no-code
   platforms or AI-generated vibe code."
3. **Subitem→parent time rollup is a native monday checkbox**, not a product.
4. **The pitch contradicts itself.** Standard-tier accounts have no Time Tracking
   column, so there is no time data for a reporting-only app to read. Reporting
   needs Pro; Pro users already have competitors. There is no third door.

Point 4 needs no external source. It follows from two facts in the original
brief.

---

## Hour ledger

Count hours, not days. Log every session. Tell Samet when he reaches 25 of the
30-hour Gate 3 budget.

| Date | Session | Hours | Cumulative | Notes |
|---|---|---|---|---|
| 16 Sep 2026 | Gate 0 kill-checks + project docs | _pending — Samet to fill_ | — | Research + docs. No code written. |

**Build hours spent: 0 of 30.** The single best outcome available today was
spending zero of them. That happened.

---

## What exists in this folder

| File | What it's for |
|---|---|
| `README.md` | This. Gate table, hour ledger, current status. Read every session. |
| `KILL-CHECKS.md` | Gate 0 evidence and verdict. The competitive picture. |
| `VERIFY.md` | 45 min of manual checks **Samet must run himself** — I was network-blocked from monday.com. |
| `PLATFORM.md` | monday platform facts and UNKNOWNs. Reusable if a future idea touches monday. |
| `DECISIONS.md` | Decision log. Append-only. |
| `BACKLOG.md` | Parked ideas. One line each, no evaluation. |
| `CLAUDE.md` | Operating rules for Claude on this project. |

**Deliberately absent:** `VALIDATION.md` (outreach targets + message text) and
`PRD.md`. Both are Gate 1+ artifacts. Gate 0 failed, so writing them would be
later-phase work. The brief says to refuse later-phase work every time, not once.
This is that refusal. They get written if and only if a future Gate 0 passes.

---

## How to run a session

1. Read this README first. Every session.
2. Check the gate table. If the current gate is failed or moot, the only valid
   work is: re-verify the failure, or close the project out.
3. New idea mid-session → one line in `BACKLOG.md`, then back to the task. No
   evaluation, no "that's promising."
4. Scope is a ceiling, never a floor. Feature six goes to the backlog even when
   it is easy.
5. Never write monday API or manifest code from memory. Fetch live docs.
   (Note: this session's egress policy blocks `developer.monday.com` entirely.
   Any future build session needs an environment that can reach it, or Samet
   pastes the docs in.)
6. Label every claim **FACT** / **INFERENCE** / **ASSUMPTION**. Write **UNKNOWN**
   rather than guessing. Never invent install counts, review counts, quotes or
   revenue figures.
7. End of session: ask for hours, log them in the ledger above.

## Standing rules

- No company formation before Gate 4.
- $100 budget holds until first revenue.
- Finishing is the constraint, not ideas. There are ~45 unstarted ideas and zero
  shipped products. Adding a 46th idea is not progress.
