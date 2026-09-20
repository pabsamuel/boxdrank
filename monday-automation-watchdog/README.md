# monday Automation Watchdog

Tells you when a monday.com automation that used to fire regularly has gone
quiet — because monday will not.

Status: **complete logic, tested end to end. Not deployed.** The one thing
missing is a host to run it on — see "What is not built" at the bottom.

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
  alerts.js            what to say, given what was said last time
  email.js             render a notification plan as text and HTML
  sanitize.js          flatten untrusted names so they cannot forge structure
src/app/
  monday-source.js     the only file that talks to monday
  main.js              plain-DOM UI, no framework
  index.html           single page, inline CSS, light and dark
src/server/
  run-check.js         one scheduled check: read, judge, notify, remember
scripts/
  make-fixtures.js     generates the demo account
  serve.js             node:http static server for the demo
  build.js             emits a deployable dist/
```

**87 tests**, all offline — no network, no account, no monday dependency.
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

## Knowing when to shut up

The cadence engine decides whether an automation is broken. `alerts.js` decides
whether that is worth an email, which is the harder question. A monitor that
mails every run about the same known problem is nagging, and nagging earns a
filter rule that takes the next real alert down with it.

- **Only `silent` is ever emailed.** `late` is a nudge. Escalating a nudge is
  crying wolf, and the product dies the first time it does.
- **Said once**, then suppressed. Still broken after three days gets one
  reminder — not a daily one, which reads as noise rather than as urgency.
- **The reminder clock runs from the last mail actually sent**, so a run that
  suppressed itself cannot quietly reset it and starve the reminder forever.
- **Recovery is announced**, and only to someone who was told it broke.
  Without it people keep checking by hand and stop trusting the silence.
- **`dormant` is never emailed.** Someone switched that off on purpose.
- One account-wide outage lists at most 20 items; the full count still leads the
  subject line. Only the detail gets trimmed.

What it looks like:

```
1 monday automation has stopped

STOPPED

  • Slack Notifier posts an update on Client Projects
    Normally every 3 hr, but nothing for 3 days of working time.

monday does not notify anyone when an automation is deactivated or starts
failing. If one of these matters, check it in the board's Automations centre.
```

One hour later, with nothing changed: nothing is sent.

### Two findings from a security review, both fixed

A review on 20 Sep found two real problems, and both were failures of the
product's own job rather than generic web bugs.

**A board name could forge a section of the email.** The HTML body was escaped
from the start; the plain-text body was not, on the reasoning that plain text is
not markup. That reasoning was wrong, and a test asserted it. Plain text is not
markup, but it *is* structured — sections, bullets and indentation are the entire
document — so newlines in a board name let anyone who can create a board write a
fake `RUNNING AGAIN` section claiming a genuinely dead automation had recovered.
For a product whose only job is to say which automation stopped, that is a total
defeat. Untrusted names are now flattened to a single line at every boundary,
and the test that encoded the bug now asserts the opposite.

**The freshest breakage was the one thrown away.** Notification lists inherited
the dashboard's longest-quiet-first order and were then capped for display, so an
account with more than twenty failures silently trimmed out exactly the
automations that had just broken — the only ones the email exists to announce.
Someone able to create boards could force it deliberately by parking decoys in a
long silence. Breakages now lead with the newest, reminders with the most
overdue, the cap takes round-robin by board so one noisy board cannot crowd out
the rest, and the overflow line names the boards it dropped instead of only
counting them.

### The ordering that matters

State is persisted **after** the mail is accepted, never before. A storage write
that lands while the send fails would record the alert as delivered and silently
swallow it. A watchdog that loses alerts is worse than no watchdog, because it is
trusted. Failing the other way merely repeats an alert, which is survivable.
Tested both directions.

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

- **Nowhere to run.** `runCheck` is the whole scheduled job and it is tested,
  but nothing schedules it and nothing sends real mail. It takes two injected
  interfaces:

  ```
  storage: { get(key) -> Promise<any|null>, set(key, value) -> Promise<void> }
  mailer:  { send({ to, subject, text, html }) -> Promise<void> }
  ```

  Wiring those to monday code's real storage and a mail provider is a contained
  job in one file. They are injected rather than imported precisely because
  monday code's APIs could not be verified from here, and writing them from
  memory would have produced something that looks finished and does not run.
- No manifest or app configuration, for the same reason.
- No OAuth flow. The UI uses seamless auth; a scheduled job runs without a user
  present and needs a stored token, which is the one place this app would hold a
  secret. That is the main new question for its security review.
- **No validation.** Nobody has said they would pay for this. The evidence is
  monday's own documentation and two community threads. That is better than the
  last two products had at this stage, and it is still not a customer.

## Verification still owed

1. Does the API expose automation status or automation run logs?
2. Does `activity_logs` distinguish automation-performed actions?
3. Marketplace search for `automation`, `monitor`, `alert`, `watchdog` —
   confirm nothing already does this.
