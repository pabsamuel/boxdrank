# Automation Inventory

A monday.com marketplace app that shows every automation in an account in one
searchable place: on or off, with monday's warnings, older automations
included. Monday's AI assistant can search it too, through a Sidekick tool.
The idea is Patrick Fallon's; his words are in `SPEC.md`.

**Status, 28 Sep 2026: Gate 0 passed (GO); built and tested, not yet deployed. 19 / 30 = 63%**
(`PROGRESS.md`).
- The code works in tests and in a browser inside a fake monday.
- Name and price are decided. There is no App ID and no deploy yet.
- **Next:** creating the app and deploying it, with `DEPLOY-PROMPTS.md`.

## How it works

| Part | File | What it does |
|---|---|---|
| The page (an Object and a board view) | `src/app/main.js`, `src/app/index.html` | Lists every automation on the boards the user can see, board by board, reading monday with the user's own session. Warnings first, then switched off. Filters, search, "Open board ↗", themes, viewer message, a welcome page the first time. Opened outside monday it shows an invented demo account |
| How-to page | `src/app/how-to.html`, `src/app/assets/` | The page monday's review asks for, with three screenshots from `scripts/make-assets.js` |
| Sidekick tool | `src/server/sidekick.js` | `POST /monday/sidekick/find`: monday's AI assistant asks for automations matching some words, on every board or one board, and gets a summary in words |
| Server | `src/server/app-server.js`, `scripts/serve-monday.js` | Serves `/view/` and the demo data, and checks each Sidekick request (signing-secret JWT, expiry, audience). Setup mode until `APP_BASE_URL` and `MONDAY_SIGNING_SECRET` exist |
| monday API | `src/app/monday-source.js` | `boards`, and `board_automations` on API version `2026-10`, one board at a time, because older automations come only that way |
| Inventory logic | `src/core/inventory.js` | Ordering, counts, filters and search: pure functions |

There is no OAuth, no stored token, no email and no scheduled job. Nothing
runs without a user present, and nothing is stored.

## Commands

```
npm install
npm test                         # 52 tests
npm run demo                     # http://localhost:8137/ in demo mode
npm run check:deploy             # what monday code does on push, locally
npm run build && node test/browser/verify-view.mjs   # 28 browser checks; needs Playwright
node scripts/make-assets.js      # re-renders the how-to screenshots; needs Playwright
node scripts/make-listing.js     # listing icon, card and gallery; needs Playwright
node scripts/make-listing-video.js   # listing video; needs Playwright and ffmpeg
```

## Files

| File | What it holds |
|---|---|
| `MASTER-PROMPT.md` | What Samet pastes into a new project or session to start it |
| `CLAUDE.md` | Operating rules. Read every session |
| `PROGRESS.md` | The checklist and the percentage |
| `GATE0.md` | The three checks, with exact queries and a ready prompt |
| `PLAYBOOK.md` | From nothing to submitted, the way it worked for Watchdog |
| `DEPLOY-PROMPTS.md` | Steps 1–6 as ready-to-paste Chrome prompts and PowerShell commands |
| `LISTING.md`, `SUBMISSION.md` | Every listing field and all 42 submission-form answers |
| `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md` | The legal pages' text, checked against the code |
| `SECURITY-ANSWERS.md` | monday's security checklist, answered with code references |
| `DECISIONS.md` | What was decided, by whom, when; what is still open |
| `SPEC.md` | The problem, the MVP, what the API can and cannot do |
| `COMPETITORS.md` | monday's own Autopilot hub, the marketplace (no app does this), and users asking for it |
| `PLATFORM-FACTS.md` | monday facts learned on Watchdog, with sources |
| `LESSONS.md` | Mistakes from Watchdog not to repeat |
| `REUSE.md` | What came from Watchdog, and what is still to take |
| `SUBMISSION-CHECKLIST.md` | Everything monday asks for before approval |
| `BACKLOG.md` | Parked ideas, one line each |

## Related

- **Automation Watchdog**, `../monday-automation-watchdog/`: app 12249756,
  live, under review since 28 Sep 2026. It sends alerts when an automation
  stops. Do not change it from here.
- **Website**, `../atesensoftware-site/`: `atesensoftware.com`, shared by all
  apps: legal pages, pricing page, domain proof.
- **Research**, `../monday-billable-hours/`: validation notes, competitors and
  the shared backlog.

## Facts to fill in once they exist

| | |
|---|---|
| App name | Automation Inventory |
| App ID | UNKNOWN |
| Client ID | UNKNOWN |
| Live URL | UNKNOWN |
| Slug on atesensoftware.com | `automation-inventory` |
