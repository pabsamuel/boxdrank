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

**Open, for Samet: does Watchdog keep its "All automations" tab?**
- State on 28 Sep:
  - The tab was built into Watchdog: commits `bb5ecaf`, `23fcca6`, and the
    docs commit after them.
  - It was pushed to the repository but **never deployed**. Live Watchdog
    (v4, 18317118) does not have it.
- If it stays, this app sells what Watchdog gives away.
- Removing it means reverting those three commits in Watchdog. Samet decides.

## 28 Sep 2026: the MVP does not switch automations on or off

- FACT (schema, 28 Sep): no stable API version can. Only the `dev` preview
  has `activate_live_workflow` / `deactivate_live_workflow`.
- FACT: legacy automations can never be switched, by the schema's own
  statement.
- The app shows the state and links to the board. Revisit when a stable
  version adds the mutation.

## Pending, for Samet

- **Name**: at most 30 characters, no "monday".
  - Candidates: *Automation Inventory*, *Automation Map*, *Automation Finder*.
  - Check the marketplace for clashes first (UNKNOWN).
- **Price**: see `SPEC.md` → Pricing.
