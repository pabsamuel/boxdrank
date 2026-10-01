# Marketplace listing — copy to paste

Everything the Developer Center "Listing" form asks for, ready to paste.

**App name:** Template Guard

**Short description (≤ 60 chars):**
Find what a board lost when it was copied from its template

**Categories:** Admin & Governance (primary), Project Management

**Long description:**

When you duplicate a board, monday copies most of it — and quietly drops
the rest. Connect columns still point at the original board. Views built by
apps disappear. Columns go missing. Nobody is told, and the team finds out
weeks later when something that should have happened didn't.

Template Guard fixes the "nobody is told" part.

1. Mark your best board as a template.
2. Open Template Guard on any copy and press Compare.
3. Get a plain-language list of every difference, ranked by how much it
   hurts:
   - **Miswired** — a connect column on the copy still points at the
     template's board, so data flows to the wrong place.
   - **Missing** — a column, group or view on the template that isn't here.
   - **Altered** — same name, different settings.
   - **Cosmetic** — colours and titles, hidden unless you want them.

Every finding says what changed, why it matters, and exactly how to fix it,
with a link straight to the board.

**Ask sidekick.** Template Guard adds a Sidekick tool: ask monday's AI
assistant "what did the Client A board lose from its template?" and it
answers with the differences, most serious first.

**Pro** watches your copies every six hours and alerts you when something
drifts, so you don't have to remember to check.

**Your data:**
Template Guard stores board IDs, column IDs and board configuration. It never
stores your item data — no item names, no column values, no files, no
updates. It requests no item, update, file or write permissions, so it could
not read or change them if it wanted to. It runs entirely on monday code,
monday's own infrastructure. Access tokens are encrypted at rest with
AES-256-GCM, and everything held for your account is deleted when you
uninstall.

**URLs**

| Field | Value |
|---|---|
| Privacy policy | https://bf61d-service-36993937-e27ad91f.eu.monday.app/privacy.html |
| Terms of use | https://bf61d-service-36993937-e27ad91f.eu.monday.app/terms.html |
| Support / contact | sametatesen2@gmail.com |
| Billing webhook | https://bf61d-service-36993937-e27ad91f.eu.monday.app/webhooks/subscription |

**Screenshots (take these from the live app):**
1. The compare result on a copy — the "3 differences found" screen.
2. The "You need to fix these by hand" checklist.
3. The board view before comparing ("Compare against" + Compare button).

---

# Submission form answers (same order as the form)

Modelled on Automation Watchdog's `SUBMISSION.md`. **OWNER** = only Samet can do it.

| # | Field | Answer |
|---|---|---|
| 1 | App Name | Template Guard |
| 2 | Entity | Individual Developer |
| 3 | Entity Name | Samet Ateşen |
| 4 | Full name | Samet Ateşen |
| 5 | Residential region | Türkiye |
| 6 | Entity Website | https://atesensoftware.com |
| 7 | Technical Point of Contact | Samet Ateşen — sametatesen2@gmail.com |
| 9 | Business Point of Contact | sametatesen2@gmail.com |
| 10 | Support Address | sametatesen2@gmail.com |
| 11 | Built with monday code? | Yes |
| 12 | Short Description | Find what a board lost when it was copied from its template |
| 13 | Long Description | The long description above, as plain text |
| 14 | Keywords | template, templates, duplicate board, board audit, configuration, drift, governance, admin, sidekick, compliance |
| 15 | App Features | Board view; Dashboard widget; Sidekick tool (with its "Compare board with template" action block) |
| 16 | AI capabilities? | Yes — a Sidekick tool: monday's AI assistant can ask Template Guard what a board lost from its template. **Fill the AI fields by hand** (the form froze for the Chrome agent on Watchdog). |
| 17 | Value Proposition and Use Cases | See below |
| 18 | Feature Names | Template Guard (board view); Template Guard (dashboard widget); Template Guard (Sidekick tool); Compare board with template (action block) |
| 19 | Categories | Productivity & efficiency; Project management; Reporting & analytics |
| 20 | OAuth Scopes | See below |
| 21 | Personal Data Use | See below |
| 22 | Privacy Policy | https://bf61d-service-36993937-e27ad91f.eu.monday.app/privacy.html |
| 23 | Terms of Service | https://bf61d-service-36993937-e27ad91f.eu.monday.app/terms.html |
| 24 | Pricing Model | monday's Monetization |
| 25 | Pricing Page | *(empty — pricing lives on the marketplace listing)* |
| 26–30 | Images, icon, card, developer icon, video | **OWNER** uploads |
| 31 | Installation Link | `https://auth.monday.com/oauth2/authorize?client_id=76e86d0a8d1894a85116585c83403625&response_type=install` |
| 32 | App ID | 12248804 |
| 35 | Additional Comments | Hosted entirely on monday code; monday Storage and Secure Storage only. Read-only: requests no write scope. Drift checks are a monday code scheduled job. |
| 36 | Credentials | Not needed: install with the reviewer's own account, open the board view on any board, click "Use this board as a template", duplicate it, and compare the copy. |
| 40 | How did you hear | monday.com developer documentation |
| 41 | Other apps published/under review | Yes — Automation Watchdog (12249756) and Automation Inventory, submitted 28 Sep 2026 |
| 42 | Channel partner | No |

## 17 — Value Proposition and Use Cases

> Teams that run one board per client or project build a template and
> duplicate it. monday copies most of the board and silently drops the rest:
> connect columns keep pointing at the template's board, app views disappear,
> columns go missing. Template Guard saves the template's configuration and
> compares every copy against it, explaining each difference and how to fix it.
>
> Use cases: an agency checks that a new client board got every column and
> view of the onboarding template; an ops admin finds copies whose connect
> column still feeds the template's CRM; a PMO asks sidekick which project
> boards drifted from the standard.

## 20 — OAuth Scopes

> boards:read — the configuration of the template and the boards compared with
> it (columns, groups, views, connections), never item values. account:read —
> the account id and slug, to key storage and link back to boards. me:read —
> who installed the app, so drift alerts reach them. All read-only; the app
> never writes to a board.

## 21 — Personal Data Use

> One piece of personal data: the monday user id of the installer, so drift
> alerts have a recipient. Board owners and subscribers are stored only as
> user ids, as part of the board configuration. No item names, column values,
> updates or files are read or stored. Everything is deleted on uninstall.
