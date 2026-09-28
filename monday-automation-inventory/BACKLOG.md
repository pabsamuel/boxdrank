# Backlog

One line per idea: date, idea, why it is parked.

- 28 Sep: Switch automations on or off from the list. Only the `dev` preview API can (`activate_live_workflow`); it is not in any stable version, and legacy automations can never be switched.
- 28 Sep: Dominoes map: which automation sets off which, from `workflow_blocks`. Their JSON shape is undocumented, so collect real samples first.
- 28 Sep: Export the list as CSV, for agencies and audits. Not asked for by anyone yet.
- 28 Sep: Bulk delete of unused automations with `delete_board_automation` (stable). Risky, needs a write scope, and nobody has asked for it.
- 28 Sep: Change an automation's owner before someone leaves: `change_live_workflow_owner`, `dev` only. Watchdog's offboarding pain.
