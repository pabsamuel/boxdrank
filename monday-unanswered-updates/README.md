# Unanswered Updates

A monday.com marketplace app: one list, across every board the user can see,
of item updates nobody has answered. "Mine" first: the questions I asked that
are still waiting. monday's AI assistant can ask it too, through a Sidekick
tool.

**Status, 8 Oct 2026: Gate 0 GO (weak); built and tested offline; not yet
created in the Developer Center. 9 / 25 = 36%** (`PROGRESS.md`).
- Name and price decided by Samet: Unanswered Updates, $1/seat/month,
  Optimized, 14-day trial (`DECISIONS.md`).
- The code is Automation Inventory's, adapted: 66 unit tests, 50 browser
  checks, deploy check clean.
- **Next:** the live check of three assumptions (`PLAYGROUND.md`), then
  `DEPLOY-PROMPTS.md` steps 1–6.

Origin: the Updates Inbox Gate 0 (2 Oct) found that monday covers "all
updates" and "mentions of me I didn't answer", but nothing documented covers
"threads nobody answered, across boards" (`../monday-updates-inbox/COMPETITORS.md`).

## How it works

| Part | File | What it does |
|---|---|---|
| The page (an Object and a board view) | `src/app/main.js`, `src/app/index.html` | Reads the last 30 days of updates with the user's own session, and lists the unanswered ones: Mine, Mentioning me, All. Age, board, author and search filters. "Reply ↗" opens the item's updates in monday. Themes, viewer message, a welcome page the first time. Opened outside monday it shows an invented demo account |
| The rule | `src/core/unanswered.js` | Answered = a reply from someone other than the author, or a newer update on the same item by someone else. Mentions parsed from the update's HTML. Pure functions |
| How-to page | `src/app/how-to.html`, `src/app/assets/` | The page monday's review asks for, with three screenshots from `scripts/make-assets.js` |
| Sidekick tool | `src/server/sidekick.js` | `POST /monday/sidekick/unanswered`: scope (mine, mentions, all), days, board name; answers in words |
| Server | `src/server/app-server.js`, `scripts/serve-monday.js` | Serves `/view/` and the demo data, and checks each Sidekick request (signing-secret JWT, expiry, audience). Setup mode until `APP_BASE_URL` and `MONDAY_SIGNING_SECRET` exist |
| monday API | `src/app/monday-source.js` | The root `updates` query on API version `2026-10`, 100 per page |

There is no OAuth, no stored token, no email and no scheduled job. Nothing
runs without a user present, and nothing is stored.

## Commands

```
npm install
npm test                         # 66 tests
npm run demo                     # http://localhost:8137/ in demo mode
npm run check:deploy             # what monday code does on push, locally
npm run build && node test/browser/verify-view.mjs   # 50 browser checks; needs Playwright
node scripts/make-assets.js      # re-renders the how-to screenshots; needs Playwright
```

## Files

| File | What it holds |
|---|---|
| `CLAUDE.md` | Operating rules. Read every session |
| `PROGRESS.md` | The checklist and the percentage |
| `GATE0.md` | The kill checks, the rules fixed before the results, and the result |
| `SPEC.md` | Who asks for what, and the MVP |
| `PLAYGROUND.md` | The live check of the three assumptions, as a ready prompt |
| `DEPLOY-PROMPTS.md` | Steps 1–6 as ready-to-paste Chrome prompts and PowerShell commands |
| `PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md` | The legal pages' text, written from the code |
| `DECISIONS.md` | What was decided, by whom, when |
| `COMPETITORS.md` | Native features, monday AI, marketplace, demand |
| `PLATFORM-FACTS.md` | The updates API and other monday facts, with sources |

## Related

- **Automation Inventory**, `../monday-automation-inventory/`: app 12255778,
  submitted 28 Sep 2026. The code here came from it. Do not change it from
  here.
- **Automation Watchdog**, `../monday-automation-watchdog/`: app 12249756,
  submitted 28 Sep 2026. Do not change it from here.
- **Website**, `../atesensoftware-site/`: `atesensoftware.com`, shared by all
  apps: legal pages, pricing page, domain proof. Deployed from Samet's PC.

## Facts to fill in once they exist

| | |
|---|---|
| App name | Unanswered Updates |
| App ID | — |
| Client ID | — |
| Live URL | — |
| Slug on atesensoftware.com | `unanswered-updates` |
