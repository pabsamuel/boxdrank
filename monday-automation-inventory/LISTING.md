# Automation Inventory — marketplace listing

Every field monday's listing asks for, in its order, with monday's limits: the
same fields Watchdog's `LISTING.md` records, read 27 Sep 2026 from
`developer.monday.com/apps/docs/` (`app-listing-page`,
`documentation-and-support`, `legal`, `product`). Every sentence describes what
the code does today. **OWNER** marks decisions that are Samet's.

It does not name monday's Autopilot hub. The gap is described, not the
product (`COMPETITORS.md`): monday's hub shows failures and the most-used
automations; this app lists all of them.

## App name (30 characters at most, no "monday")

Automation Inventory. **OWNER** to confirm; it is the working name in the code
(`src/core/brand.js`, `src/app/index.html`, `src/app/how-to.html`).

## Short description (60 characters at most)

Every automation on every board, in one searchable list

## Long description (200–2,000 characters)

monday keeps each board's automations on that board's own Automations page.
With dozens of boards, finding the one that moves items to Done, or checking
which automations are switched off, means opening board after board.

Automation Inventory puts every automation on every board you can see into one
list.

**What it does**
- Lists every automation on the boards you can see, on one page, including ones
  that have never run
- Shows whether each one is switched on, and the warning monday shows on it,
  with the ones that need attention first
- Finds an automation by searching its name, its board or its warning
- Filters to the ones switched off, the ones with a warning, or one board
- Opens an automation's board in one click, to switch it on or off there
- Works with sidekick, monday's AI assistant: ask "which of my automations are
  switched off?" or "which automations post to Slack?" and it answers with each
  automation's name, board and state
- Sits in your workspace's left menu, or as a view on any board, and follows
  monday's light, dark and night themes

**What it asks for**
Read-only access to boards, and nothing else. It never changes a board, an item
or an automation, and it stores nothing: the list is read in your browser each
time you open it.

**What it cannot do**
It cannot switch automations on or off itself, because monday's public API does
not offer that, so it takes you to the board instead. It shows only the boards
you have access to.

## Keywords (up to 10)

automation, automations, automation list, automation search, find automations,
automation audit, inventory, admin, workflow, sidekick

## Categories (up to 3, from monday's list)

- Productivity & efficiency
- Reporting & analytics
- Project management

These are Watchdog's, which monday's form accepted.

## Images: `listing/`, made by `scripts/make-listing.js`

| monday asks for | File | Size |
|---|---|---|
| App icon | `listing/app-icon-192.png` | 192×192 |
| Developer icon | `listing/developer-icon-192.png` | 192×192, the same as Watchdog's |
| App card image | `listing/app-card-592x348.png` | 592×348 |
| Gallery, 3–5 images | `listing/gallery-*.png` | 1920×960 each |
| Video, 30–60 s, HD, MP4, 50 MB at most | `listing/automation-inventory.mp4`, from `scripts/make-listing-video.js` | 41.5 s, 1920×1080, H.264, 5.6 MB |

The screenshots are the real app on an invented demo account.

## Links

| Field | Value |
|---|---|
| How-to-use page | `https://<LIVE_URL>/view/how-to.html`, once deployed |
| Demo link, for reviewers | `https://<LIVE_URL>/view/`; opened outside monday it runs on the demo account |
| Installation link | From Developer Center → Share: `https://auth.monday.com/oauth2/authorize?client_id=<CLIENT_ID>&response_type=install` |
| Privacy policy | `https://atesensoftware.com/automation-inventory/privacy/`, from `PRIVACY_POLICY.md` |
| Terms of service | `https://atesensoftware.com/automation-inventory/terms/`, from `TERMS_OF_SERVICE.md` |
| Website | `https://atesensoftware.com` |
| Support email | `support@atesensoftware.com` |
| Domain proof | `https://atesensoftware.com/monday-app-association.json`, with this app's client id added |

The website is moving to Cloudflare (28 Sep). The pages go in the repository
`pabsamuel/atesensoftware-site`, under `src/static/automation-inventory/`
(`REUSE.md`).

## Legal

| Field | Value |
|---|---|
| Full contact name | Samet Ateşen |
| Company / entity name | Samet Ateşen: individual developer; "Atesen Software" is the brand |

## Pricing: OWNER

monday's rules (Watchdog's research, `../monday-automation-watchdog/LISTING.md`):
- monday Monetization is required for new apps.
- A seat price is a whole number of USD.
- Seat-based plans need a trial.

**Proposed: the same as Watchdog, $1 per seat per month, Optimized mode,
14-day trial.**
- INFERENCE: one price across Samet's apps is easy to explain.
- INFERENCE: this app has no ongoing cost per account: it stores nothing and
  runs only when someone opens it or asks sidekick.
- What someone would pay: UNKNOWN. Nobody has been asked.

## Notes for the review team

- Hosted entirely on monday code. Nothing is stored: no database, no monday
  storage, no secure storage.
- One read-only scope, `boards:read`. **To confirm on the first live test**
  (`PLAYBOOK.md` step 6): which scope `board_automations` needs has not been
  seen with the app's own token.
- No OAuth install flow. The page uses seamless authentication. The Sidekick
  tool's action block uses the short-lived token in monday's signed request.
- Security answers with code references: `SECURITY-ANSWERS.md`.
