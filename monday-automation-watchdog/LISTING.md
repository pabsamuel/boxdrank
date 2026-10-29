# Automation Watchdog — marketplace listing

Every field monday's listing asks for, in its order, with monday's limits.
Requirements read on 27 Sep 2026 from `developer.monday.com/apps/docs/`
(`app-listing-page`, `documentation-and-support`, `legal`, `product`). Every
sentence describes what the code does today. `[FILL IN]` marks a decision that
belongs to the owner, not a fact.

**Changed 27 Sep:** the listing no longer leads with "when someone leaves,
their automations die". Patrick Fallon (a monday consultant) pointed out that
monday now lets an account set a default owner that inherits a deactivated
user's automations, which keeps them running. That case is still real for
accounts that have not set it, but it is not the headline.

## App name (30 characters at most, no "monday" in it)

Automation Watchdog

## Short description (60 characters at most)

Email alerts when a monday automation quietly stops

## Long description (about 1,600 characters)

The checklist says 200–2,500 characters; the listing guidelines say 200–2,000.
This fits both.

Automations fail quietly. monday's help center lists eight ways an automation
gets switched off, and for several of them it sends no notification: the
person who built it loses permissions or is made a viewer, it hits a rate
limit, or its owner's user is deactivated. The only trace is an error on that
board's Automations page, which nobody opens until the work that should have
happened hasn't.

Automation Watchdog learns how often each of your automations normally acts —
every hour, every morning, every weekday — and tells you when one that used to
run regularly goes quiet.

**What it does**
- Covers every board you can see from one board view, with no rules to write
- Learns each automation's normal rhythm from the last 60 days, and allows for
  weekends and quiet days so you are not woken by false alarms
- Emails you once when an automation stops, reminds you if it is still stopped
  three days later, and tells you when it starts working again
- Lets you mute an alert you already know about — for a day, a week, 90 days
  or until it works again, never forever, so a mute cannot become a blind spot
- Shows every watched automation with its normal rhythm and its state today
- Works with sidekick, monday's AI assistant: ask "which of my automations
  have stopped?" — for every board, or one board by name — and it answers with
  the automations that went quiet and how long they have been quiet
- Follows monday's light, dark and night themes

**What it asks for**
Read-only access, and nothing else. It never changes a board, an item or an
automation, and it does not read item names, column values, updates or files.

**What it cannot see**
An automation that acts too rarely to have a rhythm — roughly less than weekly
— or one that has never acted. Something that fires once a month will not be
flagged when it stops.

## Keywords (up to 10)

automation, automations, automation monitoring, alerts, broken automation,
workflow, notifications, admin, audit, reliability

## Categories (up to 3, from monday's list)

- Productivity & efficiency
- Reporting & analytics
- Project management

## Images — made by `scripts/make-assets.js`, in `listing/`

| monday asks for | File | Size |
|---|---|---|
| App icon | `listing/app-icon-192.png` | 192×192 |
| Developer icon | `listing/developer-icon-192.png` | 192×192 (initials "SA"; redo if the entity name changes) |
| App card image | `listing/app-card-592x348.png` | 592×348 |
| Gallery, 3–5 images | `listing/gallery-1-board-view.png` … `gallery-4-dark.png` | 1920×960 each |
| Video — the listing guidelines ask for 30–60 s, HD, MP4, 50 MB at most | `listing/automation-watchdog.mp4`, made by `scripts/make-video.js` | 45 s, 1920×1080, H.264, about 9 MB |
| Security review: authorization code screenshot | `listing/auth-code.png` | — |

The screenshots are the real board view running on the demo account, whose
boards and automations are invented. None of it is a customer's data.

## Links

