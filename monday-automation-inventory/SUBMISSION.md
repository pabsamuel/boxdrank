# Automation Inventory — answers for monday's submission form

The form's fields in order, as Watchdog's form had them on 28 Sep 2026
(`../monday-automation-watchdog/SUBMISSION.md`). Each answer is copied from a
document in this folder.
- **OWNER** marks what only Samet can do: legal agreements, the signature,
  file uploads.
- **PENDING** marks values that exist only after the app is created and
  deployed (`PLAYBOOK.md`).

| # | Field | Answer |
|---|---|---|
| 1 | App Name | Automation Inventory |
| 2 | Entity | Individual Developer |
| 3 | Entity Name | N/A: the form's help text asks individual developers for "N/A" (28 Sep) |
| 4 | Full name | Samet Ateşen |
| 5 | Residential region | EMEA (the only options: EMEA, Israel, United States, Other) |
| 6 | Entity Website | https://atesensoftware.com |
| 7 | Technical Point of Contact | Samet Ateşen — sametatesen2@gmail.com |
| 8 | Email Addresses of your teammates | *(empty)* |
| 9 | Business Point of Contact - Email | sametatesen2@gmail.com |
| 10 | Support Address | support@atesensoftware.com |
| 11 | Did you build the app using monday code? | Yes |
| 12 | App Short Description | Every automation on every board, in one searchable list |
| 13 | App Long Description | The long description in `LISTING.md`, as plain text |
| 14 | Keywords | automation, automations, automation list, automation search, find automations, automation audit, inventory, admin, workflow, sidekick |
| 15 | App Features | Custom Object; Board View; AI Skills. The form's list (28 Sep): AI assistant, AI Skills, Board View, Custom Object, Dashboard Widget, Doc Actions, Integration, Item View, Workspace Template, AI app feature, Board group menu, Board item menu, Board multi-item menu, Column Feature. It has no "Sidekick" or "Object"; the Developer Center calls the feature a "Sidekick skill" |
| 15b | Are the board and/or item view feature/s have been enabled for mobile? | No. Appears once Board View is ticked, and is required. Mobile was never configured or tested |
| 16 | Does your APP contain AI capabilities? | Yes — see below. **Fill in the AI fields by hand**: on Watchdog the Chrome agent's tab froze on "Yes" twice |
| 16b | Does you app use AI to generate, process, or somehow interact with the user? If so- what LLM model are you utilizing? (required, choose all models) | The app calls no LLM: its AI capability is a Sidekick skill that monday's own assistant calls. Pick a monday/sidekick option if the list has one; else "Other", with the note below if a box appears; else "None". Never a model the app does not use. Seen 28 Sep; the options were not recorded |
| 17 | Value Proposition and Use Cases | See below |
| 18 | Feature Names | Automation Inventory (object); Automation Inventory (board view); Automation Inventory: find automations (Sidekick tool); Find automations (action block) |
| 19 | Categories | Productivity & efficiency; Reporting & analytics; Project management |
| 20 | OAuth Scopes | See below |
| 21 | Personal Data Use | See below |
| 22 | Privacy Policy | https://atesensoftware.com/automation-inventory/privacy/ (live since 28 Sep 2026) |
| 23 | Terms of Service | https://atesensoftware.com/automation-inventory/terms/ (live since 28 Sep 2026) |
| 24 | Pricing Model | monday's Monetization |
| 25 | Link to your Pricing Page | https://atesensoftware.com/automation-inventory/pricing/ (live since 28 Sep 2026; built for this field) |
| 26 | App gallery images | **OWNER** uploads `listing/gallery-*.png` |
| 27 | App Icon | **OWNER** uploads `listing/app-icon-192.png` |
| 28 | App card image | **OWNER** uploads `listing/app-card-592x348.png` |
| 29 | Developer Icon | **OWNER** uploads `listing/developer-icon-192.png` |
| 30 | App gallery video | **OWNER** uploads `listing/automation-inventory.mp4` |
| 31 | Installation Link | `https://auth.monday.com/oauth2/authorize?client_id=fb2b51f8128e2fbcc70e02843099902d&response_type=install` (shared, "Tüm hesaplar", and installed with it on 28 Sep 2026) |
| 32 | App ID | 12255778 |
| 33 | How to use Link | https://live1-service-36993937-d7d03ea4.eu.monday.app/view/how-to.html |
| 34 | Demo Link | https://live1-service-36993937-d7d03ea4.eu.monday.app/view/ (checked 28 Sep: the demo data answers 200) |
| 35 | Additional Comments | See below |
| 36 | Credentials for review purpose | See below. The help text asks for "N/A" when the app is not an integration, so the answer starts with it |
| 37 | SLA - Service Level Agreement | **OWNER**: "a two business day response time SLA" |
| 38 | Agree to Marketplace Listing Terms | **OWNER** |
| 39 | Signature | **OWNER** |
| 40 | How did you hear about our marketplace? | Other (the form has no "developer documentation" option) |
| 41 | Do you have any apps published or under review in our marketplace? | Yes — Automation Watchdog (app 12249756), submitted 28 Sep 2026 |
| 42 | Are you a monday.com channel partner? | No |

## 16 — AI capabilities, description

> A Sidekick tool: monday's AI assistant can ask Automation Inventory for the
> automations on every board, or on one board by name, that match some words.
> For example: "which of my automations are switched off?" or "which
> automations post to Slack?". It answers with each automation's name, board,
> state and monday's warning.

## 17 — Value Proposition and Use Cases

> monday keeps each board's automations on that board's own Automations page.
> Automation Inventory lists every automation on every board the user can see
> in one searchable list, with whether each is switched on and the warning
> monday shows on it, including automations that have never run. Automations
> set up the older way are named by what they do, using the board's own
> column, label and group names.
>
> Use cases:
> - An admin finds which automation keeps moving items to Done, without opening
>   board after board.
> - A team checks which automations are switched off, or carry a warning,
>   across all its boards.
> - A consultant taking over an account sees every automation in one place on
>   day one.

## 20 — OAuth Scopes

> boards:read — the boards the user can see, the automations on them, and, for
> automations set up the older way, the board's column titles, status labels
> and group names, to name those automations. Read-only; the app never writes.
> It has no OAuth install flow and stores no token.

## 21 — Personal Data Use

> None is stored. The app reads boards and their automations, in the user's
> browser with their own session, or with the short-lived token monday sends
> with a sidekick request, and keeps nothing: no database, no tokens, no email
> addresses. It does not ask for items, column values, updates, files or
> anyone's name or email. Logs hold only an account id and counts. Full
> details: https://atesensoftware.com/automation-inventory/privacy/

## 35 — Additional Comments

> Hosted entirely on monday code, with no storage of any kind. One read-only
> scope. The page uses seamless authentication. The Sidekick tool's action
> block verifies monday's signed request with the signing secret, checks expiry
> and audience, and returns 4xx with severityCode 4000 on failure. Security
> answers with code references are available on request.

## 36 — Credentials for review purpose

> N/A. No separate credentials are needed: the app uses the reviewer's own monday
> account. Install it, then open it from the workspace's left menu ("+" → Apps)
> or add it as a view on any board. It lists every automation on the boards the
> reviewer can see. The demo link shows the full page on an invented demo
> account.

## 16b — LLM note, if the form gives a box

> None of its own: Automation Inventory calls no LLM. Its AI capability is a
> Sidekick skill: monday's AI assistant, sidekick, calls the app's action block,
> and the app answers with plain data about the user's automations.
