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

## Website

**Moving, 28 Sep 2026.** Samet is moving `atesensoftware.com` from Netlify to
Cloudflare. The site is being built from the separate repository
`pabsamuel/atesensoftware-site`, which also carries his Atlassian and
Freshworks apps' pages.
- Samet, 28 Sep: monday pages live in that repo under
  `src/static/automation-watchdog/`. This app's go next to them, in
  `src/static/<slug>/`.
- That folder was not yet on the repo's `main` branch when checked on 28 Sep.
- **Live on Cloudflare from 28 Sep.** Checked from here:
  - every page answers `server: cloudflare`;
  - HSTS `max-age=31536000; includeSubDomains`;
  - the association file lists Watchdog's client id;
  - MX and SPF are unchanged (Cloudflare Email Routing).
- For this app:
  - `node atesensoftware-site/build.mjs` in this repository renders
    `atesensoftware-site/public/automation-inventory/{privacy,terms,pricing}/index.html`
    and `public/assets/automation-inventory.png`, in the live pages' format.
  - Copy them into `src/static/automation-inventory/` and `/assets/` of
    `pabsamuel/atesensoftware-site`.
  - Once the app has a client id: set it in `build.mjs` (which then also
    lists the app on the home page and in `monday-app-association.json`),
    and add it to the live association file next to Watchdog's.
- **The live site is deployed from Samet's computer** (Cloudflare Pages,
  `scripts/deploy.ps1`), so the site session must run there. A cloud session
  cannot reach it (28 Sep).
  - The local repository was pushed to GitHub on 28 Sep (site commit
    7c3ffaf). GitHub Actions is disabled there and has no Cloudflare secret,
    so a push deploys nothing.
  - The site's `build.mjs` writes the `_headers` block, with one CSP shared
    by Watchdog and Inventory.
  - **Line endings:** the repository has `core.autocrlf=true`. A rebase on
    28 Sep turned Watchdog's pages into CRLF, which would have changed the
    live bytes. The site session put LF back before deploying. A
    `.gitattributes` pinning LF under `src/static/` would stop it recurring.
- The site session's zip for this app (28 Sep) is byte-identical to what
  `build.mjs` here renders:
  - three pages, with the app's own favicon;
  - `src/static/assets/automation-inventory.png`;
  - a `_headers` block giving `/automation-inventory/*` the same CSP
    override as Watchdog's pages (inline styles allowed).
- `build.mjs` output also matches the live Watchdog pages byte for byte
  (checked 28 Sep).

The old setup, `../atesensoftware-site/` in this repository, shared by all
apps:
- Add an entry to `APPS` in `atesensoftware-site/build.mjs`: slug, name,
  client id, install URL, icon, privacy, terms.
- That entry creates `/<slug>/privacy/`, `/<slug>/terms/` and
  `/<slug>/pricing/`.
- It also adds the client id to `monday-app-association.json`.
- Rebuild with `node build.mjs` and commit `public/`.
- Netlify deploys only when that folder changes, at 15 credits a deploy.
