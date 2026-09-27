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

## Long description (200–2,500 characters)

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
| Video, 120 s and 50 MB at most | not made yet | — |
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
| Website | `https://atesensoftware.com` (the owner's domain: registered at Namecheap until 8 Sep 2027 with auto-renew, DNS at Cloudflare, site on Netlify) |
| Support email | `support@atesensoftware.com`, forwarded to the owner's Gmail by Cloudflare Email Routing |
| Domain proof | `https://atesensoftware.com/monday-app-association.json` |

## Legal

| Field | Value |
|---|---|
| Full contact name | Samet Ateşen |
| Company / entity name | Samet Ateşen — the recommendation while no company exists; the website shows "Samet Ateşen (Atesen Software)". [FILL IN: the owner confirms or changes it in `atesensoftware-site/build.mjs`] |

## Pricing — monday's monetization is required for new apps

[FILL IN: the owner's decision.] Proposal, not evidence: one feature-based
("Standard") plan with a 14-day trial, $15 a month or $144 a year ($12 a month).
The only outside input is Patrick Fallon's remark that an extra $15 is unlikely
to feel significant to accounts paying for several seats. Plan ids are sent to
the backend as `plan_id`; the code does not depend on any particular id — any
active plan or trial enables alerts.

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
