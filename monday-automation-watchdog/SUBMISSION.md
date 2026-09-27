# Automation Watchdog — answers for monday's submission form

The form's fields, in its order, as read from the Developer Center on 28 Sep
2026 (Submit app → Submission form). Each answer is copied from a document in
this repository; nothing here is new. **OWNER** marks the fields only the owner
can complete: legal agreements, the signature, and file uploads from his
computer (`listing/`).

| # | Field | Answer |
|---|---|---|
| 1 | App Name | Automation Watchdog |
| 2 | Entity | Individual Developer (the form's options: Company, Individual Developer) |
| 3 | Entity Name | Samet Ateşen |
| 4 | Full name | Samet Ateşen |
| 5 | Residential region | Türkiye (or the region list's entry containing it) |
| 6 | Entity Website | https://atesensoftware.com |
| 7 | Technical Point of Contact | Samet Ateşen — sametatesen2@gmail.com (the address of his monday user, so the review board invitation reaches him) |
| 8 | Email Addresses of your teammates | *(empty)* |
| 9 | Business Point of Contact - Email | sametatesen2@gmail.com |
| 10 | Support Address | support@atesensoftware.com |
| 11 | Did you build the app using monday code? | Yes |
| 12 | App Short Description | Email alerts when a monday automation quietly stops |
| 13 | App Long Description | The long description in `LISTING.md`, as plain text |
| 14 | Keywords | automation, automations, automation monitoring, alerts, broken automation, workflow, notifications, admin, audit, reliability |
| 15 | App Features | Board view |
| 16 | Does your APP contain AI capabilities? | No |
| 17 | Value Proposition and Use Cases | See below |
| 18 | Feature Names | Automation Watchdog (board view) |
| 19 | Categories | Productivity & efficiency; Reporting & analytics; Project management |
| 20 | OAuth Scopes | See below |
| 21 | Personal Data Use | See below |
| 22 | Privacy Policy | https://atesensoftware.com/automation-watchdog/privacy/ |
| 23 | Terms of Service | https://atesensoftware.com/automation-watchdog/terms/ |
| 24 | Pricing Model | monday's Monetization (FACT, `apps/docs/implementing-monetization`: "When selecting your pricing model, choose monday's Monetization") |
| 25 | Link to your Pricing Page | *(empty — pricing lives on the marketplace listing)* |
| 26 | App gallery images | **OWNER** uploads `listing/gallery-1-board-view.png` … `gallery-4-dark.png` |
| 27 | App Icon | **OWNER** uploads `listing/app-icon-192.png` |
| 28 | App card image | **OWNER** uploads `listing/app-card-592x348.png` |
| 29 | Developer Icon | **OWNER** uploads `listing/developer-icon-192.png` |
| 30 | App gallery video | **OWNER** uploads `listing/automation-watchdog.mp4` |
| 31 | Installation Link | `https://auth.monday.com/oauth2/authorize?client_id=9fcd68cae356c7fed3eacf09a0f9df81&response_type=install` (the Share tab's link, shared 28 Sep) |
| 32 | App ID | 12249756 |
| 33 | How to use Link | https://live1-service-36993937-ca48573e.eu.monday.app/view/how-to.html |
| 34 | Demo Link | https://live1-service-36993937-ca48573e.eu.monday.app/view/ — opened outside monday it runs the full board view on a demo account |
| 35 | Additional Comments | See below |
| 36 | Credentials for review purpose | See below |
| 37 | SLA - Service Level Agreement | **OWNER** reads monday's text in the form and decides |
| 38 | Agree to Marketplace Listing Terms | **OWNER** — https://monday.com/l/legal/monday-com-marketplace-listing-terms/ |
| 39 | Signature | **OWNER** |
| 40 | How did you hear about our marketplace? | monday.com developer documentation |
| 41 | Do you have any apps published or under review in our marketplace? | No |
| 42 | Are you a monday.com channel partner? | No |

## 17 — Value Proposition and Use Cases

> monday switches automations off in several situations, and for some of them
> it notifies no one: the builder loses permissions or is made a viewer, the
> automation hits a rate limit, or its owner's user is deactivated. The only
> trace is an error on that board's Automations page. Automation Watchdog
> learns how often each automation normally acts and emails the admin when one
> that used to run regularly goes quiet, and again when it recovers.
>
> Use cases: an operations admin learns the morning after that the automation
> routing new leads stopped, instead of weeks later; a team whose builder left
> the company finds out which of their automations went quiet; an agency
> managing many boards sees every recurring automation and its state in one
> read-only view.

## 20 — OAuth Scopes

> boards:read — board names and each board's activity log, which is what the
> app analyses. users:read — the account's users, to tell actions by people
> from actions by automations. me:read — who installed the app, so alerts go to
> them. account:read — which account the token belongs to (the OAuth token
> response has no account id) and the account slug, to return the installer to
> monday. All four are read-only; the app never writes.

## 21 — Personal Data Use

> One piece of personal data: the email address of the user who sets up alerts,
> used only to send them alerts. It is kept, with the access token, in monday
> code secure storage, and both are deleted when the app is uninstalled. The
> app does not read item names, column values, updates or files; the activity
> log is requested without the field that carries them. Nothing is sold or
> shared; alert emails are delivered through Gmail's SMTP. Full details:
> https://atesensoftware.com/automation-watchdog/privacy/

## 35 — Additional Comments

> Hosted entirely on monday code; monday storage and secure storage only. The
> daily check is a monday code scheduled job. Billing: once the pricing version
> is approved, the server's WATCHDOG_BILLING setting is switched to enforce, so
> accounts without a plan or trial stop receiving alerts (the board view then
> offers monday's plan selection). SSL Labs A+ on both domains; Palo Alto URL
> filtering Low-Risk on both. Security answers with code references are
> available on request.

## 36 — Credentials for review purpose

> No separate credentials are needed: the app signs in with the reviewer's own
> monday account. Install it, add the Automation Watchdog board view to any
> board, and click "Set up email alerts" to receive the daily email. Results
> need automations that have been running for a few weeks; the demo link shows
> the full view on a demo account.
