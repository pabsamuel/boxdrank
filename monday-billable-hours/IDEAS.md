# monday.com app ideas — screened

> **Screening rule added 19 Sep 2026. Apply it before anything else.**
>
> ## Does it do work, or does it describe work?
>
> From the 44 marketplace results in `COMPETITORS.md`, split by that one question:
>
> | | Installs | Example price |
> |---|---|---|
> | **Tools that do work** | 714 – 17,800 | Tracket ~$49–60/mo for 10 users |
> | **Tools that describe work** | 5 – 170 (median 23) | Workspace Doctor $8/mo for 10 seats |
>
> Doing tools install roughly **400× more** and charge roughly **6×** as much.
> Ten describing apps from ten different developers land in the same tiny band,
> so this is a property of the category, not of any one team's marketing.
>
> **Describing** = audits, scores, health checks, dashboards about the account,
> hygiene reports, "insights". **Doing** = exports, documents, signatures,
> backups, forms, email, sync, time capture, inventory.
>
> An idea that describes work does not need further screening. It is capped at a
> few thousand dollars a year before a single other risk is considered, and two
> ideas have already died there:
>
> - **Billable-hours reporting** (16 Sep) — reporting on time, not capturing it.
> - **Board Schema Auditor** (19 Sep) — reporting on structure, not fixing it.
>
> Both were killed by the market, not by the code. The code was fine both times.
>
> **The second filter, applied only after the first passes:** the doing
> categories are the saturated ones. Board Reports Automations has 17.8K
> installs, SuperForm 11.2K, DocExport 10.5K, SuperMail 9.4K, Same Item Multiple
> Boards 9.5K, GetSign 8K, Tracket 8.9K. So passing filter one lands straight
> into monday's duplicate-rejection policy.
>
> **UNKNOWN, and worth saying out loud:** this rests on one search term. 44
> results out of 869 apps. The pattern is strong and consistent, but it is not
> the whole marketplace, and a different search could show a category that is
> neither dead nor saturated. Nobody has looked.


Researched 16 Sep 2026. Everything here came through web search; **monday.com,
the marketplace, the community forum and the idea board are all blocked from my
network**, so no vote counts, no install counts, no listing checks. Demand
evidence below is weaker than it should be, and I say so per candidate.

Labels: **FACT** = sourced · **INFERENCE** = reasoned · **ASSUMPTION** =
unverified · **UNKNOWN** = not known, not guessed.

---

## The constraint that shapes every answer

Before ideas, the shape. From `NEXT-GATE0.md`, every marketplace app must pass a
Burp scan on all its domains, encrypt tokens, document secret storage, and prove
controls over the monday access token. That is the hardest part of shipping for
someone who does not debug unfamiliar platforms fast.

**FACT (developer.monday.com):** monday supports **seamless authentication**.
Apps can host fully on monday servers with no API keys to store or manage. For
**board views, item views and widgets**, `monday.api()` acts on behalf of the
logged-in user with no explicit credentials initialised.

**INFERENCE — this is the single most useful finding of the day:**

A **client-side-only, read-only board view or widget** hosted on monday code has:
- almost no domain surface for the Burp scan,
- no stored secrets, so "how do you store secrets?" answers itself with *we don't*,
- no OAuth flow to get wrong,
- no server bill, which matters on a $100 budget.

**So the shape of the app matters more than the idea.** Any candidate that needs
a backend, a scheduler, webhooks or stored data is the wrong shape for Samet,
however good the concept. That rule screens out more than the duplicate policy
does.

---

## Screened out, with reasons

Recording these so they are not re-proposed in three weeks.

| Direction | Why it dies |
|---|---|
| Time tracking / billable hours | Gate 0 failed today. See `KILL-CHECKS.md`. |
| Workspace cleanup / hygiene | **FACT:** monday ships this natively — Cleanup mode with AI-flagged archive candidates, account-level Content tab filtered by last activity and ownership, scheduled cleaning policies, audit trail of archived and deleted boards. Duplicating platform functionality. |
| Recurring tasks | **FACT:** a "Recurring Tasks" app already exists (upscale.tech). The forum feature request has ~55 votes — thin demand and already served. |
| Backup / export / restore | **FACT:** Rewind, ProBackup and AvePoint are established here. Storage costs also break the $100 budget. |
| New board view types (gantt, kanban, calendar, map, workload, chart) | **FACT:** all native. |
| Critical path | **FACT:** native, auto-identified on the Gantt chart. |
| Notification digest / overload | Real, documented pain — but needs a backend and a scheduler. Wrong shape: maximum security surface, ongoing cost. |
| **AI agents (Agentalent.ai)** | **FACT:** launched ~Mar–Apr 2026 with **17 agents** — by far the best supply density in the ecosystem, 17 vs 869 apps. **And it is still wrong for Samet:** it is an enterprise hiring marketplace with contract management and qualification, meaning a sales motion he cannot run; autonomous agents need a backend and LLM inference, which breaks both the security-surface advantage and the budget. Noting it plainly because the density is genuinely tempting and chasing it would be a mistake. |

---

## Candidate 1 — Board Schema Auditor *(recommendation)*

