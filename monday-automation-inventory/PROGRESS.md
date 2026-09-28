# Progress

**8 / 30 done: 27%.** Recompute this line whenever a box changes, and put the
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
- [ ] 8. Feature type confirmed from the Developer Center's current list.
      The code is a board view; if something account-wide exists, check it
      first.

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
- [ ] 14. "Open on its board" link. The URL is taken from Samet's browser,
      not guessed. Until then the view says where to go.
- [x] 15. Sidekick tool route `POST /monday/sidekick/find`.
      - Inputs `search` and `board_name`; outputs `summary`, `match_count`,
        `total_count`, `checked_boards`.
      - Signing-secret JWT with `exp` and `aud` checks.
      - Errors are 4xx with `severityCode: 4000`.
      - 8-second budget; plan gating.
- [x] 16. Light, dark and night themes; viewer message;
      `valueCreatedForUser`.
- [x] 17. Tests:
      - 47 unit and HTTP tests (`npm test`);
      - 21 browser checks inside a fake monday and as the demo
        (`test/browser/verify-view.mjs`).

## Deploy (Samet, `PLAYBOOK.md` steps 1–6)

- [ ] 18. First push, promote, Live URL recorded; `APP_BASE_URL` set;
      `MONDAY_SIGNING_SECRET` set; redeployed. `/health` shows
      `"sidekick":"on"`.
- [ ] 19. On a draft:
      - [ ] board view at `<Live URL>/view/`;
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
- [ ] 25. How-to-use page, and a welcome page before first use (Watchdog
      had both; monday's review asks for onboarding).
- [ ] 26. `SECURITY-ANSWERS.md`, with SSL Labs and malware-check evidence.

## Submission

- [ ] 27. `SUBMISSION.md`: every form field answered from the repository.
- [ ] 28. Form submitted by Samet.
- [ ] 29. Pricing version submitted, once the Pricing & Plans tab appears.
- [ ] 30. Approved by monday.
