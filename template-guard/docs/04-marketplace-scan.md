# Marketplace duplicate check — gate item #1

**Run:** 20 Sep 2026, by Samet, in a browser.
**Verdict: CLEARS.** No app on the monday marketplace does board-structure
diffing or template-drift detection.

This is the check `monday-billable-hours/NEXT-GATE0.md` called the cheapest
possible kill, and that `KILL-CHECKS.md` had to mark UNKNOWN because the
marketplace was unreachable. No Claude session in this environment can reach
`monday.com` — the network egress policy blocks it. Samet ran it himself and
supplied screenshots; the numbers below are read off those.

## Searches

| Query | Results |
|---|---|
| `schema` | 1 — **Snowflake Integration** (Express Integrations, 147 installs), data sync to Snowflake. Irrelevant. |
| `template drift` | 1 — **Admin Pro** (ified Inc, 13 installs), "simplify account and team administration". Not structure auditing. |

## Nearest neighbours in the app grid

None of these compare board structure against a template. Listed closest-first.

| App | Vendor | Installs | Rating | What it actually does |
|---|---|---|---|---|
| **Workspace Doctor** | Tiberiu Jinga | 23 | — | *"Scan, score & fix your monday workspace in one click."* **The only genuinely adjacent listing. Not yet opened and read — do this before committing.** |
| Advanced Templates | APMD SOFT | 2K | 5.0 (10) | *Creates* reusable templates with dynamic dates and variables. Authoring, not auditing. |
| Super Admin | Boost Apps | 81 | — | Admin oversight with board creation control. Prevention, not drift detection. |
| Workspace Admin Toolkit | Satisfaction Drivers | 8 | — | Bulk board operations. |
| Tag Audit & Tag Analytics | Satisfaction Drivers | 5 | — | Audits tags, not columns. |
| Roobrick | Barefoot Australia | 951 | — | Assesses board *items* against criteria. Content, not schema. |
| Better Access Manager | Worktables | 721 | — | User risk scoring, access control. |

## The install-count finding — read this before celebrating

The scan cleared, but the same screenshots carry a harder signal. Installs by
category, from the visible grid:

| Category | Best performers |
|---|---|
| Reporting / export | **17.8K**, 8.9K, 4.4K |
| Backup | 2.1K, 1.3K |
| Time tracking | 8.9K (Tracket, Best Seller) |
| **Admin / audit / governance** | **951, 721, 81, 37, 23, 8, 5** |

The best app in Template Guard's own category has **951 installs.** Most are
under 100. A board-reports app has 17.8K.

Two readings, and they are not equally good:

1. **Nobody built it because nobody thought of it.** The gap is the opening.
2. **People built adjacent admin tools and they do not sell.** The gap is a
   graveyard.

Workspace Doctor at 23 installs is not proof of no demand — one unmarketed app
proves very little. But this is the first *measured* evidence in either
direction, and `monday-billable-hours/IDEAS.md` had already flagged the
weakness it speaks to:

> **Demand is INFERRED, not measured.** It comes from consultant blog posts and
> monday's own docs, not from vote counts or a single customer saying "I'd pay."
> That is the exact weakness that should have killed the last idea sooner.

**Consequence:** the 10 admin conversations that thread wanted are no longer
optional diligence. They are the only thing that distinguishes reading 1 from
reading 2, and the install counts tilt toward 2.

This does not reverse the clear. Gate item #1 is answered and the duplicate-
rejection risk is low. It moves the risk from "someone already built this" to
"the category may not pay," which is a different gate and a survivable one —
but it has to be answered before marketing spend, not after.

## Still open

- **Open the Workspace Doctor listing and read it.** 5 minutes. If it does
  schema scoring, this verdict narrows.
- Gate items #2 and #3 from `NEXT-GATE0.md` (defend the architecture to a
  reviewer; remediate a Burp finding) — untouched.
- 10 admin conversations about column drift — now load-bearing, per above.
- The product-shape decision, ADR-010.
