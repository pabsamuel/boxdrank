# monday Automation Watchdog

Tells you when a monday.com automation that used to fire regularly has gone
quiet — because monday will not.

Status: **core engine built and tested. No monday integration yet.** See
"What is not built" at the bottom.

## The problem

**FACT:** monday **automatically deactivates** an automation when something it
references is deleted — a group, a board, a status label, a user — or when rate
or item limits are hit. **No notification is sent.** One reported case ran
"silently deactivated and stopped firing for weeks".

**FACT:** an automation can show a **green toggle and no error badge while
failing every single run**, because its target no longer exists, its owner's
account was deactivated, or a downstream integration lost authentication.

**FACT:** Slack, Gmail and Salesforce integrations authenticate with OAuth
tokens that **expire roughly every 90 days**. When they do, those automations
fail silently.

**FACT:** *"monday.com does not allow enabling email notifications for automation
failures."* The automation log exists, and most teams never open it.

Open community requests: "Allow Automation Failure Notifications to be Sent by
Email" (t/115526), "Automation Failure Notifications and Reporting" (t/96751).

## Why this shape, and not another audit tool

The previous product in this repository — a board schema auditor — was stopped
because workspace-hygiene apps on this marketplace install in the tens. The
reason is structural: **an audit is run once, acted on, and cancelled.**

A watchdog cannot be cancelled without turning it off. Retention is the product,
not a feature bolted onto it. That is the entire argument for building this one
and not that one.

## The design problem that actually matters

Detecting silence is easy. **Not crying wolf is the product.** A monitor that
raises false alarms is muted within a week, and a muted watchdog is worth
nothing. So the engine spends nearly all of its complexity on restraint:

- **Refuses to judge on thin evidence.** Six firings minimum. Below that it
  reports `insufficient_history` rather than guessing what normal looks like.
- **Measures elapsed time in working days only.** A Friday-evening automation
  that has not fired by Sunday night is not late — those days were never going
  to produce anything. This is the single largest source of weekend false alarms.
- **Excludes a weekday only on evidence.** A day is written off as inactive only
  after coming around at least twice unused. One unused Monday is a public
  holiday; several is a pattern.
- **Uses the 90th percentile of historical gaps, not the maximum.** Otherwise one
  Christmas shutdown in the history widens the tolerance window forever and masks
  every later outage.
- **Has a tolerance floor of two hours.** An automation firing every 30 seconds
  should not raise an alert after 90 seconds of quiet — correct, and useless.
- **Calls a month of silence `dormant`, not an emergency.** Someone who switched
  an automation off three weeks ago does not want a daily reminder.
- **Only asks to send mail when something is genuinely `silent`.** A daily
  "everything is fine" email gets filtered into a folder nobody reads, and takes
  the real alerts with it.

A bug found while building this is worth recording, because it was the exact
failure the product exists to prevent: inferring inactive weekdays from absence
alone meant a signal whose history spanned three days was treated as never firing
Thursday, Friday or Saturday. The active-time clock then froze, and a genuinely
dead signal could never escalate past `late`. **A monitor that silently stops
escalating.** Fixed, with two regression tests.

## Architecture

```
src/core/          zero dependencies, no network, no monday
  cadence.js         is this signal late, silent, dormant, or fine?
  signals.js         group activity-log entries into watchable patterns
  watch.js           join the two, rank worst-first, decide whether to alert
```

30 tests, all offline.

## The unknown this is built around

**Does monday's API say which actions an automation performed?** **UNVERIFIED.**
The UI marks them with a robot icon and the tooltip "This operation was made by
an automation", but whether the GraphQL activity log exposes that is unconfirmed,
and there is an open community request asking for exactly that detail.

So nothing here depends on the answer:

- **If it does**, pass the automation actor ids to `extractSignals` and each
  automation becomes its own precisely-labelled signal.
- **If it does not**, every repeating (actor, event, entity, board) pattern is
  watched instead. Patterns still go quiet when the automation behind them dies.
  Monitoring by outcome rather than by status.

The same applies to `board_automations`, which appears to exist in monday's API
reference. If it exposes activation state, that becomes a second, stronger
signal. The engine does not require it.

## What is not built

- No monday API adapter. Nothing talks to monday yet.
- No scheduling, no email. Both are required for the product to be a watchdog
  rather than a library, and both need a backend — unlike the schema auditor,
  this one cannot be client-side only.
- No UI.
- **No validation.** Nobody has said they would pay for this. The evidence is
  monday's own documentation and two community threads. That is better than the
  last two products had at this stage, and it is still not a customer.

## Verification still owed

1. Does the API expose automation status or automation run logs?
2. Does `activity_logs` distinguish automation-performed actions?
3. Marketplace search for `automation`, `monitor`, `alert`, `watchdog` —
   confirm nothing already does this.