**What:** a client-side app that reads the *structure* of boards in a workspace —
column names, column types, ordering — and reports where boards that should match
have drifted apart. "These 12 client boards came from one template; 4 are missing
the Owner column, 3 renamed Status to Stage, 1 made Budget a text column instead
of a number."

**The pain — FACT, from monday's own dashboard documentation and reviews:**
> monday.com doesn't enforce unified column types or naming conventions, so
> dashboards struggle to merge mismatched data across teams.

Dashboards silently produce wrong numbers when the columns underneath disagree.
The user sees a chart, not an error.

**Why the gap is real — FACT:** monday's answer to schema consistency is
**Managed templates with Data Validation**, and those are **Enterprise-only**.
Standard and Pro accounts — the overwhelming majority — have no tooling for this
at all. Native Cleanup mode addresses *stale assets*, not *schema drift*: entirely
different problem.

**Why it fits Samet, specifically:**
- **Read-only.** It never writes to a board. Smallest possible blast radius, and
  a much easier security conversation.
- **Client-side only**, seamless auth, no backend, no stored data, no secrets.
- **Plan-independent.** Board structure is readable on any tier — unlike the time
  data that killed the last idea.
- **Small.** Query boards → compare column sets → render a diff table. That is a
  realistic ≤20-hour build.
- **Buyer exists.** Admins and consultants — **FACT:** consultants sell workflow
  audits as a billable service, and "team members creating duplicate boards" is a
  named symptom in their own marketing.
- **Not a view duplicate.** It is a report about structure, not a way to look at
  items.

**Honest risks — read these before liking it:**
1. **Demand is INFERRED, not measured.** It comes from consultant blog posts and
   monday's own docs, not from vote counts or a single customer saying "I'd pay."
   That is the exact weakness that should have killed the last idea sooner.
2. **UNKNOWN whether an equivalent app exists.** Nothing surfaced in search, but
   I could not open the marketplace. Absence of evidence is not evidence of
   absence, and this is a duplicate-rejection platform.
3. **Weak retention — the serious commercial objection.** An audit is something
   you run once, fix, and stop paying for. Subscription revenue needs a reason to
   open it every month. Continuous drift detection with alerts is that reason —
   and alerts need a backend, which breaks the shape advantage. **This tension is
   unresolved and it is the most likely way this idea fails.**
4. **ASSUMPTION:** monday does not object to an app that reports on something its
   Enterprise tier enforces. Detecting drift and enforcing schema are different
   workflows, but that is my reading, not a policy quote. **UNKNOWN.**

## Candidate 2 — Connected-Boards Integrity Checker

**What:** finds broken Connect Boards links — cells pointing at boards that were
archived or deleted, so they silently show empty and stop updating.

**FACT:** this failure is documented — "if a connected board is archived or
deleted, those links will no longer be effective, and cells that once displayed
linked items may appear empty or no longer update," with the recommended fix
being manual periodic auditing.

**Verdict (16 Sep):** real, silent, and nobody notices until a report is wrong.
Same good shape as Candidate 1 — read-only, client-side. **But it is a feature,
not a product.** Too narrow to sell alone.

**Verdict (19 Sep): dead.** It fails the screening rule at the top of this file.
Finding broken links is describing work, in the same category that pays $2–8 a
month and reaches 23 installs. It would also have landed next to Workspace
Doctor, which already scans four categories and would plausibly add this as a
fifth. There is nothing to salvage and no reason to build it.

## Candidate 3 — Cross-board portfolio drill-down

**What:** portfolio → project → task drill-down across boards, which monday's
dashboards don't do.

**FACT:** "limited multi-level reporting (no drill-down from portfolio to task)."
**FACT:** dashboard connected-board caps are Free 1, **Standard 5**, Pro 20,
Enterprise 50, with a 20,000-item ceiling across connected boards.

**Verdict: do not build.** Rollup apps already exist, and an app that reads more
boards than the user's plan allows a dashboard to connect is functionally
paywall circumvention. **UNKNOWN** whether monday rejects that explicitly — the
policy text I found is about duplicating *apps*, not tiers — but it is the same
structural trap that killed the billable-hours idea. Not worth being the test
case.

---

## What I did not do

**I did not validate any of this with a human being.** Every candidate above rests
on documentation and third-party write-ups. Zero monday admins have said they
would pay for any of it.

That is exactly the gap that made the last idea look good for two weeks. A
screened idea is not a validated idea.

## Before any code

1. **`NEXT-GATE0.md` Q1 and Q2** still unanswered — can you remediate a Burp
   finding, and can you honestly clear the AI-code policy. Those gate every idea
   including this one.
2. **Confirm Candidate 1 is not already an app.** 20 minutes in the marketplace,
   which I cannot reach. Search: "audit", "board structure", "columns",
   "governance", "template".
3. **A real Gate 1.** Ten monday admins or consultants shown a one-paragraph
   description. The question is not "is this useful?" — everyone says yes to that.
   It is **"what do you currently do about column drift, and what would you pay to
   stop doing it?"** If the honest answer is "nothing, we live with it," the idea
   is dead and you saved 20 hours.

