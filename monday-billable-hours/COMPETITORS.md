# Marketplace evidence — "audit" search

Source: monday.com marketplace, search term `audit`, **44 results**, captured by
Samet on 19 Sep 2026 and pasted in as screenshots. I could not browse the
marketplace myself — every monday domain is blocked from this environment — so
everything below is transcribed from those screenshots, not fetched.

Where a rating is shown it appears as `★ score (review count)`. Where no rating
is shown, the app has no reviews. The download figure is monday's own install
counter on the card.

---

## Workspace Doctor — the listing, read 19 Sep 2026

| App | Developer | Installs | Rating | Price |
|---|---|---|---|---|
| **Workspace Doctor** | Tiberiu Jinga (leano-app.com) | 23 | none | **$2/mo ≤3 seats, $4/mo ≤5, $8/mo ≤10, billed yearly. Free tier.** |

Pitch: *"Scan, score & fix your monday workspace in one click."* Built for
"admins, ops leads, and workspace owners on large or fast-growing accounts."

**What it scans — FACT, verbatim from the listing:**

1. **Board Health** — boards not updated past a staleness threshold, boards left
   empty past a grace period.
2. **Status Consistency — "the headline feature"** — three-layer detection of
   **label drift across boards**: fuzzy matching for typos (`Done`/`done!`), a
   dictionary for synonyms (`Completed`/`Resolved`), and AI embeddings for domain
   terms (`Wrapped Up`). Same-column exclusion prevents false positives.
3. **User Hygiene** — items still assigned to deactivated users.
4. **Adoption** — workspaces with very low recent activity.

Also ships: a 0–100% health score across the four categories, a prioritized
findings list, one-click fixes (archive a stale board, jump to affected items),
tunable thresholds, a score-history chart over 30/90/365 days, **weekly scheduled
checks with email summaries**, and CSV export.

Runs on **monday code**, AES-256 at rest, **four minimal OAuth scopes**, only
anonymous status labels reach its AI layer, everything deleted on uninstall.

### Is the Board Schema Auditor a duplicate of this?

**Strictly: no.** Workspace Doctor detects *label* drift — the values inside
status columns. The auditor detects *column structure* drift — names, types,
presence. Nothing in the listing covers a column being `numbers` on one board and
`text` on another, or missing entirely.

**Practically: yes, and it would probably be declined.** monday's policy declines
submissions that "significantly replicate the functionality of an existing
marketplace app" and says "slight UI tweaks, minor feature additions, or
superficial changes to an existing app's concept will not be considered new
value". Set the two side by side:

| | Workspace Doctor | Board Schema Auditor |
|---|---|---|
| Pitch | Scan, score & fix your workspace | Scan boards for template drift |
| Buyer | Admins, ops leads, large accounts | Admins, consultants |
| Output | Prioritized findings + CSV | Prioritized findings + CSV |
| Detects | Label drift, stale boards, dead users, dead workspaces | Column structure drift |
| Retention | Weekly scheduled checks + email | None |

One row differs. To a reviewer that reads as a fifth category for an app that
already has four — a minor feature addition to an existing concept, which is the
exact wording of the rejection criterion.

**And the convergence is already happening.** The next feature planned for the
auditor was comparing status-column labels. That *is* their headline feature,
done better, with fuzzy matching, a synonym dictionary and embeddings.

### The pricing kills the remaining hope

`COMPETITORS.md` previously recorded an open counter-argument: install count is
not revenue, and 23 installs at $199/month would be ~$55k/year and a real
business. **That is now closed.** The actual price of the category leader is
**$2–8/month with a free tier**.

23 installs, most of them free, at a $8/month ceiling is on the order of
**$1–2k/year gross** — before monday's cut, before any support time. That is the
best-performing product in this category.

This holds regardless of what a monday reviewer decides. Even a clean approval
and a total win over Workspace Doctor lands on a few thousand dollars a year.

## Adjacent, probably not duplicates

| App | Developer | Pitch (verbatim) | Installs | Rating |
|---|---|---|---|---|
| Super Admin | Boost Apps | "Enhance admin oversight with board creation control" | 81 | none |
| Admin Pro | Ified Inc | "Simplify account and team administration" | 13 | none |
| Workspace Admin Toolkit | Satisfaction Drivers | "Bulk board operations made simple" | 8 | none |
| Tag Audit & Tag Analytics | Satisfaction Drivers | "Tag visibility and cleanup across all boards" | 5 | none |
| Activity Pulse | Proof Engineering | "View activity across workspaces in one interactive dashboard" | 37 | none |
| SOP & Compliance Checklists | EmbedIn | "Item checklists with sign-off, audit trail & SLA" | 10 | none |
| Lucie Audit | Eurotas | "Audit Management System" | 26 | none |
| AuditSentry SIEM | UserSentry | "Real-time security dashboards for your monday.com workspace" | 42 | none |
| UserSentry | UserSentry | "Smart user management. Stronger account security." | 170 | none |
| Better Access Manager | Worktables | "Score user risk. Track risk events. Control access." | 721 | none |
| Roobrick | Barefoot Australia Pty Ltd | "Assess board items against criteria or guidelines" | 951 | none |
| Advanced Templates | APMD SOFT | "Create reusable templates with dynamic dates and variables" | 2K | ★5 (10) |

`Advanced Templates` is the creation side of the same problem — it makes reusable
templates. It does not tell you when boards made from one have drifted.

