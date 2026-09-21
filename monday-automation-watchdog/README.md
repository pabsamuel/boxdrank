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
  actors.js            which actors in a log are not people
  mutes.js             silence a signal without going blind to it
  run-log.js           did the checks themselves run?
src/app/
  mute-store.js        where mutes live in the browser (demo only)
  monday-source.js     the only file that talks to monday
  main.js              plain-DOM UI, no framework
  index.html           single page, inline CSS, light and dark
src/server/
  run-check.js         one scheduled check: read, judge, notify, remember
  http-client.js       monday API from Node, where the browser SDK cannot go
  file-storage.js      key/value on disk, for running outside monday
scripts/
  run-check.js         run one check from a command line
  make-fixtures.js     generates the demo account
  serve.js             node:http static server for the demo
  build.js             emits a deployable dist/
```

**159 tests**, all offline — no network, no account, no monday dependency.
One runtime dependency (`monday-sdk-js`, pinned to 0.5.9 for the same reason as
the schema auditor: 1.0.0-beta has removed `api()`).

### Verified working

Driven in headless Chromium on 20 Sep 2026. The demo account reports 1 stopped,
1 overdue, 1 switched off and 3 running; the stopped Slack notifier sorts to the
top; no console errors; no horizontal overflow at 375 px; dark mode renders.

### The timestamp trap — and what the real API turned out to do

**VERIFIED against a live monday developer account on 21 Sep 2026.**

monday returns `created_at` as a 17-digit value like `17899565625638124`. That is
**100-nanosecond ticks** — 10⁻⁷ seconds, ten thousand times a millisecond. It is
not a factor of 1000 away from seconds, milliseconds, microseconds or
nanoseconds.

The first implementation normalised by stepping in factors of 1000, which
overshot the window and returned **null for every real entry**. The app would
have reported an empty account. That is the safe direction — it refused rather
than inventing a date — and it is still useless.

Stepping by ten fixes it, and a one-decade-wide target window keeps the result
unambiguous: seconds, milliseconds, microseconds, 100-nanosecond ticks,
nanoseconds and ISO strings all resolve to the same instant, while anything
unusable still returns null. Entries with unreadable timestamps are counted and
surfaced in the UI, so a parsing problem and a quiet account never look the same.

The real response is pinned as `fixtures/real-api-response.json` and checked in
CI, so this assumption cannot drift back into a guess.

**Also confirmed from the same response:** ids and `user_id` arrive as strings,
`entity` is `pulse` or `board`, and real event names include
`update_column_value`, `update_board_name`, `board_workspace_id_changed`,
`create_column` and `create_group` — now mapped to readable prose.

### How to tell an automation from a person — **answered**

**VERIFIED on a live account, 21 Sep 2026.** One automation was created on a real
board and fired three times. Every action it performed was written under
**`user_id: "-4"`**, while the person who triggered it appeared as
`"117040353"`.

**monday's automations act under a negative `user_id`.** People have large
positive ids, so the sign alone separates them and no person can ever collide.

The captured response also shows the automation's latency: roughly **1.5 seconds**
between the human's `update_column_value` and the automation's
`move_pulse_from_group`. Useful to know — an automation's effect is not
instantaneous, but it is far below any interval this app measures.

Any negative id counts, not just `-4`: that is certainly not the only internal
actor monday uses, and a new one appearing should be watched rather than ignored.

This also closes the gap left by the users query. A negative id is proof on its
own, so automations are recognised even when the account's people cannot be
listed — which was previously the degraded path. Alerts say *"An automation moves
an item between groups on Client Projects"* rather than *"Actor -4"*.

### Finding the rest without asking anyone

The alternative was a settings screen where someone ticks which actors are
automations. That is worse in every direction: work before the app does anything
useful, stale the moment an automation is added, and getting it wrong means
silently not watching something.

So it is inferred instead. An account knows exactly who its people are; anything
that appears in an activity log and is not one of them acted without a person
behind it — an automation, an integration, or an installed app. All three can
quietly stop working and all three are worth watching, so "not a human" happens
to select exactly the right set.

**This degrades in the safe direction.** The `users` query it depends on was
written without being able to read the reference page, so `fetchUsers` returns
null rather than throwing on any failure, and a null means every repeating
pattern stays watched exactly as before. A wrong guess costs precision, never
coverage. Both paths are tested.

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

## Who watches the watchdog

Every failure this product detects is a silent one, so the worst thing it can do
is fail silently itself. A scheduled job that has stopped — crashed worker,
revoked token, uninstalled integration — produces **exactly the same screen** as
an account where nothing is broken: calm, and no email. The calm screen is the
more convincing of the two.

So the page always says when it last checked, and says the following without
being asked:

- **Never run:** *"Scheduled checks are not running yet. This page only reports
  when you open it. Until checks are scheduled, nothing will email you when an
  automation stops — which is the whole point."* This is the state the app is in
  today, and it says so rather than implying otherwise.
- **Stale:** *"No check has run for 8 days. The watchdog itself has stopped.
  Nothing below is current, and no email will arrive."*
- **Failing:** *"The last 2 checks failed"* with the error. A job that runs and
  keeps erroring is a different problem from a job that stopped, and needs a
  different response, so they are never merged.
- **Healthy:** *"Last checked 40 min ago. Checks run daily."*

One missed run plus slippage is tolerated before anything is called stale;
`runCheck` records every run including failures, and a run log that cannot be
written never takes down a check that otherwise worked — losing a history entry
is survivable, losing an alert is not.

## The known blind spot

**All of monday's automations act under the same negative `user_id`.** On the
account this was verified against, every automation writes as `-4`. That is
enough to tell an automation from a person, and not enough to tell one
automation from another.

A signal is identified by `(board, actor, event, entity)`, so two automations on
the same board that do the *same kind* of thing — both changing a column, say —
collapse into one signal. **If one dies while the other keeps firing, the merged
signal stays healthy and the death is invisible.** That is precisely the failure
this product exists to catch, so it is tested rather than left to be discovered.

What still works:

- Automations that do **different** things stay separate, which covers most real
  boards. A status router and a notifier do not look alike.
- The **same recipe copied onto ten boards** stays ten signals, so each one
  fails independently and is reported by name.

The likely fix is the activity log's `data` field, which is already fetched and
currently unused. If it carries a column id or an automation id, the signature
can be refined and the blind spot closes. **Its contents are UNVERIFIED**, and
nothing will be built on a guess about them.

## Muting without going blind

A mute button is not optional in a monitoring product: one automation nobody
intends to fix will otherwise poison every future alert until the whole tool gets
filtered. But mute is also its most dangerous feature, because the obvious
implementation — mute forever, hide the row — turns the watchdog into something
that silently stops watching. That is the failure this product exists to catch,
self-inflicted.

- **Mutes expire.** The longest option offered is 90 days. "Forever" is not on
  the menu.
- **"Until it works again"** covers the real case — *I know, I'm fixing it* —
  and clears itself on recovery, so the *next* failure is announced normally.
  Without it people reach for an indefinite mute and never remove it.
- **Mute silences the email, never the dashboard.** The row stays, dimmed,
  labelled `muted for 7 more days`, with a way back.
- **Muted signals are counted in every email that was going out anyway.** One
  line: *"1 other automation is muted and not listed above."* It never causes an
  email by itself, and a blind spot cannot quietly become permanent.
- **Muting is only offered where it means something.** A healthy signal has no
  mute button; that would just be a free blind spot.

A bug the tests caught while building it, which was the same failure in
miniature: the first version recorded a notification timestamp while muted, so a
muted signal looked like one already reported. When the mute lapsed, the
three-day reminder window swallowed it for another three days. **The mute quietly
outlived itself.** Now nothing is recorded as notified unless something was
actually sent, and two regression tests pin both directions.

**Storage is the honest gap.** `mute-store.js` uses `localStorage`, so a mute set
by one admin is invisible to a colleague and to the scheduled job that sends the
mail. That is wrong for the real product and fine for a demo. Nothing else
imports it, and the scheduled job already takes an injected store, so swapping in
monday's account-scoped storage is a one-file change.

### Five findings from three security reviews, all fixed

The first review, on 20 Sep, found two problems, and both were failures of the
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

### Three more, from the review of the first credential this project has held

The board view holds no secret — seamless auth handles it. The scheduled runner
does, and a review on 21 Sep found three ways it could lose one. All three came
from the same root cause: a defence was written down and then not finished.

**The alert body was published to a public log.** The CLI's header documented
`WATCHDOG_DRY_RUN` as the gate that decided whether the alert was printed or
sent. That variable appeared in the comment and nowhere else in the repository,
so printing was unconditional — and the scheduled workflow runs the CLI with
stdout going to a GitHub Actions log, on a repository that is public. Every run
would have published board names, the full inventory of watched automations, and
which ones were currently dead: a map of someone's internal workflow annotated
with its weak points, and a way for anyone who can share a board into the
account to force a string of their choosing into a public log. The gate is now
real. Without the opt-in the check exits with "no mail provider is configured"
rather than falling back to printing, the workflow deliberately does not set it,
and the summary line it does print carries no account content.

**The token could be sent to any host on earth.** `MONDAY_API_URL` went
straight to `fetch`, with no scheme check and no host check, and the token was
attached to the first request before any response was looked at. The README
actively encourages overriding it, which made a one-line typo — or one line
added to the workflow by anyone with push access — enough to hand a
full-account credential to a stranger. The endpoint is now validated before the
token is attached: https only, and `monday.com` or a `.monday.com` host,
checked with the leading dot so `monday.com.attacker.example` does not pass. It
fails closed at construction. Tests reach for an explicit opt-in; production
cannot.

**A reflected token reached stderr and the disk.** This one the review missed
and reported as clean, because it tested against a stub that behaves. The client
had always refused to echo the body of a *failed* response, precisely so a
reflected token could not travel — but GraphQL reports errors inside a **200**,
so that path was never covered. Running the real CLI against a server that
quotes the `Authorization` header back put the token in stderr and in the run
log on disk, where it persists. Responses are now scrubbed of the token as text
before they are parsed, so it cannot come back through *any* field rather than
only the ones read today, and a non-JSON 200 reports its size and content type
instead of quoting the body Node's parse error would otherwise leak.

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

## Running it on a schedule, without waiting for an answer

Whether monday itself can run a server-side job on a schedule is still
**UNVERIFIED**, and that question could have blocked everything. It does not,
because the check now runs from a command line against any host:

```bash
MONDAY_API_TOKEN=...  WATCHDOG_RECIPIENT=you@example.com  node scripts/run-check.js
```

Configuration is environment-only, never arguments, so a token cannot end up in
a shell history or a process list. `.github/workflows/monday-watchdog-schedule.yml`
runs exactly this on a cron — free, and it fits the $100 budget. If monday turns
out to support scheduling, that becomes the fallback rather than the plan.

Two things had to exist for this:

- **`http-client.js`**, because `monday-sdk-js` cannot be used outside a browser:
  0.5.9 attaches a `message` listener to `window` on construction, and its
  seamless auth borrows a signed-in user's session, which a scheduled job does
  not have. It exposes the same `api(query, options)` shape, so nothing above it
  knows the difference.
- **`file-storage.js`**, the same key/value interface `runCheck` already took.

The endpoint defaults to the widely published `https://api.monday.com/v2` and is
overridable by `MONDAY_API_URL` **precisely because that default is a guess** —
a wrong one should cost an environment variable, not a patch. The override is
constrained to https on a monday.com host, because the same flexibility was a
way to hand the token to a stranger.

Eight end-to-end tests drive the CLI against a stub monday server: a stopped
automation produces the right email, a healthy account sends nothing, state
persists so the same alert is not repeated, the human user is not reported as a
broken automation, missing configuration exits with a usage error, the check
refuses to run without the dry-run opt-in, the token is not sent to a local
address without an explicit opt-in, and a server that echoes the token back
leaves it in no output stream and on no disk.

## What is not built

- **No real mail provider.** The CLI can only print the alert, and printing now
  has to be asked for with `WATCHDOG_DRY_RUN=1`. Without it the check exits
  rather than quietly printing, because the output carries board names and
  belongs nowhere public. Choosing a provider on a guess would be the same
  mistake as writing an API from memory.
- **monday's own hosting is still unwired.** `runCheck` takes injected `storage`
  and `mailer` interfaces, so if monday code turns out to offer both, it is two
  small files rather than a rewrite.
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
