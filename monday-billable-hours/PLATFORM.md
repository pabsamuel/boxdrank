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

**INFERENCE (high confidence):** For a solo developer with 24–36 hours/month who
builds AI-assisted and states he does not debug unfamiliar platforms quickly, the
security remediation loop — not the feature work — is the binding constraint on
ever shipping here. See `NEXT-GATE0.md`.

## Commercial terms — *from the original brief, 3 Sep 2026, UNVERIFIED*

- **ASSUMPTION:** 0% platform cut until $200k lifetime revenue.
- **ASSUMPTION:** monday bills the customer; payout via Payoneer, works in Türkiye.
- **ASSUMPTION:** monday code hosting currently free.
- **ASSUMPTION:** ~869 marketplace apps vs 250,000+ customers.
- **UNKNOWN:** all four. Re-verify before relying on any of them for a future idea.

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
