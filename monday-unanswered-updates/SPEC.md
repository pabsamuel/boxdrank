# Unanswered Updates: scope, shaped by the Gate 0 evidence

## Who asks, and what (`COMPETITORS.md` §4)

People ask "which of the questions **I** asked, or the people I @mentioned,
got no answer?", across hundreds of updates. Nobody in the evidence asks for
a manager's view of everyone's updates. The MVP serves the first and only
offers the second.

## MVP (ASSUMPTION until users say otherwise)

1. A list of updates with **no reply** after N days (default 2) across the
   boards the user can see, newest first.
   - Each row: who wrote it, when, whom it mentions, item, board, and "Open
     item ↗".
   - **Default view: "Mine"**, the updates I wrote, including those where I
     @mentioned someone.
   - Other views: "Mentioning me" (overlaps monday's buggy widget), and "All"
     (the manager view).
2. Filters: board, age (N days), author.
3. Leaves out updates written by automations, once the live run shows how to
   tell them apart (UNKNOWN).
4. A Sidekick tool: "which of my updates are still unanswered?". monday
   accepts only apps with AI.
5. An Object and a board view, as in Automation Inventory, whose code is
   reused.

Read-only. Scopes `boards:read`, `updates:read` and probably `users:read`
for names (to check). Stores nothing.
