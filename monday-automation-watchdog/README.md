# monday Automation Watchdog

Tells you when a monday.com automation that used to fire regularly has gone
quiet — because monday will not.

Status: **working demo, real monday adapter, no scheduling or email yet.**
See "What is not built" at the bottom.

```bash
git clone https://github.com/pabsamuel/boxdrank.git
cd boxdrank
git checkout claude/monday-billable-hours-app-nv00q4
cd monday-automation-watchdog
npm install
npm run demo          # then open http://localhost:8137/src/app/index.html
```

A local server is required: browsers block ES modules and `fetch` on `file://`.

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
src/core/            zero dependencies, no network, no monday
  cadence.js           is this signal late, silent, dormant, or fine?
  signals.js           group activity-log entries into watchable patterns
  event-labels.js      raw monday event names into readable prose
  watch.js             join them, rank worst-first, decide whether to alert
src/app/
  monday-source.js     the only file that talks to monday
  main.js              plain-DOM UI, no framework
  index.html           single page, inline CSS, light and dark
scripts/
  make-fixtures.js     generates the demo account
  serve.js             node:http static server for the demo
  build.js             emits a deployable dist/
```

**48 tests**, all offline — no network, no account, no monday dependency.
One runtime dependency (`monday-sdk-js`, pinned to 0.5.9 for the same reason as
the schema auditor: 1.0.0-beta has removed `api()`).

### Verified working

Driven in headless Chromium on 20 Sep 2026. The demo account reports 1 stopped,
1 overdue, 1 switched off and 3 running; the stopped Slack notifier sorts to the
top; no console errors; no horizontal overflow at 375 px; dark mode renders.

### The timestamp trap

`created_at`'s exact format is **UNVERIFIED** — the docs were unreachable, and
there is a community thread specifically about that field's format, which is not
a thread that exists for a plain ISO string. Guessing wrong would not throw; it
would scale every interval by a thousand and make the engine report confident
nonsense. So `parseActivityTimestamp` normalises **by magnitude**: seconds,
milliseconds, microseconds, nanoseconds and ISO strings all resolve to the same
instant, and anything unusable returns null rather than a wrong number. Entries
with unreadable timestamps are counted and surfaced in the UI, so a parsing
problem and a quiet account never look the same.

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

- **No scheduling and no email.** This is the gap between a dashboard and a
  watchdog: right now it only reports when someone opens it, and the whole
  premise is that nobody opens things. Both need a backend — unlike the schema
  auditor, this one cannot stay client-side only.
- No manifest or app configuration. `developer.monday.com` is unreachable from
  the environment this was built in, so none of it was written from memory.
- **No validation.** Nobody has said they would pay for this. The evidence is
  monday's own documentation and two community threads. That is better than the
  last two products had at this stage, and it is still not a customer.

## Verification still owed

1. Does the API expose automation status or automation run logs?
2. Does `activity_logs` distinguish automation-performed actions?
3. Marketplace search for `automation`, `monitor`, `alert`, `watchdog` —
   confirm nothing already does this.
