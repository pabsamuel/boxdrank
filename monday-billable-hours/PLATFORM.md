# monday.com platform constraints

Everything here is dated. monday changes; re-verify anything you rely on.
Nothing in this file was read from monday.com directly — **this session's egress
policy blocked every monday domain** — so it is all second-hand via web search
until Samet confirms it. Confirmed items get marked `[CONFIRMED by Samet, date]`.

Labels: **FACT** = sourced. **INFERENCE** = reasoned from facts. **ASSUMPTION** =
unverified belief. **UNKNOWN** = not known, and not guessed.

---

## Plans and column availability — *verified 16 Sep 2026, second-hand*

- **FACT:** Time Tracking column — **Pro and Enterprise only.** Not on Standard.
- **FACT:** Formula column — **Pro and Enterprise only.** Not on Standard.
- **FACT:** These are the two exceptions; most other columns are on Standard.
- **FACT:** Standard ≈ $12/seat/mo, Pro ≈ $19/seat/mo (list, monthly).
- **INFERENCE:** A Standard account has **no logged time data at all.** Any app
  that reads time on Standard reads nothing. Any app that wants time on Standard
  must capture it.

**This inference is what killed the billable-hours app.** Keep it visible.

## Native time-tracking behaviour — *16 Sep 2026*

- **FACT:** Subitem Time Tracking columns have a **"Show Summary on Parent Item"**
  setting. Subitem→parent rollup is native.
- **FACT:** The Time Tracking column is not automatically summed across items;
  group totals come from the Formula column (also Pro+).
- **ASSUMPTION** (from the original brief, unverified): native tracking is one
  timer per item, no multi-user tracking on one item, no budgets, no hourly
  rates.
- **ASSUMPTION** (from the original brief, unverified): the Formula column cannot
  read Time Tracking data directly; the documented workaround is a mirror column.
- **UNKNOWN:** whether either assumption still holds in Sep 2026.

## Marketplace policy — *16 Sep 2026, policy text dated ~June 2026*

- **FACT:** Apps "built primarily using no-code platforms or AI-generated
  'vibe code'" are **not eligible** for marketplace approval.
- **FACT:** Submissions that "significantly replicate the functionality of
  existing marketplace apps" may be declined.
- **FACT:** "The app review team will no longer accept submissions that duplicate
  existing ecosystem functionality or integrations."
- **FACT:** "Slight UI tweaks, minor feature additions, or superficial changes to
  an existing app's concept will not be considered 'new value.'"
- **UNKNOWN:** whether any exception, disclosure or appeal process exists.
- **UNKNOWN:** how monday detects AI-generated code, or whether it is enforced at
  review-conversation level rather than technically.

**Practical read (INFERENCE):** monday will likely ask how the app was built and
expect the developer to explain their own architecture. "I can't debug unfamiliar
platforms fast" and "AI wrote most of it" are a bad combination in that
conversation. This constrains *how* to build here, permanently.

## Marketplace submission bar — *16 Sep 2026, via search*

Applies to **every** app, regardless of idea. This is the real gate.

- **FACT:** All domains must pass a **provided Burp scan**; findings disclosed
  during review and must be fixed before approval.
- **FACT:** **Tokens must be encrypted**; supporting evidence required on how
  secrets are stored and whether any live in the code repository.
- **FACT:** Must elaborate on security controls protecting the monday user
  access token.
- **FACT:** **TLS 1.2+**; **HSTS with min-age ≥ 1 year**.
- **FACT:** Must align with the **Vibe design system**.
- **FACT:** **Four-phase review**; initial response within 72 business hours;
  review team collaborates with the developer on a monday board.
- **FACT:** Assessed on product, engineering, security, privacy, content, assets,
  support, documentation and legal.
- **FACT:** Apps whose primary purpose is integrating a third-party product that
  already has an active integration are rejected.

**INFERENCE (high confidence):** For a solo developer who
builds AI-assisted and states he does not debug unfamiliar platforms quickly, the
security remediation loop — not the feature work — is the binding constraint on
ever shipping here. See `NEXT-GATE0.md`.

## Commercial terms — *from the original brief, 3 Sep 2026, UNVERIFIED*

- **FACT** (`apps/docs/subscriptions-payments-and-billing`, updated 8 Jul
  2026, read 1 Oct): no revenue share until an app reaches $200,000 lifetime
  revenue; after that 85% to the developer, 15% to monday. The Listing Terms
  (28 Aug 2024) let monday change the rate "at its sole discretion" and deduct
  processing charges, refunds and withholding tax.
- **FACT** (same page, and `implementing-monetization`, updated 30 Jan 2026):
  "Developers receive monthly payouts via Payoneer in USD." A Payoneer account
  is required (monday staff, community, Jan 2025). monday charges the customer
  VAT; it is not in the payout.
- **FACT, how payment works:**
  - Vendor registration in **Zip**: "After submitting your app for marketplace
    approval, you will automatically receive an email from Zip". No payment
    until it is done. One registration per developer, not per app.
  - Payoneer: created or connected through monday's partner link, from the
    Payoneer guide linked in `implementing-monetization`.
  - Each month, a **PDF invoice in USD** on a monday "payments board".
    Under $50, wait and combine months.
  - Paid "within up to 60 days" of finance approving the invoice. "There is no
    fixed payment date."
  - The payments-board invitation comes in the first week of the month after
    approval, only if the app has active purchases.
- **FACT** (monday staff, community, Feb 2025): "you do not need to be a
  registered business, unless you are located in Israel." Individuals still
  invoice monthly.
- **UNKNOWN:** anything specific to Türkiye; which tax form, if any, Zip or
  Payoneer collect; what Turkish law needs for an individual to issue a USD
  invoice abroad. That last one is a question for an accountant, at first
  revenue.
- **ASSUMPTION:** monday code hosting currently free.
- **ASSUMPTION:** ~869 marketplace apps vs 250,000+ customers.
- **UNKNOWN:** the last two. Re-verify before relying on them for a future idea.

These were verified by Samet on 3 Sep 2026 and are 13 days old. That is fine for
now and stale by December.

## monday Vibe — *16 Sep 2026*

- **FACT:** In-platform AI app builder. Describe → refine by chat → publish.
- **FACT:** Building and testing free; published apps billed on dedicated tiers.
- **FACT:** Listed example outputs include **time trackers**, dashboards,
  approval systems, org charts.
- **FACT (vendor/press):** $1M ARR in ~10 weeks; 17,000+ apps in first two months.
- **INFERENCE:** Vibe raises the floor on what counts as a marketplace-worthy
  app. Simple CRUD-and-report apps are now closer to free.
- **UNKNOWN:** output quality; whether Vibe apps can be published to the public
  marketplace or only used in-account.

## Development environment note — *16 Sep 2026*

- **FACT:** This Claude session cannot reach `developer.monday.com`,
  `support.monday.com`, `monday.com`, or any app-vendor site. Egress policy
  allows GitHub and package registries only.
- **Consequence:** any future monday build session either needs an environment
  with monday domains allowed, or Samet pastes docs in manually. **Never let
  Claude write monday API or manifest code from memory** — that rule matters
  more here, not less, because the docs are unreachable.