## The pattern that matters more than any single competitor

From the same 44 results, split by what the app does:

**Workspace hygiene / admin / audit tools:**
5, 8, 10, 13, 23, 26, 37, 42, 81, 170 installs. **Median 23.**

**Workflow / reporting / infrastructure tools in the same search:**

| App | Installs | Rating |
|---|---|---|
| Board Reports Automations (Fantasy Media) | 17.8K | ★4.9 (33) |
| Time Tracking – Tracket (Avisi) | 8.9K | ★4.7 (43) |
| Inventory (Spot-nik) | 4.4K | none |
| PageProof | 3.6K | ★4.9 (13) |
| Rewind Backups | 2.1K | none |
| Advanced Templates | 2K | ★5 (10) |
| ProBackup | 1.3K | ★4.5 (20) |
| NetSuite Integration (KPMG Israel) | 998 | none |
| Better Access Manager | 721 | none |

**INFERENCE (high confidence):** in this marketplace, tools that *do work* install
in the thousands. Tools that *tell you about your workspace* install in the tens.
That is a two-to-three order of magnitude gap, and it is consistent across ten
hygiene apps from ten different developers. It is not one team failing to market.

**This is the retention objection from `IDEAS.md`, now with numbers.** An audit is
run once, acted on, and cancelled. The install counts are what that looks like
from the outside.

### The honest counter-argument

**UNKNOWN: revenue.** Install count is not revenue. Admin and governance tools
sell to fewer, larger accounts at higher prices. 23 installs at $199/month is
~$55k/year, which would be a real business for one person in Sakarya. 23 installs
at $19/month is $5k/year, which is not.

**Nothing in the screenshots shows price.** Until the pricing on two or three of
these hygiene apps is known, "the category is dead" is not a supported claim —
only "the category does not sell on volume" is.

## What this changes

**Stop the Board Schema Auditor.** Three independent reasons, any one of which
would be enough:

1. **Volume is dead.** Median 23 installs across ten hygiene apps from ten
   developers, against 721–17.8K for tools that do work.
2. **Price is dead.** $2–8/month with a free tier is what the category leader
   charges. The "low volume, high price" escape route does not exist.
3. **Duplicate risk is high**, and the auditor's natural next feature is
   Workspace Doctor's headline feature.

Reasons 1 and 2 do not depend on any reviewer's judgement, so the stop does not
hinge on guessing what monday would decide.

## What Workspace Doctor is worth copying

Not the product — the **shape**. It is a working example of what clears monday's
review, and it answers questions `NEXT-GATE0.md` left open:

- Hosted on **monday code**, so there is no third-party domain for the Burp scan.
- **Four minimal OAuth scopes**, stated publicly as a selling point.
- AES-256 at rest, deletion on uninstall, and an explicit statement that only
  anonymised data reaches its AI layer — all of it written into the listing copy.
- A free tier with seat-banded paid plans is how apps are priced here.
- It solved the retention problem the auditor could not: **weekly scheduled
  checks with email summaries**. That needs a backend. The no-backend
  architecture was the right call for a security review and the wrong call for a
  subscription.

Searches not run, and no longer worth running for this product: `board
structure`, `governance`, `template`, `columns`.

---

## monday already emails about *some* deactivations — 23 Sep 2026

Found while looking for outreach leads, which is the only reason it was found at
all. It is the closest thing to a competitor this product has, and it is monday
itself.

**INDIRECT, not read directly.** `support.monday.com` sits behind Cloudflare and
returned 403 to every fetch from here. What follows is from a search engine's
summary of two support articles, "Why is my automation deactivated?" and "Why is
my integration deactivated?", plus a community thread titled "Did you know about
our deactivated automations email?". **This needs confirming in a browser before
any decision rests on it**, and it is written down as unconfirmed rather than
quietly treated as true.

What the summary says:

- monday sends a **deactivated automations email** in some cases
- *"You will **not** receive a notification that informs you of this change when
  certain automations are deactivated"*
- *"Some deactivation scenarios do not send a notification. In those cases,
  check the board's Automations page for inactive automation errors."*
- Common causes of deactivation: revoked gmail/outlook tokens, a deleted column,
  permission changes, deleted boards/groups/subitems, item limits, rate limits

### Why this is not the Gate 0 moment

The billable-hours product died because a competitor advertised the whole feature
set. This is not that, and the difference is the entire premise of the watchdog:

**monday tells you when an automation has been switched off. It never tells you
when an automation is still switched on and quietly not firing.**

Cadence detection covers both. A deactivated automation stops firing and shows up
as silent; so does one that is still green, still enabled, and has not run in
three weeks because its trigger condition stopped being met. The second case has
no monday feature at all, and it is the one nobody notices — the person with 200+
workflows in VALIDATION.md built their own workaround rather than rely on the
email, which is itself evidence the email does not cover them.

### What it does change

The pitch cannot be "monday doesn't tell you when automations break", because
partly it does. It has to be the narrower and truer one: **"switched on is not
the same as working."**

### Owed

1. Open both support articles in a browser and read them directly. 403 here.
2. Establish whether the deactivated-automations email is on by default, who
   receives it, and whether it can be turned off.
3. Decide whether detecting *deactivated* status is worth adding, or whether
   cadence alone is the cleaner product. Adding it would overlap monday's own
   feature; leaving it out keeps the wedge sharp.
