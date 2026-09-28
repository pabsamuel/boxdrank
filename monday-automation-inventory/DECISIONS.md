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

## Pending, for Samet

- **Name**: at most 30 characters, no "monday".
  - Candidates: *Automation Inventory*, *Automation Map*, *Automation Finder*.
  - Check the marketplace for clashes first (UNKNOWN).
- **Price**: see `SPEC.md` → Pricing.
