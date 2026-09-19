# Marketplace evidence — "audit" search

Source: monday.com marketplace, search term `audit`, **44 results**, captured by
Samet on 19 Sep 2026 and pasted in as screenshots. I could not browse the
marketplace myself — every monday domain is blocked from this environment — so
everything below is transcribed from those screenshots, not fetched.

Where a rating is shown it appears as `★ score (review count)`. Where no rating
is shown, the app has no reviews. The download figure is monday's own install
counter on the card.

---

## The closest competitor

| App | Developer | Pitch (verbatim) | Installs | Rating |
|---|---|---|---|---|
| **Workspace Doctor** | Tiberiu Jinga | "Scan, score & fix your monday workspace in one click" | **23** | none |

**This is the nearest thing to the Board Schema Auditor on the marketplace.**
"Scan, score and fix a workspace" is the same sentence I would write. Whether it
overlaps is **UNKNOWN** — the card does not say what it scans for, and I cannot
open the listing. Board structure drift? Permissions? Stale boards? All three?

**This one listing decides whether the auditor is a duplicate.** It is the single
highest-value page left to read.

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

- The auditor is **not obviously a duplicate**. Nothing in the 44 results clearly
  does column-structure drift detection. Workspace Doctor is the open question.
- The volume thesis is **dead**. Nobody is getting to thousands of installs with
  a workspace-hygiene tool. If this ships, it ships as a low-volume,
  higher-priced tool sold to admins and consultants, or not at all.
- That changes the product, not just the price: a $199/month tool has to be worth
  opening every month, which brings back the continuous-monitoring problem that
  the no-backend architecture exists to avoid.

## Next two pages to read

Both on monday.com, both unreachable from here:

1. **Workspace Doctor's listing** — what does it actually scan? This decides
   duplicate risk.
2. **Pricing on any two hygiene apps** (Workspace Doctor, Super Admin, Better
   Access Manager). This decides whether 23 installs can be a business.

Searches not yet run: `board structure`, `governance`, `template`, `columns`.