Retention risk #3 is the one to probe hardest. Ask whether they would want this
*monthly*, and why.

---

# Second screening round — 19 Sep 2026

Run at Samet's instruction: find a new monday idea and **be sure it has not been
built**. Everything below was researched through web search; monday.com is
unreachable from this environment, so no marketplace page was opened directly.
Existence checks lean on the marketplace screenshots in `COMPETITORS.md` and on
third-party write-ups.

Screening order: does it **do work**? Is it **unserved**? Is it **buildable by
one person on a $100 budget**?

## Candidate A — Forms that update existing items — **DEAD**

**FACT:** the most-requested feature in monday's history. Community thread
"Use Forms to edit/update existing items and columns" ran from January 2020 to
February 2026 — **6+ years, 162–165+ replies** — and is still open.

**FACT:** native WorkForms can only *create* items. The Enterprise-only "Edit
Form Responses" feature (Jan 2025) lets a person edit their own submission; it
does not update pre-existing items.

Perfect on demand. Perfect on "does work". **Already built:**

| App | Evidence |
|---|---|
| **SuperForm** (Spot-nik) | Marketplace card reads "Advanced Forms: **Update Items**, Subitems & Generate PDFs". **⭐5.0 (88 reviews), 11.2K installs, Best seller.** |
| Fillout | External builder with native monday integration |
| BoardBridge | Advanced conditional logic, CC/BCC groups |
| JotForm | 41 payment integrations, embeds anywhere |

Six years of unmet demand, met by a five-star best-seller. Dead.

## Candidate B — Writing to a Connect Boards column from a form — **DEAD**

**FACT:** native WorkForms cannot use Connect Boards, Mirror, Formula,
Auto-Number, Dependencies, Time Tracking, Board Relation or Button columns as
questions at all.

**FACT — a real gap in the category leader:** SuperForm "supports Connect Boards,
Mirror, and cross-board data in forms" but **cannot write to Connect Boards
columns via form submission** — it reads and filters with them only.

So "an intake form where the submitter picks an existing client and the new item
is linked to that client" is genuinely unserved.

**Dead anyway.** It is one field type. Against an 11.2K-install incumbent that
already does everything else, it is "a minor feature addition to an existing
app's concept" — the exact wording of monday's rejection criterion. It is a
feature SuperForm ships in a sprint the moment it matters.

## Candidate C — Multi-page forms and conditional logic — **DEAD**

**FACT:** multi-page forms with step-by-step navigation are not supported on any
monday plan in 2026. **FACT:** conditional logic is Enterprise-only, section
level, with no compound AND/OR rules.

Both real. Both already covered by SuperForm, BoardBridge and Fillout. Same
category, same incumbent, same verdict.

## Candidate D — Turkish e-Fatura / e-Arşiv bridge — **the only survivor, with a fatal unknown**

**Does it do work?** Yes. It produces legally valid invoices from board data.

**Is it served?** **No evidence of any monday.com e-Fatura app exists.** This is
the one gap found all day that an international competitor will not casually
close, because it needs Turkish regulatory knowledge and a GİB-accredited
integrator relationship. A moat, not a feature.

**Is it buildable solo?** Plausibly. GİB accreditation is not obtained directly —
you integrate an existing entegratör's API (EDM, Mysoft Btrans, NES, Süper
Entegratör are all established). That is ordinary API work.

**The fatal unknown: is anyone in Türkiye using monday.com?**

- **FACT:** Turkish is one of ~15 supported interface languages, and monday runs
  Turkish-language marketing pages.
- **UNKNOWN:** the number of Turkish monday accounts. Searching found no user
  figures, no Turkish monday partners or resellers, and no Turkish case studies.

The addressable market is "Turkish companies that use monday.com **and** invoice
through it". That could be a few hundred companies or close to zero, and nothing
found today distinguishes those two.

**This is not a recommendation to build.** It is the only candidate that got past
the first two filters, and it dies on a market-size question that costs Samet
about twenty minutes and cannot be answered from here.

## Candidate E — AI agents / MCP surface — **not for this developer**

**FACT:** monday relaunched in 2026 as an AI work platform: native agents, an
Agent Builder for developers, an MCP Block for workflows, human-in-the-loop
approval blocks. **FACT:** Agentalent.ai launched ~Mar 2026 with 17 agents.

Least crowded surface in the ecosystem by an order of magnitude. Also needs a
backend, LLM inference costs, and an enterprise sales motion. It breaks the $100
budget on day one and the security-surface argument along with it.

## What the two rounds together say

**FACT:** 850+ live apps, 1.6M installs, ~250,000 customers.

Every candidate that does real work is already held by an app with thousands of
installs and a five-star rating. Every category that is empty is empty because it
does not pay. That pattern has now held across two independent screening rounds
and four product ideas.

**INFERENCE (high confidence):** the remaining gaps in this marketplace are
either too small to matter or defended by incumbents who can close them in a
sprint. The exception is a regulatory or regional moat, which is the only barrier
a well-funded competitor will not step over — and the only such candidate found
has an unmeasured market.

This is a statement about the marketplace, not about the ideas or the code.
