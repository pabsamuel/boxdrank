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
2. Filters: board, age (N days, or any age), author, and a search over the
   text, item, board and people. Search was added while building (8 Oct): it
   is a box on the same rows, and Automation Inventory has one.
3. **Answered** means a reply from someone other than the author, **or a
   newer update on the same item by someone else**. The second half was added
   while building (8 Oct, INFERENCE): people often answer with a new update
   instead of a reply, and calling those threads unanswered would bury the
   real ones. A follow-up by the author does not count; nor does a like.
4. Leaves out updates written by automations, once the live run shows how to
   tell them apart (UNKNOWN; for now, updates with no person as author).
5. A Sidekick tool: "which of my updates are still unanswered?". monday
   accepts only apps with AI.
6. An Object and a board view, as in Automation Inventory, whose code is
   reused.

Read-only. Scopes `boards:read`, `updates:read` and `users:read`
(`PLATFORM-FACTS.md`). Stores nothing. Reads the last 30 days.
