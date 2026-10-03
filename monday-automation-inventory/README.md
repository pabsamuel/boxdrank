# Automation Inventory

A monday.com marketplace app that shows every automation in an account in one
searchable place: on or off, with monday's warnings, older automations
included. Monday's AI assistant can search it too, through a Sidekick tool.
The idea is Patrick Fallon's; his words are in `SPEC.md`.

**Status, 28 Sep 2026: Gate 0 passed (GO); v2 live with all four features, installed and tested; submitted to monday on 28 Sep; security evidence complete. 28 / 30 = 93%**
(`PROGRESS.md`).
- The code works in tests and in a browser inside a fake monday.
- Name and price are decided. App 12255778 is live on monday code, with the
  signing secret set. v2 is live with its four features: Object, board
  view, action block, Sidekick skill.
- The live test passed; `boards:read` is enough. The test automation is
  deleted and the welcome-page fix is live. Left from `DEPLOY-PROMPTS.md`
  step 7: the title query (7c) and Palo Alto (7d).
- The privacy, terms and pricing pages are live, and the association file
  lists the client id.
- Submitted to the marketplace on 28 Sep.
- **Next:** the review-board invitation; the pricing version once the
  Pricing & Plans tab appears. Optional: the title query
  (`DEPLOY-PROMPTS.md` 7c).

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
npm test                         # 53 tests
npm run demo                     # http://localhost:8137/ in demo mode
npm run check:deploy             # what monday code does on push, locally
npm run build && node test/browser/verify-view.mjs   # 32 browser checks; needs Playwright
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
| App ID | 12255778 (created 28 Sep 2026) |
| Client ID | `fb2b51f8128e2fbcc70e02843099902d` (public; it is in every install link) |
| App slug in monday | `sametatesen2s-team-company_automation-inventory`, fixed at creation |
| First version | v1, draft, version id 18319002; code pushed 28 Sep (deployment `ebb3e-service-36993937-d7d03ea4.eu.monday.app`) |
| Live URL | `https://live1-service-36993937-d7d03ea4.eu.monday.app` (v1 promoted 28 Sep 2026; v2 promoted the same day) |
| Live version | v2, version id 18319401, deployment `a8e21-service-36993937-d7d03ea4.eu.monday.app`; v1 is now "Kullanımsız" (unused) |
| Slug on atesensoftware.com | `automation-inventory` |
