# What came from Automation Watchdog, and what is still to take

Watchdog lives in `../monday-automation-watchdog/`. Everything it has was
tested live on Samet's account (26–28 Sep 2026). **Copy and adapt; never
import across folders, and never edit Watchdog from here**: it is under
monday's review.

## Already taken, 28 Sep 2026

| Here | From Watchdog | Changed |
|---|---|---|
| `src/core/inventory.js`, `src/core/sanitize.js` | same files (the "All automations" tab) | Added filters (`filterInventory`, `boardsIn`) |
| `src/app/monday-source.js` | same file | Kept `boards` and `board_automations` only; added a deadline (`shouldStop`) and `boardsRead` |
| `src/app/main.js`, `src/app/index.html` | the board view's bootstrap, theme, viewer and value-created code, and the tab's UI | Rewritten around the list; filter chips and board select added; no welcome page yet |
| `src/server/app-server.js` | same file | OAuth, cron, lifecycle, storage and mail removed; JWT, audience, severity 4000, billing gate, setup mode and headers kept |
| `src/server/sidekick.js` | same file | A new question ("find automations") in the same shape: board-name matching, time budget, partial answers |
| `src/server/http-client.js`, `src/server/redact.js` | same files | The API version can be set per call |
| `scripts/*` | same scripts | Adapted to this app's settings and routes; the demo data is served, which Watchdog's live demo link lacked until 28 Sep |
| `test/*` | the server, JWT, audience, severity, setup-mode and inventory tests | Adapted; the Sidekick tests are new |
| `test/browser/verify-view.mjs` | Watchdog's fake-monday browser check, which lived only in a scratch folder | Committed here so it can be re-run |
| `.github/workflows/monday-automation-inventory-ci.yml` | Watchdog's CI | `npm ci`, `npm test`, `check:deploy` |

## Still to take, at that stage

| Need | Watchdog file | Note |
|---|---|---|
| Welcome page before first use | `src/app/main.js` (`renderWelcome`) | monday's review asks for onboarding |
| How-to page | `src/app/how-to.html`, served at `/view/how-to.html` | Rewrite the content |
| Listing images and video | `scripts/asset-kit.js`, `scripts/make-assets.js`, `scripts/make-video.js` | Rewrite the scenes; keep monday's sizes |
| Screenshot of the authentication code for the security review | `scripts/make-assets.js` (cuts it from the source) | Point it at `verifyJwt` and `sidekickTool` here |

## Documents to use as templates

| New document | Template | Note |
|---|---|---|
| `LISTING.md` | `../monday-automation-watchdog/LISTING.md` | Field order and limits are monday's |
| `SUBMISSION.md` | `../monday-automation-watchdog/SUBMISSION.md` | All 42 form fields in order; the OWNER fields stay OWNER |
| `SECURITY-ANSWERS.md` | `../monday-automation-watchdog/SECURITY-ANSWERS.md` | Far shorter: no OAuth, no storage, no email |
| `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md` | Watchdog's | Every sentence re-checked against this app's code |

## Website: `atesensoftware-site/`

The site is shared by all apps.
- Add an entry to `APPS` in `atesensoftware-site/build.mjs`: slug, name,
  client id, install URL, icon, privacy, terms.
- That entry creates `/<slug>/privacy/`, `/<slug>/terms/` and
  `/<slug>/pricing/`.
- It also adds the client id to `monday-app-association.json`.
- Rebuild with `node build.mjs` and commit `public/`.
- Netlify deploys only when that folder changes, at 15 credits a deploy.
