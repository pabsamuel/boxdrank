# Progress

**2 / 29 done: 7%.** Recompute this line whenever a box changes, and put the
percentage at the end of every reply to Samet.

Order matters. Gate 0 can stop the project; nothing after it is worth doing
until it passes.

## Gate 0: kill checks (cheap, before building)

- [x] 1. `board_automations` verified live, older automations included.
      Samet's playground run, 28 Sep 2026: board 5104569213 returned one
      normal and one legacy automation (`SPEC.md`).
- [ ] 2. Marketplace search for apps that already list, search or map
      automations.
      - Record names, what each does, and install/review counts exactly as
        shown, dated.
      - Samet or a delegated agent does the browsing; nothing is invented.
- [ ] 3. monday's own automations page, looked at on Samet's account.
      - Can it show every board's automations at once?
      - What does its search find?
      - Get screenshots.
      - Patrick calls its search "weak"; see it first-hand.
- [ ] 4. Run statistics in the playground, API version `2026-07`:
      - `account_triggers_statistics_by_entity_id(run_status: failure)`
      - `trigger_events(filters: {automationIds: [...]})`
      - Record the real JSON shape, the time window covered and any
        permission error.
- [ ] 5. Gate decision written in `DECISIONS.md`: go, or stop and why.
      Bound by the results of 2–4, not renegotiated afterwards.

## Setup (Samet)

- [ ] 6. Name chosen: 30 characters at most, no "monday", no marketplace clash.
- [ ] 7. App created in the Developer Center. App ID and client id recorded
      in `README.md`. "New OAuth Flow" left off.
- [ ] 8. Feature type chosen from the Developer Center's current list: board
      view, or something account-wide if one exists.

## Build

- [x] 9. Inventory core: board-by-board fetch including legacy automations,
      list, counts, search. In `seed/`, 5 tests passing.
- [ ] 10. App skeleton:
      - [ ] server serving `/view/` and `/health`
      - [ ] esbuild build
      - [ ] demo mode with invented data
      - [ ] tests running
- [ ] 11. Board view: the list, search, reading progress, a warning for
      unreadable boards.
- [ ] 12. Filters: on/off, has a warning, older type, board, creator.
- [ ] 13. Run statistics on each row. Only if Gate 0 item 4 shows the data
      exists.
- [ ] 14. "Open on its board" link. The URL is taken from Samet's browser,
      not guessed.
- [ ] 15. Sidekick tool with a "Find automations" action block.
      - [ ] JWT checked with the Signing Secret, `exp` and `aud`.
      - [ ] Errors returned as 4xx with `severityCode: 4000`.
- [ ] 16. Light, dark and night themes; viewer message;
      `valueCreatedForUser`; plan gating with `openPlanSelection`.
- [ ] 17. Tests covering 11–16.

## Deploy

- [ ] 18. On monday code: `MONDAY_SIGNING_SECRET` set, then redeployed (secrets
      are read at boot), version promoted to live.
- [ ] 19. Tested live on Samet's account:
      - [ ] The list includes his legacy automation.
      - [ ] The Sidekick action block run in a board automation succeeds.

## Listing and legal

- [ ] 20. Privacy policy and terms at `atesensoftware.com/<slug>/`.
      Every sentence checked against the code.
- [ ] 21. Client id added to `monday-app-association.json`.
- [ ] 22. `LISTING.md`: name, short and long description, keywords,
      categories.
- [ ] 23. App icon, app card, 3–5 gallery images, 30–60 s video.
- [ ] 24. How-to-use page.
- [ ] 25. `SECURITY-ANSWERS.md`, with SSL Labs and malware-check evidence.

## Submission

- [ ] 26. `SUBMISSION.md`: every form field answered from the repository.
- [ ] 27. Form submitted by Samet.
- [ ] 28. Pricing version submitted, once the Pricing & Plans tab appears.
- [ ] 29. Approved by monday.
