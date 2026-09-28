# Progress

**18 / 30 done: 60%.** Recompute this line whenever a box changes, and put the
percentage at the end of every reply to Samet.

Order: Gate 0 decides whether the listing and the submission get done.
- Building went first, on 28 Sep. The code was mostly Watchdog's and cost
  hours, not days (`DECISIONS.md`).
- The listing, legal pages, assets and review are the expensive part, and they
  wait for the gate.

## Gate 0: kill checks. Exact steps in `GATE0.md`

- [x] 1. `board_automations` verified live, older automations included.
      Samet's playground run, 28 Sep 2026: board 5104569213 returned one
      normal and one legacy automation (`SPEC.md`).
- [x] 2. Competitors in the marketplace (`COMPETITORS.md`, 28 Sep).
      - None of about 980 apps lists automations across boards.
      - The real competitor is monday's own **Autopilot hub**.
- [x] 3. monday's **Autopilot hub**, seen on Samet's account (28 Sep).
      - No full list, no automation search, no on/off, rows link nowhere.
      - The older automation is shown with generic words.
      - `COMPETITORS.md`.
- [x] 4. Run statistics in the playground (28 Sep): account totals only;
      per-automation answers came back empty (`PLATFORM-FACTS.md`).
- [x] 5. Gate decision: **GO** (`DECISIONS.md`, 28 Sep).

## Setup (Samet)

- [ ] 6. Name chosen: 30 characters at most, no "monday", no marketplace
      clash. Change it in `src/core/brand.js` and `src/app/index.html`.
- [ ] 7. App created in the Developer Center. App ID and client id recorded
      in `README.md`. "New OAuth Flow" left off.
- [x] 8. Feature types: **Object** and **Board view**, both pointing at the
      same page.
      - FACT (`apps/docs/app-features`, `custom-objects`, read 28 Sep): an
        Object "lives independently in the left-pane menu … outside the
        context of a specific dashboard, board, or item". That fits a list of
        the whole account.
      - The Administration view was left out: it is for account admins only.
      - Nothing in the page depends on a board, so both features serve it.

## Build

- [x] 9. Inventory core: board-by-board fetch, list, counts, search. From
      Watchdog.
      - Older automations are parsed from the **real** answer shape
        (28 Sep).
      - They are named from the board's columns, status labels and groups,
        and shown like any other.
- [x] 10. App skeleton: server with `/health` and `/view/`, security
      headers, setup mode, esbuild build, demo mode, `check:deploy`, CI
      workflow.
- [x] 11. Board view: the list, search, reading progress, a warning for
      unreadable boards, demo mode for the listing's demo link.
- [x] 12. Filters: switched off, with a warning, board. Filtering by creator
      is in `BACKLOG.md`: it needs `users:read`.
- [x] 13. Run statistics on each row: **dropped**. Gate 0 item 4 showed that
      the API gives no per-automation counts.
- [x] 14. "Open board ↗" on each row.
      - FACT: `Board.url` (schema 2026-07) and `openLinkInTab`
        (`apps/docs/mondayexecute`).
      - Only https monday.com URLs are opened (`safeBoardUrl`).
      - It opens the board; the automations are under Automate there. monday
        documents no URL for a board's automations page.
- [x] 15. Sidekick tool route `POST /monday/sidekick/find`.
      - Inputs `search` and `board_name`; outputs `summary`, `match_count`,
        `total_count`, `checked_boards`.
      - Signing-secret JWT with `exp` and `aud` checks.
      - Errors are 4xx with `severityCode: 4000`.
      - 8-second budget; plan gating.
- [x] 16. Light, dark and night themes; viewer message;
      `valueCreatedForUser`; a welcome page the first time, which is the
      onboarding monday's review asks for.
- [x] 17. Tests:
      - 52 unit and HTTP tests (`npm test`);
      - 28 browser checks inside a fake monday and as the demo
        (`test/browser/verify-view.mjs`).

## Deploy (Samet, `PLAYBOOK.md` steps 1–6; ready-to-paste in `DEPLOY-PROMPTS.md`)

- [ ] 18. First push, promote, Live URL recorded; `APP_BASE_URL` set;
      `MONDAY_SIGNING_SECRET` set; redeployed. `/health` shows
      `"sidekick":"on"`.
- [ ] 19. On a draft:
      - [ ] Object and board view, both at `<Live URL>/view/`;
      - [ ] action block with both builder switches on;
      - [ ] Sidekick tool;
      - [ ] draft promoted.
- [ ] 20. Tested live on Samet's account:
      - [ ] the list includes his older automation;
      - [ ] the action block run in a board automation succeeds;
      - [ ] the test automation is deleted.

## Listing and legal (waits for Gate 0)

- [ ] 21. Privacy policy and terms at `atesensoftware.com/automation-inventory/`.
      - The text is written (`PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md`,
        28 Sep), each sentence checked against the code.
      - Not published: the site is moving to Cloudflare (`REUSE.md`).
- [ ] 22. Client id added to `monday-app-association.json`.
- [x] 23. `LISTING.md`: name (working; Samet confirms), short description
      (55 characters), long description (1,465), keywords, categories, and a
      proposed price for Samet.
- [x] 24. Listing images and video in `listing/` (28 Sep), made by
      `scripts/make-listing.js` and `scripts/make-listing-video.js` from the
      real app on the demo account.
      - App icon and developer icon, 192×192. The developer icon is the same
        as Watchdog's.
      - App card, 592×348.
      - 4 gallery images, 1920×960.
      - Video: 41.5 s, 1920×1080, H.264, 5.6 MB.
- [x] 25. How-to-use page at `/view/how-to.html`.
      - It has installation, prerequisites, first use, filters, sidekick and
        data sections.
      - Three real screenshots of the demo account, made by
        `scripts/make-assets.js`.
      - FACT (`documentation-and-support`, read 28 Sep): the page must include
        "images and videos to support your app".
- [ ] 26. `SECURITY-ANSWERS.md`.
      - Written 28 Sep.
      - Evidence that needs the Live URL is marked PENDING: scan, SSL Labs,
        Palo Alto, scope confirmation, auth-code screenshot.

## Submission

- [ ] 27. `SUBMISSION.md`.
      - All 42 fields written 28 Sep.
      - App ID, links and the install link are PENDING until the app
        exists.
- [ ] 28. Form submitted by Samet.
- [ ] 29. Pricing version submitted, once the Pricing & Plans tab appears.
- [ ] 30. Approved by monday.
