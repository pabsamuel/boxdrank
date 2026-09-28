# What to take from Automation Watchdog

Watchdog lives in `../monday-automation-watchdog/`. Everything it has was
tested live on Samet's account (28 Sep 2026). **Copy files into this folder and
adapt them. Never import across folders, and never edit Watchdog**: it is
under monday's review.

## Already copied: `seed/`

Taken from Watchdog at commit `23fcca6`. `cd seed && npm test` gives 5/5
passing.

| File | What it is | State |
|---|---|---|
| `seed/src/app/monday-source.js` | `fetchBoards`, `fetchAutomations` (board by board, `2026-10`, pages, legacy parsing, failed boards counted), `query()` with `apiVersion`, `parseLegacyAutomations` | Works. Also contains Watchdog's activity-log code (`fetchActivity`, `fetchUsers`, `parseActivityTimestamp`); delete what the new app does not use |
| `seed/src/core/inventory.js` | `buildInventory` (rows and counts, warnings first) and `searchInventory` (accent- and case-folded, every word must match) | Works, pure, tested |
| `seed/src/core/sanitize.js` | `singleLine()` | Dependency of both |
| `seed/test/inventory.test.js` | Tests for all of the above | 5 tests |
| `seed/fixtures/demo-automations.json` | 7 invented automations for demo mode | Invented. Say so wherever it is shown |
| `seed/src/app/inventory-ui.reference.js` | Watchdog's tab UI: `renderInventory`, `renderInventoryRow`, `loadInventory` | **Reference only.** Depends on Watchdog's `state`, `render()` and `demoMode`; rewrite it |
| `seed/src/app/inventory.reference.css` | Tab and search-box CSS | Reference; needs Watchdog's CSS variables |

## Copy when you reach that stage

| Need | Watchdog file | Change |
|---|---|---|
| Server: static `/view/`, `/health`, security headers, routing | `src/server/app-server.js` | Keep the base headers, `parseRequestUrl`, `verifyJwt` and the static handler. Drop OAuth, cron, lifecycle, storage and mail |
| Sidekick route | `src/server/app-server.js` (`sidekickTool`, `sidekickAudience`) and `src/server/sidekick.js` | New question and answer; keep the JWT checks, the 4xx with `severityCode: 4000`, and the time budget |
| Server start-up on monday code | `scripts/serve-monday.js` | Only `MONDAY_SIGNING_SECRET` is needed, plus a billing flag |
| Scrubbing secrets from errors | `src/server/redact.js` | As is |
| Board-view bootstrap: context, theme, viewer, `valueCreatedForUser`, plan strip with `openPlanSelection` | `src/app/main.js` (`start`, `applyTheme`, `loadFromMonday`, `renderRunStatus`, `reportValueCreated`) | Keep the patterns; rewrite the content |
| Page shell and themes (light, dark, black) | `src/app/index.html` | CSS variables and theme classes |
| Build (esbuild), local demo server, deploy check | `scripts/build.js`, `scripts/serve.js`, `scripts/check-deploy.js` | Paths |
| How-to page | `src/app/how-to.html` | Rewrite |
| Listing images and video | `scripts/asset-kit.js`, `scripts/make-assets.js`, `scripts/make-video.js` | Rewrite the scenes; keep the sizes |
| Tests for server, JWT and sidekick | `test/app-server.test.js`, `test/sidekick.test.js` | Keep the JWT, audience and severity cases |

## Documents to use as templates

| New document | Template | Note |
|---|---|---|
| `LISTING.md` | `../monday-automation-watchdog/LISTING.md` | Field order and limits are monday's |
| `SUBMISSION.md` | `../monday-automation-watchdog/SUBMISSION.md` | All 42 form fields in order; the OWNER fields stay OWNER |
| `SECURITY-ANSWERS.md` | `../monday-automation-watchdog/SECURITY-ANSWERS.md` | Far shorter if there is no OAuth, storage or email |
| `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md` | Watchdog's | Every sentence re-checked against this app's code |

## Website: `atesensoftware-site/`

The site is shared by all apps.
- Add an entry to `APPS` in `atesensoftware-site/build.mjs`: slug, name, client
  id, install URL, icon, privacy, terms.
- That entry creates `/<slug>/privacy/`, `/<slug>/terms/` and `/<slug>/pricing/`.
- It also adds the client id to `monday-app-association.json`.
- Rebuild with `node build.mjs` and commit `public/`.
- Netlify deploys only when this folder changes, at 15 credits a deploy.
