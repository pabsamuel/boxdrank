# SPEC: what Automation Inventory is

Written 28 Sep 2026. Every API statement below was read from monday's public
GraphQL schema that day (`api.monday.com/v2/get_schema?format=sdl&version=…`,
versions `2026-07`, `2026-10`, `2027-01` and `dev`), unless it says otherwise.

## The problem, in the words of the person who named it

**FACT**: Patrick Fallon (BotSquad, New Zealand, a monday consultant),
emailing Samet on 27 Sep 2026:

> The big issue with automations in monday is that they are siloed in multiple
> boards, search functionality in the automations centre is weak and it takes a
> lot of automation recipes to do anything (because triggers and actions are
> basic, you often need to set up multiple automations to fire in sequence like
> dominoes). All of this means it's impossible to "see" all your automations in
> one place, hard to find the automation you are looking for, and hard to
> understand how your monday system works as a whole - even if you built every
> single automation yourself.
> This is a much bigger pain point in my opinion than automations breaking when
> the owner gets deactivated.

This is one expert's opinion. Nobody has committed to pay for it. Before 28 Sep
he had not been asked about a price for this idea.

His email names three pains. They set the order of the work:

| # | Pain | What answers it | Stage |
|---|---|---|---|
| 1 | "impossible to see all your automations in one place" | One list across every board the user can see | MVP. The code exists in `seed/` |
| 2 | "hard to find the automation you are looking for" | Search, plus filters: on/off, has a warning, older type, board, creator | MVP. Search exists; filters do not |
| 3 | "hard to understand how your monday system works as a whole", the dominoes | Show which automations set off which others | After the MVP. Feasibility UNKNOWN, see below |

## MVP, the smallest thing worth submitting

1. **All automations list.** Every automation on every board the signed-in
   user can see, including older ("legacy") ones and ones that have never run.
   Each row shows: title, board, on/off, monday's warning (`notice_message`)
   and last changed. Ported from Watchdog; see `seed/`.
2. **Search** that ignores accents and case, across title, board, description,
   warning and state. Ported.
3. **Filters**: on/off, "has a warning", older type, board, and creator
   (`user_id` → name). New.
4. **Open on its board.** A link from each row to that board's automations
   page, so the user can switch it on or off there.
   - UNKNOWN: the URL of that page. Get it from Samet's browser; do not guess.
5. **Sidekick tool.** This is the AI capability, and monday requires one.
   - FACT (submission form, 28 Sep 2026): "monday.com is only accepting apps
     that include AI capabilities. If you proceed with submitting this form
     for an app that does not include AI capabilities, your submission will be
     rejected."
   - Proposed action block: "Find automations". Given a question such as
     "which automations move items to Done?" or "which automations are off?",
     it answers from the list. Watchdog's `/monday/sidekick/check` route is
     the template.
6. **monday basics**: light, dark and night themes; a clear message for
   viewers; `valueCreatedForUser` once the list is shown; plan gating (see
   Pricing).

## What the API allows, and what it does not

**Listing: FACT.**
- `board_automations(ids, board_ids, limit, cursor): AutomationsPage!` exists
  in `2026-10`, `2027-01` and `dev`, **not in `2026-07`** (the current
  default). The version must be passed explicitly.
- `board_ids` takes at most one board.
- `AutomationsPage { cursor items: [BoardAutomation!] legacy_automations: JSON }`.
- `BoardAutomation { id user_id active title description created_at updated_at
  workflow_host_data workflow_blocks workflow_variables importance
  notice_message template_reference_id }`.
- Schema text on `legacy_automations`: "Read-only automations on this board
  that were set up in an older way. These ARE automations on the user's board
  — always list and describe them together with `items`, never omit them. They
  cannot be activated, deactivated, edited, or deleted. Resolved only for
  board-scoped queries (null otherwise); best-effort, so it may carry an error
  marker instead of data."
- **FACT, live, 28 Sep 2026** (Samet's playground run on his test board
  5104569213): one of the board's two automations,
  `When Status changes to Bitir move item to Group Title` (id 186000595),
  came back only in `legacy_automations`. An account-wide query would have
  missed it. That is why `seed/` asks board by board.

