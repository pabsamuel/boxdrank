# Updates Inbox: problem and draft MVP

## The problem: Patrick Fallon, BotSquad, email of 26 Sep 2026

> "to me the biggest pain point around monday updates is that they're siloed
> within individual items. Sure, you can get notified and find the update
> that way, but it means all your many, many conversations are trapped inside
> individual items. That's obviously great for giving specific context to a
> conversation, but it makes keeping track of everything across many items,
> many boards, and many workspaces really, really difficult. If there was a
> way to have an inbox showing all updates that was filterable and easily
> searchable, I think that's something people would genuinely pay for."

## Draft MVP. Not to be built before Gate 0 says GO

Each line here is an ASSUMPTION about what users want until check 4 says
otherwise.

1. One list of updates across the boards the user can see, newest first.
   Each row: who, when, item, board, the text, its reply count, and "Open
   item ↗" (`Item.url`).
2. Search across the text of updates and replies.
3. Filters: board, author, date range, "mentions me", "has no reply".
4. A Sidekick tool, "find updates about …", since monday accepts only apps
   with an AI capability (FACT, submission form, 28 Sep 2026).
5. An Object (left menu) and a board view, like Automation Inventory.

Read-only. Scopes `boards:read` and `updates:read`, and nothing that writes.
Whether to store anything (for example, an index for faster search) is a
decision for after the gate. Storing nothing is simpler to review and to
explain.
