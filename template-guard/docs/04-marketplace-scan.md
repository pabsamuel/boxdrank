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
| **Workspace Doctor** | Tiberiu Jinga | 23 | — | *"Scan, score & fix your monday workspace in one click."* **Opened and read 20 Sep — see `docs/07-workspace-doctor.md`.** Account-wide hygiene: stale boards, status-label drift across boards, dead assignees, adoption. No template concept, so no missing column, no type change, no mis-wiring. The clear holds and narrows. |
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

- ~~Open the Workspace Doctor listing and read it.~~ **Done 20 Sep.** It does
  account-wide *hygiene*, not template fidelity — the clear holds but the
  "nothing adjacent exists" line does not. Full read, and the two things the
  listing gave us that are worth more than the verdict:
  `docs/07-workspace-doctor.md`.
- **`monday code` as the deployment target (ADR-018)** — new, and now the
  highest-value unknown in the project. Workspace Doctor runs its scheduled
  backend on monday's own infrastructure, which is the third answer to the
  ADR-010 dilemma nobody in either thread had considered.
- Gate items #2 and #3 from `NEXT-GATE0.md` (defend the architecture to a
  reviewer; remediate a Burp finding) — untouched.
- 10 admin conversations about column drift — load-bearing, and more so after
  Workspace Doctor: 23 installs in three months for a polished app in this
  exact space.
- The product-shape decision, ADR-010.

## Second measured data point on demand

Workspace Doctor launched **Jun 2026** and has **23 installs, no ratings**.
Four scan categories, AI embeddings, health score, scheduled checks, email
summaries, CSV export, good artwork — and it is tagged into *Reporting &
analytics*, the category where the 17.8K apps live, so it is not hiding.

Roughly eight installs a month. One app's marketing is not a market, but this
points the same way as the category ceiling above, and two measured points
beat a hunch. The counter-reading worth holding: every Workspace Doctor finding
is hygiene, and nobody's client work breaks because a label reads "Done!"
instead of "Done". Template Guard's headline finding is a board that has been
writing to the wrong client for three weeks. Those may sell very differently —
which is a hypothesis, and ten conversations settle it.
