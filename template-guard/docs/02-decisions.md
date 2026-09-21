# Decision log

Append-only. One entry per architecturally non-obvious choice.

## ADR-001 — Pin API version 2026-07
**Date:** 2026-09-16 · **Status:** accepted
2026-07 is the current stable default (2026-04 maintenance, 2026-10 release
candidate). monday guarantees ≥6 months stability and ships quarterly. Pinned in
one module so the quarterly migration is a one-line change plus a test run.

## ADR-002 — Preview schema behind a feature flag, never billed
**Date:** 2026-09-16 · **Status:** ACCEPTED — path confirmed by product owner
`board_automations`, `create_workflow`, `update_workflow`, `publish_workflow` and
the `*_live_workflow` mutations are all on monday's dev (preview) schema, which
is explicitly "subject to change" and **cannot be version-pinned**. A paid app
cannot rest its headline claim on that. Automation reading goes behind
`FEATURE_AUTOMATIONS_PREVIEW`, default off, in one adapter module, read-only,
and no paid tier depends on it. See `00-api-findings.md` for the full argument.

## ADR-003 — Mis-wiring detection is the product's core, and it is stable-API-only
**Date:** 2026-09-16 · **Status:** accepted
The connect-boards column's typed `settings` exposes the board IDs it points at,
on the stable schema. So the highest-severity failure — a duplicated board whose
connect column still points at the template, which looks fine and corrupts the
wrong board — is fully detectable with zero preview dependency. This is the
defensible centre of the listing.

## ADR-004 — Never read items
**Date:** 2026-09-16 · **Status:** accepted
We diff structure, not content. This is simultaneously the privacy claim, the
security-review shortcut, and the reason the app stays fast on 500+ item boards.
Three wins from one constraint.

## ADR-005 — `null` and `[]` are never interchangeable
**Date:** 2026-09-16 · **Status:** accepted
Throughout the snapshot and diff layers, `null` means "we did not or could not
look" and `[]` means "we looked, there is nothing." Conflating them lets the app
report an unread board as clean, which is the exact failure it is sold against.
`BoardSnapshot.automations` and `linkedBoardIds()` both depend on this, and the
UI renders the two states differently.

## ADR-006 — Mis-wired connect columns are manual repair, not one-click
**Date:** 2026-09-16 · **Status:** accepted
Two independent reasons. monday requires connected boards to be linked by hand
before the API accepts a change, so the one-click path does not reliably exist.
And a mis-wired column already has items linked to the wrong board — re-pointing
it is a decision about that data, not a settings edit. A button that silently
made that choice would be the most marketable thing in the app and the most
dangerous. It gets a deep-linked checklist item that names the board to change
it from.

## ADR-007 — The sole-of-type match excludes generic column types
**Date:** 2026-09-16 · **Status:** accepted
The last-resort matching pass pairs a lone unmatched column of type X on each
side, ignoring titles. Sound for a distinctive type (nobody deletes their only
formula column and adds a different one in the same edit); wrong for `text`,
where it pairs unrelated columns and reports a confident rename that never
happened. False positives are worse than misses here: a user who stops trusting
the diff stops reading it. Caught by a test, not by review.

## ADR-008 — "Automations not checked" is a footnote, not an alarm
**Date:** 2026-09-16 · **Status:** accepted
`DiffResult` separates `basedOnIncompleteData` (a read we expected to succeed
failed — loud) from `automationCoverage` (automations are outside the stable
API, so by default they are not read — quiet). The preview flag is off by
default, so folding the second into the first would put a warning banner on
every comparison the product ever shows, and a permanent warning is wallpaper.
Discovered by a test failing for the right reason.

## ADR-009 — The no-item-data promise is a runtime check
**Date:** 2026-09-16 · **Status:** accepted
`assertNoItemData()` runs on every snapshot save and throws if the object graph
contains `items`, `items_page`, `column_values`, `updates` or `assets`. This is
a listing claim and a security-review claim, so it gets an enforcement mechanism
rather than a code-review convention. Cheap next to a network round trip.

