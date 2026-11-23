# Gate 0: kill checks for Unanswered Updates

> **Result, 8 Oct 2026: GO, by the rules written before the results. It is a
> weak GO.** (`COMPETITORS.md`)
> - Rule 1, native: not triggered. Every native "didn't reply" view covers
>   only mentions of the user.
> - Rule 2, monday AI: not triggered, but close. The agent templates cover
>   mentions of you, your own tickets, and disputed invoices.
> - Rule 3, marketplace: not triggered. None was found; the marketplace
>   could not be crawled fully.
> - Rule 4, API: passes on what is known (root `updates` with `replies`).
>   UNKNOWN: whether automation-written updates can be told apart, and
>   whether results are limited to the user's boards.
> - Demand: 7 distinct people, more than the 3 required. All of them ask
>   about **their own mentions**, with 0–2 votes each.
> - What makes it weak: low demand, and monday could ship the same thing as
>   an agent template. Neither changes the result; both shape the scope
>   (`SPEC.md`).

The idea, from the Updates Inbox research of 2 Oct
(`../monday-updates-inbox/BACKLOG.md`):
- One list, across every board the user can see, of item updates that nobody
  has replied to for N days.
- For managers and account managers: the client question or teammate request
  that fell through the cracks.

## Decision rules, fixed before the results (never renegotiated after)

**NO-GO** if any of these holds:
1. **A native monday feature does it.** It lists updates without a reply
   across boards, for any user, not only "mentions of me that I didn't
   answer" (which the Inbox, Search Everything and the "I Was Mentioned"
   widget already cover).
2. **monday's AI does it out of the box.** An official AI agent template or a
   documented sidekick feature finds or follows up unanswered updates across
   boards.
3. **A marketplace app does it.** It works and is maintained: listing updated
   or reviewed in the last 12 months.
4. **The API cannot tell.** It cannot say, for updates across the account,
   whether they have replies, who wrote them and when.

**GO** needs all of these:
- none of the above;
- demand from at least three distinct people in public threads, asking to
  find unanswered or no-reply updates or comments across items or boards.

The updates-inbox gate was NO-GO on rule 1 (`../monday-updates-inbox/GATE0.md`).
This idea is narrower on purpose. It does not get to reuse that gate's
research as a pass.

## 1. API (mostly known)

FACT (`PLATFORM-FACTS.md`, 2 Oct 2026): the root `updates` query returns all
of the account's updates, newest first, with `replies`, `creator_id`,
`created_at` and `item`, 100 per page, filterable by date.

UNKNOWN, needs a live run:
- whether updates written by automations can be told apart, by
  `creator_id` or `creator`;
- whether the root query is limited to the token user's boards.

## 2–4. Native, AI, marketplace, demand (research)

Results go to `COMPETITORS.md`.
