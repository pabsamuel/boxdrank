# Progress

**23 / 30 done: 77%.** Recompute this line whenever a box changes, and put the
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

- [x] 6. Name: **Automation Inventory**. Price: **$1 per seat per month,
      14-day trial.** Both chosen 28 Sep at Samet's request (`DECISIONS.md`).
- [x] 7. App created, 28 Sep (Claude-in-Chrome, no secret opened).
      - App ID 12255778, client id `fb2b51f8128e2fbcc70e02843099902d`.
      - Scope `boards:read` only; "New OAuth Flow" off; no redirect URL.
      - v1 draft, version id 18319002.
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
      - 53 unit and HTTP tests (`npm test`);
      - 32 browser checks inside a fake monday and as the demo
        (`test/browser/verify-view.mjs`).

## Deploy (Samet, `PLAYBOOK.md` steps 1–6; ready-to-paste in `DEPLOY-PROMPTS.md`)

- [x] 18. Live and configured, 28 Sep.
      - First push, promote, Live URL recorded.
      - `APP_BASE_URL` set; `MONDAY_SIGNING_SECRET` set by Samet himself;
        redeployed (security scan 0 findings again).
      - Checked from here: `/health` answers
        `{"ok":true,"billing":"off","sidekick":"on"}`; an unsigned or
        `alg: none` request to the Sidekick route gets 401; `/view/` answers
        200.
      - First push done (28 Sep): version 18319002, deployment URL
        `ebb3e-service-36993937-d7d03ea4.eu.monday.app`.
      - The security scan found nothing (0 errors, 0 warnings).
      - Checked from here: setup mode names the two missing settings; the
        page, how-to page, images and demo data answer 200; the Sidekick
        route answers 503.
      - v1 promoted to live on 28 Sep. Live URL `https://live1-service-36993937-d7d03ea4.eu.monday.app`.
      - `MONDAY_SIGNING_SECRET` entered by Samet himself.
- [x] 19. v2 (version id 18319401) with all four features, live 28 Sep.
      - [x] Object and board view, both at `<Live URL>/view/`;
      - [x] action block "Find automations" with both builder switches on;
      - [x] Sidekick skill;
      - [x] code pushed to v2 (security scan 0 findings, deployment
            `a8e21-service-36993937-d7d03ea4.eu.monday.app`);
      - [x] promoted by Samet: v2 "Canlı", v1 "Kullanımsız".
      - Checked from here after the promote: the Live URL's `/health` reads
        `{"ok":true,"billing":"off","sidekick":"on"}`; `/view/` and
        `/view/how-to.html` answer 200; an unsigned request to the Sidekick
        route gets 401.
- [x] 20. Tested live on Samet's account, 28 Sep (Claude-in-Chrome, 10
      screenshots; details in `PLATFORM-FACTS.md`).
      - [x] Shared ("Tüm hesaplar") and installed; one permission asked,
            "Read all of your boards data". **`boards:read` is enough.**
      - [x] The Object lists all 5 automations on 3 boards (8 boards
            read), the older one included, as "When Status changes to Bitir
            move item to Group Title".
      - [x] Filters, search, "Open board ↗", the board view and the dark
            theme work.
      - [x] The action block in a board automation: "Success", 9 s; the
            log says `6 of 6, 8 boards`.
      - [x] The test automation is deleted (Samet, 28 Sep; the Chrome agent
            will not delete permanently).
      - Found:
        - monday's own API titles can lack spaces ("assignitemcreator
          asperson"). The app shows them as sent. Playground check pending
          (`DEPLOY-PROMPTS.md` step 7).
        - Behind the welcome page, the page was redrawn on every board read,
          so a click on "Show my automations" could be lost. Fixed 28 Sep,
          with a browser check that fails on the old code. Pushed to v2 by
          Samet (scan 0 findings); the Live URL's `main.js` is byte for byte
          this build.
        - Once, the filters stopped answering clicks; a reload fixed it.
          Cause UNKNOWN; not reproduced.

## Listing and legal (waits for Gate 0)

- [ ] 21. Privacy policy and terms at `atesensoftware.com/automation-inventory/`.
      - The text is written (`PRIVACY_POLICY.md`, `TERMS_OF_SERVICE.md`,
        28 Sep), each sentence checked against the code.
      - Built as HTML (privacy, terms, pricing) by
        `../atesensoftware-site/build.mjs` into
        `../atesensoftware-site/public/automation-inventory/`, in the same
        format as Watchdog's live pages.
      - Not published yet: the live site is deployed from Samet's computer,
        so the site session must run there (`DEPLOY-PROMPTS.md` step 8). Its
        first try, 28 Sep, ran in the cloud and could do nothing.
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
      - Scope confirmed live, and the Live URL filled in, 28 Sep.
      - SSL Labs on the Live URL: A+ on all four endpoints, 28 Sep.
      - Still PENDING: Palo Alto on the Live URL (`DEPLOY-PROMPTS.md` 7d),
        and the client id in the association file.
      - The auth-code screenshot is done (`listing/auth-code.png`).

## Submission

- [ ] 27. `SUBMISSION.md`.
      - All 42 fields written 28 Sep.
      - App ID, links and the install link are PENDING until the app
        exists.
- [ ] 28. Form submitted by Samet.
- [ ] 29. Pricing version submitted, once the Pricing & Plans tab appears.
- [ ] 30. Approved by monday.