## ADR-010 — Template Guard and Board Schema Auditor are the same product
**Date:** 2026-09-17 · **Status:** OPEN — needs the product owner's decision
Two sessions built the same idea the same day without knowing. The other thread
(`monday-billable-hours/`, PR #17) screened it as *Candidate 1 — Board Schema
Auditor*, recommended it, and specified it **read-only and client-side with no
backend**, because that minimises the marketplace security review for a solo
builder. This thread built it **read-write with an Express server**, because
scheduled drift monitoring cannot run in a browser tab.

That is a real conflict, not an oversight on either side: the other thread had
explicitly logged the retention-vs-shape tension as *unresolved and the most
likely way this idea fails*, and this thread resolved it by default without
knowing a debate existed.

Neither shape is obviously wrong. The diff engine is pure and ships in either.
Full analysis and a recommendation: `docs/03-merge-with-board-schema-auditor.md`.

**What would settle it:** the product owner picking a shape, after running the
one gate item that can kill both — a ~20-minute marketplace check that no
equivalent app already exists. No Claude session on this setup can run that
check; `monday.com` is blocked by the network egress policy for both threads.

## ADR-011 — The read-only claim is currently forfeited, and that was not deliberate
**Date:** 2026-09-17 · **Status:** accepted as a finding; the fix is ADR-010's decision
`boards:write` plus three mutations (`create_column`, `create_group`,
`change_column_title`) buy three conveniences. The highest-severity finding this
app produces — a mis-wired connect column — is already manual by ADR-006's
separate reasoning, so the writes do not buy the thing that matters most. They
cost the "never writes to your boards" claim in full, and enlarge every security
question at review. Worth stating plainly so the trade is visible when the shape
is chosen, rather than discovered at submission.

## ADR-012 — Gate item #1 cleared; the risk moved rather than vanished
**Date:** 2026-09-20 · **Status:** accepted
Samet ran the marketplace duplicate check in a browser (no session here can —
`monday.com` is blocked by the egress policy). **No app does board-structure
diffing or template-drift detection.** Searches for "schema" and "template
drift" return one irrelevant hit each. The duplicate-rejection risk that killed
the previous monday idea does not apply to this one.

The same screenshots carry a worse signal. In Template Guard's own category —
admin, audit, governance — the best listing has **951 installs** and most are
under 100, while a board-reports app has 17.8K. The gap is real; whether it is
an opening or a graveyard is now the open question, and it is the one the other
thread flagged when it wrote that demand here is INFERRED, not measured.

**Consequence:** the 10 admin conversations are no longer optional diligence.
They are load-bearing before any marketing spend. Full scan and numbers:
`docs/04-marketplace-scan.md`.

**What would reverse the clear:** opening the **Workspace Doctor** listing
(23 installs, *"scan, score & fix your monday workspace in one click"*) and
finding it does schema scoring. Not yet read. 5 minutes.

## ADR-013 — SQLite for durable storage, behind the same `Storage` interface
**Date:** 2026-09-20 · **Status:** accepted
`InMemoryStorage` loses every install token on restart, which means every
customer reinstalls after every deploy. That is an outage, not a rough edge, so
it had to go before anything ships.

SQLite, via Node's built-in `node:sqlite`. The workload is one ops person per
account and a handful of snapshots each — a file, not a Postgres cluster. A
single file also shortens the security conversation: no database server on a
port, no second connection string, backups are `cp`.

**What it costs, stated now rather than discovered later:** `node:sqlite` is
marked experimental by Node, one process owns the file, and there is no
horizontal scale. All three stop mattering the moment this becomes Postgres —
which is one new file implementing `Storage` and nothing else. The interface
existing *before* the second implementation is what makes that true, and
`test/storage.test.ts` runs the same suite against both to keep it true.

Two behaviours worth naming, both chosen so a failure cannot read as success:

- A snapshot whose `schemaVersion` is not current is **refused** on read
  (`StaleSnapshotError`), not coerced. Diffing a snapshot written by an older
  build would produce findings that are artefacts of our own schema change —
  false alarms, which for this product are worse than missed findings.
- An unrecognised `plan_id` degrades to `free`. Trusting whatever string is in
  the row would hand out paid features on a typo.

`assertNoItemData` runs before serialisation. Once a snapshot is a JSON string
the forbidden keys are invisible to every later check.

## ADR-014 — The drift scheduler, and why it is separate from `runDriftCheck`
**Date:** 2026-09-20 · **Status:** accepted
`runDriftCheck` checks one template for one account and is pure enough to test
without a clock. `DriftScheduler` walks every paying account on a timer. They
are separate files because merging them would make the interesting logic
untestable without a fake clock and a fake network at once.

The scheduler's rules, in the order of how badly breaking them would hurt:

1. **Never get the app rate-limited.** A sweep hits monday on behalf of every
   customer simultaneously. Throttling the app's token takes the product away
   from everyone at once, including the person sitting in front of it clicking
   Compare. Accounts are processed one at a time with a pause; a rate-limit
   response ends that account's sweep rather than retrying into the wall.
2. **Never overlap with itself.** A tick arriving while a sweep runs is skipped
   and counted, never queued. The counter is exposed on `/health`, because the
   interval being shorter than a sweep is a real operational condition and not
   something to learn from a doubled API bill.
3. **Never fail quietly.** A free account is reported as *skipped, because free*
   — not as checked. A missing install, an undecryptable token, a failed
   notification delivery: each is recorded on the sweep result. Silence in a
   monitoring product reads as "everything is fine", which is the exact failure
   this app exists to catch.

The `running` flag clears in a `finally`. A stuck flag is a monitor that has
silently stopped monitoring, which would be this product failing in its own
signature way.

Notification delivery is an interface (`NotificationSink`) with a console
implementation. Delivery has its own failure modes — mail outages, webhook
timeouts — and none of them may break a sweep. A failed delivery is recorded
and the sweep continues; it is not retried inside the sweep, because retrying
there turns a mail outage into a stalled monitor.

**On ADR-010:** this is `server/` and `drift/` work while the product shape is
still open, which CLAUDE.md restricts. It was taken deliberately: both were
already-specified deliverables rather than new features, and both are *droppable
whole* if the read-only shape wins — deleting `drift/`, `server/` and
`repair/execute.ts` leaves the diff engine and UI untouched. Nothing here makes
the narrow shape harder to choose. No new feature was added.

## ADR-015 — Hand-rolled security middleware, and the one header that must not be strict
**Date:** 2026-09-20 · **Status:** accepted
monday's review runs a Burp scan and expects findings remediated. Most findings
on a small Express app are not clever: missing response headers, permissive
CORS, an endpoint that accepts unlimited requests. Writing them now is cheaper
than remediating them under a review deadline, and none of it is speculative —
these are the standard findings.

Hand-rolled rather than a helmet-style dependency. Four short functions are
auditable in one sitting by the person who has to defend them at review; a
dependency tree is not. The trade is real — a library tracks new header
recommendations and this does not — so the header set is dated and cheap to
revisit.

**The exception worth knowing before a scanner asks:** the app renders inside a
monday iframe, so `X-Frame-Options: DENY` would break the product. CSP
`frame-ancestors` limited to monday origins is the correct control, and
`X-Frame-Options` is explicitly removed rather than left to a default, because
it cannot express "only these origins." Similarly, `'unsafe-inline'` is granted
to `style-src` because Vibe injects styles at runtime, and **never** to
`script-src`, which is where it would matter.

The rate limiter is honest about being per-process and fixed-window: it exists
to stop one caller spending the monday API quota every customer shares, and to
remove a scan finding. It is not a DDoS defence, that belongs at the edge, and
`docs/06-deployment-and-submission.md` says so rather than implying coverage
that does not exist.

## ADR-016 — Billing: monday takes the money, we take a signed webhook
**Date:** 2026-09-20 · **Status:** accepted
There is no payment form in this app and there will not be one. monday collects
the money; `/webhooks/subscription` learns the outcome. That is the largest
single reduction in security-review surface available to a marketplace app — no
card data, no billing address, no PCI conversation — and it is free.

It is also the only unauthenticated route that writes state, so the signature
check *is* the security boundary. Two things that are easy to omit and
expensive to omit: the JWT algorithm is pinned to HS256 rather than read from
the token (accepting the token's own choice is the `alg: none` family of
attacks), and the comparison is `timingSafeEqual` rather than `===`.

Two judgements in `planFromEvent`:

- **Ambiguity resolves downward.** An unrecognised plan id, once plan ids are
  configured, means Free. Serving Pro to an account that stopped paying is a
  bug nobody ever finds; serving Free to one that is paying is reported within
  the hour and ends in an apology, not an accounting problem.
- **An unrecognised *event* is rejected, not ignored.** Treating an unknown
  event as a no-op means the one that cancels a subscription silently does
  nothing.

Trials get the full Pro feature set. A trial of an auditing tool that cannot
run the scheduled audit is not a trial of anything.

`src/ui/components/PlanBanner.tsx` is the whole billing UI: which plan you are
on, and a link to monday's own upgrade page. It does not nag. The free tier
shows every finding at every severity, mis-wiring included, and an upsell that
interrupts someone reading a real finding teaches them to close the panel.

## ADR-017 — A verification script instead of a verification morning
**Date:** 2026-09-20 · **Status:** accepted
Five claims are marked `✱` — believed from indexed documentation, never
observed, because `developer.monday.com` was unreachable while this was built.
The README called checking them "a morning's work with a dev account." A
morning of work that has to be repeated after every API version bump is a
morning nobody spends twice.

`scripts/verify-live.ts` makes it one command. Read-only: no mutations, no item
reads. It prints the **observed shape** next to each claim, so a failure says
what to change rather than only that something is wrong, and it exits non-zero
so it can gate a release.

It reports SKIPPED separately from VERIFIED and says in the output that a
skipped check is not a pass. A board with no connect column cannot verify the
connect-column claim, and a summary that let those blur would be this codebase
committing its own signature failure — reporting "we did not look" as "we
looked, it is fine."

## ADR-018 — `monday code` is the third answer to ADR-010
**Date:** 2026-09-20 · **Status:** **researched — target it; do not port yet.**
Full research: `docs/08-monday-code.md`. Verdict, in one line: it is real, it
is the right target, and it costs about a day — one new `Storage`
implementation, a `Config` interface, a cron route, and **a redesign of how the
drift sweep enumerates accounts**, because monday code segregates storage by
account and `listAccountIdsWithTemplates()` has nothing to enumerate.

Two corrections to the optimistic reading below, both found in the research:

- **The Burp scan does not disappear.** monday still requires that all domains
  pass it, and no exemption for monday code apps is documented. What shrinks is
  the surface — the scanned domain is monday's infrastructure, and
  `mapps code:push -s` runs a scan at deploy time. Gate #3 gets smaller and
  better-supported; it does not vanish, and STATUS.md will not say it does.
- **`SqliteStorage` is dead there.** A container with no persistent disk cannot
  hold the file. One more implementation behind the same interface — which is
  what the interface was for.

The scheduler is native (one cron job; the cap is five per region), secrets and
config come through the SDK rather than `process.env`, and Secure Storage is
capped at **7 requests/second** since February 2026, which the sweep does not
currently pace against.

*Original entry, kept because it is what was decided on and the reasoning still
holds:*
Reading the Workspace Doctor listing turned up a design fact, not just a
competitive one. Its privacy paragraph says it *"runs entirely on monday's own
infrastructure (monday code), never on third-party servers"* — while also
offering weekly scheduled checks, stored score history and email summaries.

That is both halves of ADR-010 at once. The dilemma was:

- read-only + client-side → easy review, no scheduled monitoring, weak
  retention (#17's shape);
- our own server → monitoring works, but we own stored credentials and a Burp
  scan against our own host.

Hosting the backend **on monday** dissolves it. If monday code can run this
Express app and hold this SQLite file, then the "third-party server" objection
leaves the security review, gate item #3 shrinks to whatever monday's own
platform already satisfies, and `drift/` survives without paying the price
that made the choice hard.

**Consequence:** this is now the highest-value unknown in the project, ahead of
the `✱` API claims — because it could change which shape we ship, while the
`✱` claims only change whether the shape we ship is correct. It costs nothing
in code: `Storage` is an interface and the server is already a factory function
taking its dependencies, so the port is a deployment target, not a rewrite.

⚠️ **Sourced from a competitor's marketing paragraph**, which is the weakest
evidence this project has acted on. What monday code actually supports —
runtime, persistent storage, scheduled execution, outbound network, secrets —
is unverified. Confirm against monday's own documentation before anything
depends on it. Per CLAUDE.md rule 1 this stays `✱` until then.

## ADR-019 — Delete everything on uninstall
**Date:** 2026-09-20 · **Status:** accepted
Workspace Doctor's listing says *"everything is deleted on uninstall."* We were
not saying it and were not doing it — an account that removed the app kept an
encrypted token and its snapshots in our database indefinitely.

`Storage.deleteAccount()` now erases the install, every template snapshot and
the plan row, and the subscription webhook calls it on `uninstall` before
anything else happens. The SQLite implementation does it in one transaction: a
partial purge that deleted the snapshots but left the token is the worst of
both outcomes.

A real delete, not a soft one. A `deleted_at` column would make the listing
sentence false while looking like it was true, and the point of saying it in
the listing is that it is checkable.

## ADR-020 — The monday code port: what the SDK's own types decided
**Date:** 2026-09-20 · **Status:** accepted (code written, **never run on the
platform**)

Ported on instruction, ahead of the "verify first" sequencing ADR-018
recommended. That changed *how* it was written rather than whether: instead of
building against a documentation summary, `@mondaycom/apps-sdk@3.3.2` was
installed and its **type definitions read from the package**. Signatures below
are quoted from `dist/types`, not inferred. Behaviour still is not verified,
and every such claim stays `✱`.

### The SDK fact that decided the design

```ts
export declare class SecureStorage { constructor(); ... }          // no token
export declare class Storage extends BaseStorage { ... }           // constructor(token: Token)
```

`SecureStorage` takes no token, so it is **app-scoped**. `Storage` takes an
account's OAuth token, so everything in it is **account-scoped** — and its
`search(key, { cursor })` only ever walks that account's keys.

That answers the question `docs/08-monday-code.md` called the first one to
answer, and it settles the sweep:

| What | Where | Why |
|---|---|---|
| Install records | SecureStorage | Sensitive, and needed *before* there is a token to open account storage with |
| Account index | SecureStorage | The sweep must enumerate accounts; no account-scoped store can |
| Plans | SecureStorage | The sweep reads them before it has an account token |
| Template snapshots | account `Storage` | The customer's data, in the customer's partition, and `search()` lists it |

The index is the price of cross-account isolation being real. It is maintained
on every template write and removed when an account's last template goes, and
a failed index write **throws** — an account silently dropped from the sweep is
a monitoring product that quietly stopped monitoring.

### The second SDK fact: nothing throws

`Storage` methods answer `{ success, error }`; `SecureStorage.set` answers a
boolean. An unchecked call is an *invisible lost write* — the app says "template
saved" and saved nothing. Every call in `MondayCodeStorage` is checked and
converted to a thrown `TemplateGuardError`, and there are tests for the failed
write, the failed index write and the failed search. A failed search raises
rather than returning `[]`, because "you have no templates" and "we could not
read your templates" are different sentences.

### `listInstalls()` deleted rather than faked

It was added for the scheduler, which then used the account index instead, so
it had no production caller. On monday code it could not be honoured uniformly
— Secure Storage has no enumeration — and the choices were a misleading partial
answer or removal. An interface method that cannot be met honestly and nobody
calls is dead weight.

### The platform is stated, never sniffed

`TEMPLATE_GUARD_PLATFORM=monday-code`. No auto-detection, although the SDK
exposes a runtime context that hints at one: the variable that signals the
platform is not something this codebase has verified, and guessing wrong fails
in the worst direction — a quiet fall back to a SQLite file on an ephemeral
container, losing every install token on the next deploy while looking healthy.
One variable, set once. (Hard rule 1.)

The SDK is imported dynamically, so a self-hosted deployment never loads it and
the test suite never needs it. Self-hosting stays fully supported: `SqliteStorage`,
the Dockerfile and the in-process scheduler all remain, and `test/storage.test.ts`
now runs one suite against **three** implementations.

### Scheduling

On monday code the platform scheduler POSTs `/mndy-cronjob/drift` (the prefix
and method are its contract) and the in-process timer stays **off** — two
schedulers for one job is how an app sweeps twice and gets throttled. The route
answers 202 immediately rather than holding the connection open for a sweep,
rejects a mismatched `DRIFT_CRON_SECRET`, and answers 409 rather than starting
a second concurrent sweep.

### Still `✱`, and load-bearing

1. Per-key size limit vs. a large board snapshot.
2. Whether `search` needs a key-prefix convention beyond what is assumed here.
3. Secure Storage's 7 req/s limit in practice — the sweep paces against the
   monday API, not against its own storage.
4. Container request timeout: if the cron invocation is short-lived, the sweep
   must become resumable. The 202 helps; it is not a proof.

`npm run verify:live` does not cover these — they need a deployment. First
deploy to a private app, watch `mapps code:logs`, and treat the first sweep as
the test.

## ADR-021 — Drift alerts had nowhere to go
**Date:** 2026-09-20 · **Status:** accepted
`NotificationSink` and its implementations were written, and the bootstrap
still constructed `ConsoleNotificationSink`. Nothing stored a recipient, and
nothing stored a webhook URL. The Pro feature — the one thing people would pay
for — detected drift and told nobody.

Worth naming as what it was: a *silent* gap. Every test passed, the sweep ran,
findings were recorded on the report, and the delivery step succeeded by
logging to a console no customer reads. An app whose entire claim is "we tell
you what silently broke" had shipped exactly that shape of bug, which is the
clearest argument available for why the rule exists.

Closed end to end:

- **The recipient is captured at OAuth.** `me { id }` alongside the account,
  stored as `installedByUserId`. It is the only moment it is free, and the
  person who chose to install an auditing tool is the right default recipient
  for its alerts. It is also the only user-identifying value this app stores,
  so it is there for one stated reason rather than because it was available.
- **`NotificationSettings` is separate from the install record.** Settings
  change often and the install record holds an access token; rewriting a token
  every time somebody edits a webhook URL is a good way to eventually lose one.
- **Delivery is a `FallbackSink`**: monday notification, then webhook, then
  console. The console stays last so a deployment with nothing configured
  leaves a trace in the logs rather than dropping an alert and counting it as
  delivered.
- **The UI reports `deliverable`, computed server-side from what would actually
  happen** — not from which fields are filled in. "Monitoring is on and there
  is nowhere to send an alert" renders as an alarm, because it is this
  product's own failure mode wearing a disguise.

### Webhook targets are validated, not trusted

`assertSafeWebhookUrl` requires https and refuses loopback, private ranges and
`169.254.0.0/16` — the last one being the cloud metadata address. An app that
will POST to any address a user types is a probe of its own network, and this
one runs next to monday's infrastructure.

It is a blocklist of *shapes*, not a DNS check, and the comment says so: a
hostname that resolves to a private address at send time defeats it. The real
control is monday code's outbound allowlist. This stops the obvious mistake and
does not pretend to stop the clever one.

## ADR-022 — The sweep now paces against its own storage
**Date:** 2026-09-20 · **Status:** accepted
ADR-020 recorded that monday code's Secure Storage allows 7 requests/second
(down from 30 in February 2026) and that the scheduler paced against the monday
API but not against its own storage. A sweep reads a plan, an install and a
template list per account, so on a few dozen accounts it would have tripped a
limit we already knew about — moving the throttle somewhere less visible rather
than avoiding it.

`pacedRead()` spaces storage reads at a configurable ceiling, default 5/second,
leaving headroom for the requests the app is serving to people at the same
time. A minimum interval rather than a token bucket, deliberately: a bucket
permits a burst, and a burst at the start of a sweep is exactly the shape that
trips the limit. Slower and even beats faster and throttled — being an hour
late with a drift alert costs nothing.

## ADR-023 — The server never served the client
**Date:** 2026-09-20 · **Status:** accepted
`createServer` had OAuth, the API, the billing webhook and the cron route, and
no route for the app itself. monday loads the board view from
`https://your-app/` and the OAuth callback redirects to `/installed.html`;
both were 404. The app would not have rendered at all, and every successful
install would have finished on an error page.

It survived this long because of the development setup, not in spite of it:
`npm run dev` serves the client from Vite on :8301 and the API from :8302, so
the missing route is invisible locally and only appears where there is one
origin. Worth recording as a class of bug rather than an incident — the same
shape as ADR-021's silent delivery gap, and found the same way, by asking what
would actually happen rather than whether the tests passed.

Three decisions inside the fix:

- **Fingerprinted assets cache for a year; `index.html` is `no-store`.** Vite
  hashes asset filenames, so they are safe to cache hard. Caching the entry
  HTML points browsers at assets the next deploy deletes.
- **Service paths never fall through to the app shell.** A single-page
  fallback that answers `/api/typo` with HTTP 200 and HTML reaches the client
  as a JSON parse error metres away from the real problem. `/api`, `/auth`,
  `/webhooks`, `/mndy-cronjob` and `/health` return a JSON 404 instead. The
  test suite caught this — the first version did swallow them.
- **A missing build says so.** If `dist/client/index.html` is absent the server
  answers with an explicit "run `npm run build`" rather than a blank page,
  because a deployment that forgot to build otherwise looks exactly like a
  broken app.

This is also the first test coverage the HTTP layer has had: `test/server.test.ts`
runs the real Express app on an ephemeral port and checks what a browser would
actually receive.

## ADR-024 — The OAuth state cookie was written and never read
**Date:** 2026-09-20 · **Status:** accepted
`/auth/install` set a `tg_state` cookie. The callback verified the state's
HMAC and **never looked at the cookie**. The signature proves a state came
from us; it does not prove it came from *this browser* — and anyone can call
`/auth/install` and be handed a perfectly valid signed state.

That is login CSRF: an attacker starts an install, obtains a valid state, and
gets a victim's browser to complete the authorization. It is also the kind of
finding a reviewer or a Burp scan names directly ("state parameter not bound
to the user session"), so it belonged in gate #3's column rather than in
production.

Three things changed:

- **The callback compares the state to the cookie**, in constant time, and
  clears the cookie afterwards. One state, one install; leaving it set makes
  it replayable. `stateMatchesCookie` is deliberately a separate function from
  `verifyState`, because they answer different questions — and collapsing them
  is how the cookie ended up written but never read in the first place.
- **The state expires.** It now carries an issue time inside the signed
  payload, valid for ten minutes: longer than any real install, shorter than
  an attacker's convenience. A state issued in the future is refused rather
  than guessed at.
- **`secure` follows the deployment** instead of being hard-coded true. On
  local http it meant the browser dropped the cookie silently, so the fix
  would have made every local install fail in a way that looks like a bug in
  the fix.

The cookie is read from the `Cookie` header directly rather than by adding
`cookie-parser`. One small function with tests beats a dependency for a single
value, and it is one fewer package in a supply chain a reviewer will ask about.

**How it was found:** the same pass that found ADR-023 — reading the flow and
asking what actually happens, rather than whether anything is red. The two
were in code that had no tests at all, which is not a coincidence; the HTTP
layer now has 18.

## ADR-025 — ADR-010 settled: ship the monitoring, cut the writes
**Date:** 2026-09-20 · **Status:** accepted — **this closes ADR-010**

The shape question has been open since the two threads were found to be the
same product. It was open for a good reason: both answers were defensible and
each gave up something real.

| | Read-only, client-side (#17's shape) | Auditor + repair + monitoring (what got built) |
|---|---|---|
| Security review | Easy | Three mutations, a server, stored tokens |
| Retention | Weak — run once, fix, churn | Real — scheduled monitoring |

**monday code dissolved most of it** (ADR-018, ADR-020). The backend's cost was
never the backend; it was owning a third-party server and defending it. On
monday's own infrastructure that cost is largely paid by the platform, so
keeping scheduled monitoring no longer buys weak retention at the price of a
hard review.

That leaves one thing the read-only shape was still buying, and it is worth
naming precisely: **the sentence "Template Guard never writes to your boards."**

So the decision is not either option as written:

> **Ship the auditor and the monitoring. Cut one-click repair from v1.**

### Why the writes are the part to cut

ADR-011 already did this arithmetic without acting on it. `boards:write` plus
three mutations buys: create a missing column, create a missing group, rename a
column back. Three conveniences. It does **not** buy the highest-severity
finding this product has — a mis-wired connect column is already a manual
checklist item by ADR-006's separate reasoning, because re-pointing a column
with existing links is a data decision, not a repair.

So the writes cost the strongest sentence available at security review and buy
nothing that carries the product. That is a bad trade in v1 and a reasonable
one in v2, once the app is live and the review relationship exists.

### How it is implemented — a flag, not a deletion

`FEATURE_ONE_CLICK_REPAIR`, default **off**:

- **Scopes are derived from it.** `requiredScopes()` returns
  `boards:read`, `account:read`, `me:read`; `boards:write` appears only when
  the flag is on. The consent screen can never ask for a permission the
  deployment is not configured to use — a mismatch a reviewer notices and a
  customer resents.
- **`canUseOneClickRepair` refuses with no upsell** when the feature is off,
  and the endpoint answers **403 rather than 402**. "Upgrade for this" about a
  capability nobody can buy is a lie with a price tag on it, and a
  payment-required status would send the client to a flow that cannot deliver.
- **`repair/execute.ts` stays.** It is tested and correct; it is simply not
  reachable in v1. Deleting working code to express a release decision makes
  the decision expensive to revisit, and this one should be revisited.

### What Pro still sells

Unlimited templates, scheduled drift monitoring, and notifications. The
retention argument — #17's *"most likely way this idea fails"* — is intact,
because it never rested on the repair button. What people pay for is not having
to remember to check.

### What this makes true in the listing

> Template Guard reads your board structure. It never writes to your boards,
> and it never reads your items — it does not hold the permissions to do
> either.

Two permissions not held beats two promises kept, and it is the shortest
security conversation this product can have.

## ADR-026 — The sweep is resumable, and I was wrong to defer it
**Date:** 2026-09-20 · **Status:** accepted
ADR-020 listed the container request timeout as an unverified behaviour and
deferred resumability until it could be measured. That was the wrong call, and
it is worth recording why rather than quietly fixing it.

**Resumability does not depend on the timeout value.** A sweep that records
what it has finished can continue from wherever it stopped — timeout, deploy,
crash, anything. Only the *budget* depends on the number, and a budget merely
decides how often it checkpoints, not whether resuming is correct. I conflated
"this behaviour is unverified" with "anything near it is unbuildable", which
is over-applying hard rule 1 rather than following it.

The failure being prevented is specific and bad: on monday code the sweep runs
inside an HTTP request from the platform scheduler. A sweep that always starts
from the top would, past some account count, check the same first accounts
forever and never reach the rest — monitoring that looks healthy and silently
covers a fraction of its boards. That is this product's signature failure
occurring inside its own scheduler.

- **Checkpoint after every account, not at the end.** A checkpoint written only
  on a clean finish is one that never survives the thing it exists for.
- **A two-minute run budget**, conservative against any plausible container
  timeout. Pausing is logged but is not an error: the work is saved and the
  next run continues it.
- **A checkpoint older than a day is abandoned.** Without that, one bad account
  list could freeze the queue forever while every run reported success.

## ADR-027 — Making the docs and the UI stop contradicting ADR-025
**Date:** 2026-09-21 · **Status:** accepted
Settling ADR-010 made several things in the repository false. Two of them were
worse than untidy.

**The answer key was wrong.** `docs/05-architecture-walkthrough.md` exists for
one purpose: so that a reviewer's questions get true answers. It still said
"three mutations, all opt-in" and "the product shape is an open decision" —
so the document whose whole job is to be correct under questioning would have
produced a wrong answer to the most consequential question a reviewer asks. It
now says: none, v1 requests no write scope, here is what the writes would have
bought and why that was a bad trade.

**The UI advertised something nobody can buy.** `RepairPanel` still rendered
"One-click repair is a Pro feature", with a list of tickable checkboxes that
could never apply anything. That is precisely the sentence ADR-025 called *a
lie with a price tag on it*, sitting in the product rather than in a gate
function. Three states now stay distinguishable, because collapsing the first
two is the lie:

- **not in this build** → no checkboxes, no upsell, and a plain statement that
  Template Guard has no permission to write to your boards;
- **available but plan-gated** → a real upsell for something real;
- **available and allowed** → checkboxes and a button.

Also corrected: the README scope table and pricing table, the deployment doc's
console instructions, and the roadmap's "blocked on the owner".

The dated research documents — 03, 04, 07, 08 — were **not** rewritten. Their
reasoning was right when written, and editing them to match a later decision
would destroy the record of how the decision was reached. Each carries a
forward pointer saying what superseded it.

**The general lesson, which is the reason this has an ADR at all:** a decision
is not finished when it is recorded. Documentation that contradicts the code is
worse than no documentation, because it is trusted. The one place that matters
most is the document written to be spoken aloud to a reviewer.
