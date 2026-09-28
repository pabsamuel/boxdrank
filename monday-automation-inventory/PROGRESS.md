# Progress

**11 / 30 done: 37%.** Recompute this line whenever a box changes, and put the
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
- [ ] 2. Competitors in the marketplace, with exactly what their listings
      show.
- [ ] 3. monday's own automations page, seen on Samet's account, with
      screenshots.
- [ ] 4. Run statistics in the playground: the real JSON shape, the period
      covered, the permission needed.
- [ ] 5. Gate decision written in `DECISIONS.md`: go, or stop and why.

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

- [x] 9. Inventory core: board-by-board fetch including older automations,
      list, counts, search. From Watchdog.
- [x] 10. App skeleton: server with `/health` and `/view/`, security
      headers, setup mode, esbuild build, demo mode, `check:deploy`, CI
      workflow.
- [x] 11. Board view: the list, search, reading progress, a warning for
      unreadable boards, demo mode for the listing's demo link.
- [x] 12. Filters: switched off, with a warning, older type, board. Filtering
      by creator is in `BACKLOG.md`: it needs `users:read`.
- [ ] 13. Run statistics on each row. Only if Gate 0 item 4 shows the data
      exists.
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
      - 49 unit and HTTP tests (`npm test`);
      - 29 browser checks inside a fake monday and as the demo
        (`test/browser/verify-view.mjs`).

## Deploy (Samet, `PLAYBOOK.md` steps 1–6)

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

- [ ] 21. Privacy policy and terms at `atesensoftware.com/<slug>/`. Every
      sentence checked against the code.
- [ ] 22. Client id added to `monday-app-association.json`.
- [ ] 23. `LISTING.md`: name, descriptions, keywords, categories.
- [ ] 24. App icon, app card, 3–5 gallery images, 30–60 s video.
- [x] 25. How-to-use page at `/view/how-to.html`.
      - It has installation, prerequisites, first use, filters, sidekick and
        data sections.
      - Three real screenshots of the demo account, made by
        `scripts/make-assets.js`.
      - FACT (`documentation-and-support`, read 28 Sep): the page must include
        "images and videos to support your app".
- [ ] 26. `SECURITY-ANSWERS.md`, with SSL Labs and malware-check evidence.

## Submission

- [ ] 27. `SUBMISSION.md`: every form field answered from the repository.
- [ ] 28. Form submitted by Samet.
- [ ] 29. Pricing version submitted, once the Pricing & Plans tab appears.
- [ ] 30. Approved by monday.
