# Gate 0 — Kill Checks

Run: 16 Sep 2026 (deadline was 10 Sep 2026 — **run 6 days late**)
Run by: Claude, at Samet's request
Gate 0 rule: *all three kill-checks answered, none fatal. Fail → stop.*

## VERDICT: **FAIL. Stop the monday billable-hours app.**

Two of three kill-checks come back fatal. A fourth problem — not on the original
list — is worse than any of them: **the product as specified cannot serve the
market it was designed for.** See "The contradiction" below.

---

## Research limitation — read this before trusting anything here

**FACT:** This session's network egress policy blocks `monday.com`,
`support.monday.com`, `developer.monday.com`, `apps.avisi.com`,
`apps-for-monday.com`, `till-freitag.com`, `g2.com`, `capterra.com` and every
other review site I tried. Only GitHub and package registries are reachable
directly.

**Consequence:** I could not open a single marketplace listing page. Every
star rating and review count below is **UNKNOWN**. I have not invented any.
Prices come from third-party write-ups and vendor marketing copy reached through
web search, not from the marketplace listings themselves.

**What this does NOT weaken:** the platform-policy findings (#2, #3) and the
contradiction. Those do not depend on install counts.

**What you must confirm yourself:** see `VERIFY.md`. It is 45 minutes of your
own browser time. Do it before you accept this verdict as final.

---

## Kill-check #2 — Is the wedge already taken? (the one you asked for)

### The apps

Ratings and review counts are UNKNOWN for all of them — I could not reach the
marketplace. Do not quote these numbers to anyone until you've checked.

| App | Vendor | Runs inside monday? | Price (unverified) | Rating | Reviews |
|---|---|---|---|---|---|
| Tracket | Avisi Apps | Yes, native marketplace app | ~$60/mo up to 10 users (monthly), ~$49/mo annual; tiered by account size | UNKNOWN | UNKNOWN |
| 7pace Timetracker | Appfire | Yes, native marketplace app | UNKNOWN | UNKNOWN | UNKNOWN |
| TimeBits | UNKNOWN | Yes, native marketplace app | from $15/mo (≤5 users) up to $2,000 unlimited; 14-day trial | UNKNOWN | UNKNOWN |
| Subitems Timetracking | UNKNOWN | Yes, native marketplace app | UNKNOWN | UNKNOWN | UNKNOWN |
| Time Tracking and Timesheets | UNKNOWN | Yes (listing 10001007) | UNKNOWN | no reviews yet | 0 |
| Everhour | Everhour | Integration + embedded timers | Lite ~$6/user/mo; Team $8.50–10/user/mo; free ≤5 users | UNKNOWN | UNKNOWN |
| TMetric | TMetric | Integration | UNKNOWN | UNKNOWN | UNKNOWN |
| Harvest | Harvest | Integration | ~$9/seat/mo annual + usage fees | UNKNOWN | UNKNOWN |
| Clockify | CAKE.com | Integration | free ≤5 users; billable rates + report export are paid | UNKNOWN | UNKNOWN |
| Toggl Track | Toggl | Integration / API | UNKNOWN | UNKNOWN | UNKNOWN |
| Timely | Memory AS | Integration | UNKNOWN | UNKNOWN | UNKNOWN |

This list is **not proven complete.** I could not browse the marketplace's time-
tracking category. There are likely more.

### Does one already do rollup + rates + billable split + invoice export?

**Yes. Tracket does all four.** From Avisi's own product pages, reached via
search:

- **FACT (vendor copy):** "separates billable from non-billable time
  automatically and generates accurate invoices"
- **FACT (vendor copy):** "drill down by project, client, team member, or custom
  field, and export in the formats they need"
- **FACT (vendor copy):** logs time on **items and subitems**
- **FACT (vendor copy):** timesheet approval workflow — submit, approve, reject,
  request changes
- **FACT (vendor copy):** API that connects to billing software and can send
  invoices to customers

That is your entire feature list — rollup, per-client rates, billable/non-billable
split, invoice-ready export — plus a timer, plus approvals, plus an API, from a
vendor that also ships Atlassian apps and has been in this market for years.

7pace Timetracker (Appfire — a large, well-funded marketplace-app company) covers
items + subitems, timesheets, and "robust project reporting for budget management,
status updates, billing."

**INFERENCE (high confidence):** Your five features are the commodity baseline of
this category, not a wedge. There is no feature in your spec that Tracket does not
already advertise.

### The rollup feature is native and free-ish

**FACT:** monday's subitem Time Tracking column has a built-in
**"Show Summary on Parent Item"** setting. Subitem-to-parent time rollup is a
checkbox in monday, not a product.

Your headline feature — "roll subitems into parent totals" — already ships in the
platform.

### Kill-check #2 result: **FATAL.** The wedge is taken.

---

## Kill-check #3 — Will monday reject an AI-assisted build?

**FACT (developer.monday.com, via search, policy dated ~June 2026):**
> New apps built primarily using no-code platforms or AI-generated "vibe code"
> are **not eligible** for marketplace approval.

**FACT (developer.monday.com, via search):**
> Submissions that do not demonstrate clear, unique value ... or significantly
> replicate the functionality of existing marketplace apps may be declined.
> The app review team will no longer accept submissions that duplicate existing
> ecosystem functionality or integrations.

**FACT (developer.monday.com, via search):**
> Making slight UI tweaks, minor feature additions, or superficial changes to an
> existing app's concept will not be considered "new value" — your app must
> introduce a substantially unique solution or serve an entirely different
> workflow.

Read those three together. A billable-hours reporting app, built AI-assisted,
that reproduces Tracket's feature list, hits **every single** stated rejection
criterion at once.

**Kill-check #3 result: FATAL for this specific app.** Not necessarily fatal for
you as a monday developer forever — the policy targets apps that are *primarily*
no-code/AI-generated and that duplicate. A genuinely novel app you understand
deeply is a different submission. This one is not that.

---

## Kill-check #1 — Can monday Vibe let customers build this themselves?

**FACT (via search):** monday Vibe is monday's in-platform AI app builder.
Describe the app, refine by chat, publish.

**FACT (via search, vendor/press):** Vibe crossed $1M ARR in ~10 weeks;
17,000+ apps built in its first two months. Building and testing is free;
published apps bill on dedicated tiers.

**FACT (via search):** the listed example outputs explicitly include
**"time trackers"** alongside dashboards, approval systems and org charts.

**INFERENCE (medium-high confidence):** A monday admin who wants per-client
billable totals from board data is now one prompt away from a passable internal
version. Not as good as Tracket. Very possibly good enough to not pay $39/month.

**Kill-check #1 result: NOT FATAL ON ITS OWN, but it compresses the ceiling.**
The simpler the app, the more Vibe eats it. Yours is simple by design.

---

## The contradiction — the thing that actually ends this

This was not on your kill-check list. It is derivable from facts **you already
wrote down in your own brief**, and it needs no web access to verify.

1. You stated: the Time Tracking column is **Pro/Enterprise only**. Confirmed —
   Standard has neither the Time Tracking column nor the Formula column.
2. Your product is **reporting, not capture**: "Read existing time data." You
   ruled out building a timer, correctly, because it triples scope.
3. Your stated target is **Standard accounts** — "Works for Standard accounts
   with no native time tracking." That is the 4.5x-cheaper-than-Pro pitch.

**On a Standard account there is no time data to read.** No Time Tracking column
means nothing was ever logged. Your reporting app would open to an empty screen.

So you have exactly two doors:

- **Door A — target Pro/Enterprise** (where time data exists). Your customers
  already pay for the tier. You are now a pure reporting layer competing directly
  with Tracket and 7pace on their turf, with fewer features. Marketplace
  duplicate-rejection applies.
- **Door B — target Standard** (your actual pitch). You must capture the time
  yourself. That is a timer. You ruled it out, and it is also a duplicate.

There is no Door C. The wedge as written is internally inconsistent, and it was
inconsistent before any competitor existed.

**This is the strongest finding in this document** because it does not rest on
blocked sources or vendor marketing. It rests on two facts you supplied yourself.

---

## What a real wedge would have to look like

Not a recommendation to proceed. Stated only so the stop is informed, and so you
know what "different" would actually mean:

- It must work on data Standard accounts **already have** (Numbers columns,
  Status durations, item update timestamps) — not on a Pro-only column.
- It must be something Tracket and 7pace do **not** advertise, not a cheaper
  version of what they do.
- It must be something Vibe cannot produce from one prompt.
- You must be able to debug it, because monday will ask how it was built.

I have no evidence any such wedge exists in this category. Finding one is
another Gate 0, not a continuation of this one.

---

## Sources

All reached via web search; the underlying pages were unreachable from this
session, so these are the search-result attributions, not pages I read in full.

- https://developer.monday.com/apps/docs/submit-your-app
- https://developer.monday.com/apps/docs/app-listing-guidelines
- https://developer.monday.com/apps/docs/marketplace-app-ratings-and-reviews
- https://support.monday.com/hc/en-us/articles/360001143809-The-Time-Tracking-Column
- https://support.monday.com/hc/en-us/articles/360001235445-The-Formula-Column
- https://apps.avisi.com/apps/tracket
- https://apps.avisi.com/campaign/tracket-planning-and-billing
- https://docs.apps.avisi.com/en/tracket/latest/pricing
- https://appfire.com/products/7pace-for-monday
- https://monday.com/marketplace/listing/10000550/timebits
- https://everhour.com/blog/monday-time-tracking/
- https://rize.io/blog/best-time-tracking-for-monday
- https://till-freitag.com/en/blog/monday-time-tracking-guide
- https://till-freitag.com/en/blog/monday-vibe-apps-en
- https://apps-for-monday.com/apps/10000017/