| Field | Value |
|---|---|
| How-to-use page (embeddable in monday) | `https://live1-service-36993937-ca48573e.eu.monday.app/view/how-to.html` — live after the next `mapps code:push` |
| Demo link, for reviewers only | `https://live1-service-36993937-ca48573e.eu.monday.app/view/` — opened outside monday it runs on the demo account |
| Installation link | from Developer Center → Share, once published (`https://auth.monday.com/oauth2/authorize?client_id=…`) |
| Privacy policy | `https://atesensoftware.com/automation-watchdog/privacy/` — built from `PRIVACY_POLICY.md` by `atesensoftware-site/build.mjs` |
| Terms of service | `https://atesensoftware.com/automation-watchdog/terms/` — built from `TERMS_OF_SERVICE.md` |
| Website | `https://atesensoftware.com` (the owner's domain: registered at Namecheap until 8 Sep 2027 with auto-renew, DNS at Cloudflare; the site moved from Netlify to Cloudflare on 28 Sep 2026, built from the `pabsamuel/atesensoftware-site` repository) |
| Support email | `support@atesensoftware.com`, forwarded to the owner's Gmail by Cloudflare Email Routing |
| Domain proof | `https://atesensoftware.com/monday-app-association.json` |

## Legal

| Field | Value |
|---|---|
| Full contact name | Samet Ateşen |
| Company / entity name | **Samet Ateşen** — confirmed by the owner on 27 Sep. No company exists; "Atesen Software" is the brand the website shows beside it. |

## Pricing — monday's monetization is required for new apps

**Decided 27 Sep** (the owner asked for the best starting price rather than
choosing one): **seat-based, $1 per seat per month, "Optimized" mode, 14-day
trial.** A starting point to revise with data, not a number anyone has
agreed to pay.

Why, and what it rests on:

- **Seat-based.** FACT, monday's developer pricing report (Untapped Pricing for
  monday, Feb 2024, linked from `apps/docs/plans-and-pricing`): "Use seat-based
  pricing if your app targets a very specific customer need by doing just one
  thing really well rather than having a large feature set." That is this app.
  It also scales with the problem: bigger accounts run more automations.
- **$1 a seat.** FACT (`submit-your-plans-and-pricing`): the seat price "must be
  a non-negative integer", in USD, so the choices are $1 or $2. FACT
  (`COMPETITORS.md`): the nearest admin app, Workspace Doctor, charges $2 a
  month up to 3 seats, $4 up to 5 and $8 up to 10, yearly, with a free tier —
  about $0.70–0.80 a seat. FACT (the report): small accounts are the price-
  sensitive ones — "if a business is on a five-seat plan, paying $10 per month
  for an app can add up to about 20% percent of your monthly subscription".
  $2 a seat would be 2.5× the nearest comparable app with no reviews to justify
  it; $1 keeps a 3-seat account at $3 a month and a 50-seat one around $50
  before monday's volume discounts. INFERENCE: easier to raise later, with
  reviews, than to win back installs lost to a high first price.
- **Optimized mode.** FACT (`plans-and-pricing`): monday applies progressively
  lower per-seat prices to larger accounts itself, so a 500-seat account is not
  asked for $500.
- **14-day trial.** FACT: "All seat-based apps must include a trial"; 14 days is
  monday's default. No free bucket for now: every installed account costs a
  daily check, and a free tier teaches "free".
- Patrick Fallon's remark that an extra $15 is unlikely to feel significant to
  multi-seat accounts is consistent with this, and is one opinion about another
  app.

Plan ids are sent to the backend as `plan_id`; the code does not depend on any
particular id — any active plan or trial enables alerts.

Once pricing is approved, set `WATCHDOG_BILLING=enforce` (`mapps code:env`) so
that accounts without a plan stop receiving alerts. Until then leave it unset:
the app has no plans yet, and enforcing now would stop the owner's own alerts.

## Notes for the review team

- Hosted entirely on monday code. Storage and secure storage are monday's own.
- OAuth scopes: `boards:read`, `users:read`, `me:read`, `account:read`. All
  read-only; the reason for each is in `PRIVACY_POLICY.md`.
- The scheduled check is a monday code cron job at `/mndy-cronjob/check`.
- Uninstall events are verified against the client secret and delete the
  stored token and email address.
- Security answers with evidence: `SECURITY-ANSWERS.md`.
- The code is in `monday-automation-watchdog/` in this repository, with its
  offline tests and three security reviews recorded in the README.
