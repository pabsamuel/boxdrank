# Progress

**9 / 25 done: 36%.** Recompute this line whenever a box changes, and put the
percentage at the end of every reply to Samet.

Order, as on Automation Inventory: the code first (mostly reused, hours not
days), then the live checks, then the listing and the submission.

## Gate 0: kill checks. Exact steps in `GATE0.md`

- [x] 1. API: passes on what is known; two UNKNOWNs left for a live run
      (now item 9).
- [x] 2. Native monday features: only mentions of the user.
- [x] 3. monday AI: close, but not out of the box.
- [x] 4. Marketplace: none found. Demand: 7 distinct people, all about their
      own mentions.
- [x] 5. Gate decision: GO (weak), by the rules in `GATE0.md`.

## Decided (Samet)

- [x] 6. Build now. Name **Unanswered Updates**; **$1/seat/month,
      Optimized, 14-day trial** (8 Oct 2026, `DECISIONS.md`).

## Build

- [x] 7. The app, from Automation Inventory's code (8 Oct 2026):
      - root `updates` query, schema-checked on 2026-07 and 2026-10, pinned to
        2026-10; the last 30 days, 100 per page, up to 30 pages;
      - the rule: answered = a reply from someone other than the author, or a
        newer update on the same item by someone else;
      - board view: Mine (default), Mentioning me, All; age, board, author and
        search filters; Reply (`openItemCard` on its updates) and Open item;
        welcome page, themes, viewer message, demo account;
      - Sidekick tool `POST /monday/sidekick/unanswered`: inputs `scope`,
        `days`, `board_name`; outputs `summary`, `unanswered_count`,
        `checked_updates`; "mine" is the JWT's `userId`; 8-second budget,
        10 pages at most; billing gate;
      - how-to page with three screenshots from the real view.
- [x] 8. Tests: 66 unit and HTTP tests (`npm test`); 50 browser checks inside
      a fake monday and as the demo (`test/browser/verify-view.mjs`);
      `npm run check:deploy` clean.
- [ ] 9. Live check of the three assumptions (`PLAYGROUND.md`): mention HTML,
      automation-written updates, nested fields at the root. Fix the code if
      any differs.

## Setup and deploy (`DEPLOY-PROMPTS.md`)

- [ ] 10. App created in the Developer Center: scopes `boards:read`,
      `updates:read`, `users:read`; "New OAuth Flow" off.
- [ ] 11. First deploy, v1 promoted, Live URL.
- [ ] 12. Signing secret (Samet) and `APP_BASE_URL`; `/health` reads
      `{"ok":true,"billing":"off","sidekick":"on"}`.
- [ ] 13. Features on a new draft: Object, Board view, action block "Find
      unanswered updates", Sidekick tool; code pushed to the draft; promoted.
- [ ] 14. Installed and tested live: the view, Reply, the action block run
      ("Success"), the log line.

## Legal, site and evidence

- [x] 15. Privacy policy and terms written from the code (`PRIVACY_POLICY.md`,
      `TERMS_OF_SERVICE.md`), 8 Oct 2026. Samet reads them before they go up.
- [ ] 16. Site: privacy, terms and pricing pages live on atesensoftware.com;
      the association file lists the new client id.
- [ ] 17. Security evidence: SSL Labs, Palo Alto, `SECURITY-ANSWERS.md`.

## Listing and submission

- [ ] 18. Listing texts (`LISTING.md`).
- [ ] 19. Listing images and video (`listing/`).
- [ ] 20. Submission answers (`SUBMISSION.md`).
- [ ] 21. Submission form filled (Chrome) and submitted (Samet).

## After submission

- [ ] 22. Pricing version submitted, when the Pricing & Plans tab appears
      (`../monday-billable-hours/PRICING-VERSION.md`).
- [ ] 23. Review feedback answered.
- [ ] 24. Approved and published.
- [ ] 25. Billing enforced once the price is approved (`APP_BILLING=enforce`).

## Watch, not counted

- The first 30 days of installs: does anyone use "All", or only "Mine"? That
  decides whether the manager view stays.
- A user report of a wrong "unanswered": the answered rule.
- monday shipping the same as an agent template: the weak-GO risk in
  `GATE0.md`.
