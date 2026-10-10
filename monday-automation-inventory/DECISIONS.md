# Decisions

Newest last. A decision is changed only by Samet, and the change gets its own
dated entry.

## 28 Sep 2026: a separate app, built later

**Samet:** "eğer bizim şuan yaptığımız watchdog dan ayrı bi özellik ise bu
patrick in dediği app onu yeni bir app olarak yapalım daha çok para kazanırız",
then "ayrı yapacaz sonra".

The recommendation had been one app with a Pro tier. It was overruled; the
reasons are recorded so they can be revisited on evidence.
- FACT: a new app goes through a full submission of its own: security review,
  listing, video, and an AI capability of its own.
- INFERENCE: two apps split the few early reviews and installs.

What is true either way:
- Watchdog's scope is alerts: automations that stopped acting.
- This app's scope is the map: every automation, findable, understandable.
- They must not both do the same thing.

**Watchdog does not keep its "All automations" tab.**
- Samet, 28 Sep: "sekmeyi çıkar".
- The three commits that added it were reverted in `7ed95e6`.
- The tab was never deployed, so live Watchdog and its submitted listing
  already matched.

## 28 Sep 2026: the MVP does not switch automations on or off

- FACT (schema, 28 Sep): no stable API version can. Only the `dev` preview
  has `activate_live_workflow` / `deactivate_live_workflow`.
- FACT: legacy automations can never be switched, by the schema's own
  statement.
- The app shows the state and links to the board. Revisit when a stable
  version adds the mutation.

## 28 Sep 2026: build first, gate the listing

**Samet:** "zaten bi tane yaptık ya tecrübeliyiz monday app konusunda ordaki
tecrübemizi kullanalım bunda da" (we already built one; use that experience
here).

Gate 0 was written to stop the project before any building. It now stops it
before the listing and the submission instead:
- The code was mostly Watchdog's: server, JWT checks, Sidekick plumbing,
  theme and viewer handling, build and deploy checks, and the inventory
  itself. It took hours, not days.
- The expensive part is what is still ahead: legal pages, images, video,
  security answers and a review cycle.

This was decided before any Gate 0 result existed, so it is not a gate
renegotiated after seeing its result.

What was built (`PROGRESS.md` items 9–17):
- **No OAuth, no stored token, no email, no cron.**
  - The view reads with the user's own session.
  - The Sidekick tool reads with the short-lived token of each request.
  - Nothing is stored, so the privacy and security review has almost nothing
    to ask about.
- Filtering by creator was left out: it needs `users:read`, which is one more
  scope to justify. It is in `BACKLOG.md`.

## 28 Sep 2026: an Object and a board view

- The list covers the whole account, so its natural home is not a board.
- monday's **Object** feature lives in the workspace's left menu, outside any
  board (`apps/docs/custom-objects`).
- The app offers both an Object and a board view, which serve the same page.
- The **Administration view** was not chosen: only account admins could open
  it.

## 28 Sep 2026: Gate 0, early reading (not the decision)

- No marketplace app does this (`COMPETITORS.md`).
- Users do ask for it.
- monday's Autopilot hub covers *failures* across the account, but its
  documentation shows no searchable list of every automation with its on/off
  state.
- The decision waits for Samet's first-hand look at the hub (`GATE0.md`
  item 3). If the hub already does it, stop.

## 28 Sep 2026: Gate 0 passed, GO

Bound by the checks in `GATE0.md`, run the same day:
- **Competitors:** no marketplace app does this.
- **monday's Autopilot hub**, seen first-hand, has:
  - no list of every automation;
  - no automation search;
  - no on/off filter or column;
  - rows that link nowhere;
  - the older automation shown as "When status changes to something move
    item to group". This app names it "When Status changes to Bitir move item
    to Group Title".
- **Run statistics:** per-automation counts came back empty
  (`automation_statistics: {}`, `trigger_events: []` for an automation that
  ran that day). Item 13 is dropped, not built.

What the listing must say is the gap, word for word: every automation, found
by what it does, on or off. What it must not say is that it shows *every*
older automation: monday calls that field "best-effort".

## 28 Sep 2026: name and price, decided by Claude at Samet's request

**Samet:** "sen bul 2sini de sonra devam et" (you pick both, then carry on).

**Name: Automation Inventory.**
- 20 characters, no "monday".
- It says what the app is: a list of every automation, for people who audit
  or look after an account.
- FACT (apps-for-monday.com, a third-party list of the marketplace's about
  980 apps, 28 Sep): no app has this name. One app is called just
  "Inventory"; it tracks stock, so the two are unlikely to be confused. 88
  app names contain "automation", most of them "… Automations" tools that
  run automations rather than list them.
- It is also the name already in the code and in every document, so choosing
  it cost nothing.

**Price: $1 per seat per month, Optimized mode, 14-day trial**, the same as
Watchdog.
- FACT (monday, via Watchdog's research): the seat price must be a whole
  number of USD, and seat-based plans need a trial. So $1 is the lowest paid
  price there is.
- INFERENCE: one price across Samet's apps is easy to explain. This app costs
  nothing to run per account, since it stores nothing and runs only when
  someone opens it or asks sidekick.
- UNKNOWN: whether anyone will pay it. Nobody has been asked. Revisit with
  installs and reviews, not before.