**Switching on/off: FACT, not in any stable version.**
- `2026-07`, `2026-10` and `2027-01` have no mutation that activates or
  deactivates an automation. Their only automation mutation is
  `delete_board_automation(id, board_id)`.
- The `dev` (preview) schema has `activate_live_workflow(id)`,
  `deactivate_live_workflow(id)` and `change_live_workflow_owner(...)`.
- UNKNOWN: whether a "live workflow" id is the same as a `BoardAutomation` id.
- UNKNOWN: whether a marketplace app may call `dev`.
- INFERENCE: building a paid feature on a preview API is a bad bet. The MVP
  therefore *shows* on/off and links to the board. It does not toggle.
- Older automations can never be toggled through the API, by the schema's own
  statement.

**Run statistics: FACT, in `2026-07`, so stable.**
- `account_triggers_statistics_by_entity_id(run_status: TriggerEventState!, filters: { board_id, automation_ids, user_ids })`
  returns `automation_statistics: JSON`. The schema describes it as: "each key
  is an automation Id, and the value contains the total count and breakdown by
  error reason".
- `TriggerEventState` is one of `success`, `failure`, `exhausted`.
- `trigger_events(nextPageOffset, filters: { dateRange, automationIds, stateFilter, … })`
  returns individual runs with `eventState`, `errorReason` and
  `triggerStartedAt`.
- `account_trigger_statistics(filters)` returns `{ success failure total }`.
- UNKNOWN: the JSON's exact shape, the time window the statistics cover, the
  scope required, and whether legacy automations appear.
- **This is Gate 0 item 3.** If it works, each row can show "ran 214 times,
  12 failures", which answers pain 3 partly and is something monday's own
  page may not show (UNKNOWN).

**Dominoes (pain 3): feasibility UNKNOWN.**
- `workflow_blocks` and `workflow_variables` are typed `JSON`, so the schema
  does not describe them.
- INFERENCE: if the trigger and action blocks name column ids and values,
  automation A ("set Status to Done") can be linked to automation B ("when
  Status changes to Done"). That needs real samples from several boards
  before any design.
- Legacy automations have only a title. Linking them would mean parsing the
  English sentence, which is fragile.

## Architecture: INFERENCE, to be confirmed while building

- **Board view plus Sidekick tool, hosted on monday code.**
  - The view calls the API from the browser with seamless authentication, as
    Watchdog's view does.
  - The Sidekick action block gets a `shortLivedToken` in a JWT signed with
    the Signing Secret.
- **No OAuth, no stored tokens, no email, no scheduled job** in the MVP.
  - Nothing runs without a user present, so nothing needs a stored token.
  - That means almost no data to declare in the privacy review, and no
    uninstall clean-up. It is a much smaller app than Watchdog.
- UNKNOWN: whether a board view is the best surface for an account-wide list.
  monday has other feature types (dashboard widget, workspace-level views and
  others). Read the current feature list in the Developer Center before
  choosing. A board view is proven to work.
- UNKNOWN: API cost for large accounts. There is one query per board, plus
  pages; an account with 500 boards means 500+ calls.
  - Measure on the biggest account available.
  - Show progress, and let partial results render. The seed already counts
    boards it could not read.

## Pricing: OWNER decides, UNKNOWN until then

- FACT (Watchdog's research, `monday-automation-watchdog/LISTING.md`):
  - monday Monetization is required for new apps.
  - A seat price must be a whole number of USD.
  - Seat-based plans must include a trial.
- Watchdog chose $1/seat/month, Optimized mode, 14-day trial.
- UNKNOWN: whether monday allows feature-based plans (Basic/Pro) inside one
  app. Read `apps/docs/plans-and-pricing` before deciding.

## Not in scope, in `BACKLOG.md`

- Switching automations on or off from the app (needs a stable API).
- Bulk actions of any kind.
- Export to CSV.
- Alerts. That is Watchdog's job; do not rebuild it here.
