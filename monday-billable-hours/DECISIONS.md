# Decision log

Append-only. Newest last. Every entry: date, decision, reasoning, what would
reverse it.

---

## 2026-09-16 — Gate 0 FAILED. Stop the monday billable-hours app.

**Decision:** Stop. No build, no outreach, no marketplace submission.

**Who:** Claude ran the kill-checks at Samet's request and returned the verdict.
Samet has not yet confirmed. Confirmation requires the 45 minutes in `VERIFY.md`.

**Reasoning (full evidence in `KILL-CHECKS.md`):**

1. **The wedge is taken.** Tracket (Avisi Apps) advertises the complete feature
   set: automatic billable/non-billable split, rates, invoice generation,
   drill-down by project/client/team member/custom field, export, subitem time,
   timesheet approvals, billing API. 7pace (Appfire) covers most of it too.
   Nothing in the spec is absent from Tracket's marketing copy.
2. **monday's marketplace policy rejects this app twice over** — once for
   significantly replicating an existing marketplace app, once for being built
   primarily with AI-generated code.
3. **The headline feature is native.** Subitem→parent time rollup is the
   "Show Summary on Parent Item" checkbox on monday's subitem Time Tracking
   column.
4. **The pitch contradicts itself.** Standard-tier accounts have no Time Tracking
   column, therefore no logged time, therefore nothing for a reporting-only app
   to read. Reporting requires Pro. Pro users already have Tracket and 7pace.
   Serving Standard requires building capture — a timer — which was explicitly
   ruled out as scope-tripling and duplicative. There is no third door.

Point 4 is the load-bearing one. It follows from two facts in Samet's own brief
and needs no external source. It was true before any competitor existed.

**Cost of this decision:** zero build hours. The 30-hour Gate 3 budget is
untouched. This is the cheapest possible outcome and it is the gate working
exactly as designed.

**What would reverse it:** only a `VERIFY.md` check coming back contrary — in
particular, Check 3 showing that Standard-plan accounts *do* have usable time
data, or Check 2 showing Tracket genuinely lacks per-client rates and export with
reviews complaining about exactly that. Nothing else. Not a new feature idea, not
a cheaper price point, not a different segment.

**Explicitly not decided:** whether monday is a dead platform for Samet. It is
not. The AI-code policy is a real constraint on *how* he builds, and the
duplicate-rejection policy is a real constraint on *what* he builds, but neither
says "never." A genuinely novel monday app he understands deeply is a different
submission. That would be a new Gate 0, with a new date, not a continuation of
this one.

---

## 2026-09-16 — Process note: Gate 0 was run 6 days late; Gate 1 is tomorrow

**FACT:** Gate 0 was due 10 Sep 2026. It was first run 16 Sep 2026. Gate 1 is due
17 Sep 2026 and requires 30 outreach messages; 0 have been sent.

**Why this is in the log:** the gates did their job on content and failed on
timing. The kill-checks were answerable in about two hours of research — they
were not blocked on anything, they were just not started. That is the finishing
problem the brief names, showing up on the very first gate of the project.

**Not a criticism to dwell on. A calibration input.** Any future project should
assume Gate 0 slips ~6 days unless it is the literal first thing done in the
first session.

**No renegotiation.** Gate 1 is not moved. It is moot because Gate 0 failed, not
because the date was inconvenient.

---

## 2026-09-16 (second pass) — Install data found. Verdict unchanged, and worse.

**New FACTs:**

- Tracket: **8,827 total installs** since 4 Nov 2021, **~152 installs/month**
  (apps-for-monday.com, via search).
- 7pace Timetracker: monday.com **Best-Selling App for 2024**; in 2023 the most
  installed app in its first 90 days (Appfire newsroom / PRNewswire).

Ratings and review counts are still UNKNOWN. Installs are not revenue.

**What this changes:** the original thesis read "869 apps vs 250,000+ customers"
as under-supply. The install data reads the other way. The category leader, with
five years of compounding and Editor's Choice placement, has reached ~3.5%
penetration and grows at 152/month. That is not a market being left on the table;
that is a market where most customers have decided the add-on is not worth paying
for — they upgrade to Pro, or they live without it.

A new entrant with no reviews, no placement and fewer features than Tracket would
realistically see single-digit installs per month in year one, assuming it were
approved at all. At $39/month that clears Gate 4 on a technicality and is still
not a business.

**Decision unchanged: stop.** The new data removes the last optimistic reading
rather than supporting one.

---

## 2026-09-16 — Project CLOSED

**Status:** closed at Gate 0. Docs committed, PR #17 open as the record.

**Total build hours: 0 of the 30-hour budget.** Research only.

**What was actually delivered today:** a dated, sourced reason not to spend 30
hours. That is the entire output and it is the correct one.

**Reopening conditions — all of these, not any of these:**
1. `VERIFY.md` Check 3 shows Standard-plan accounts have usable time data
   (resolving the contradiction), AND
2. `VERIFY.md` Check 2 shows Tracket genuinely lacks per-client rates or invoice
   export, with reviews complaining about exactly that, AND
3. A route past the AI-generated-code policy exists and is written down.

Any one of these alone is not enough. Two out of three is not enough. That bar is
deliberately high because the cost of reopening on hope is 30 hours and the
cost of leaving it closed is zero.

**Not reopening conditions:** a new feature idea, a lower price, a different
segment, a fresh burst of motivation, or having a free day.

---

## 2026-09-17 — Built the Board Schema Auditor. Validation still not done.

**Decision:** built it, on Samet's explicit instruction after the validation
concern was raised twice and overruled twice. Recorded here so the sequence is
not misremembered later.

**Not done before building, and still not done:**
- `NEXT-GATE0.md` Q1 (can he remediate a Burp finding) — unanswered.
- `NEXT-GATE0.md` Q2 (honest route past the AI-code policy) — unanswered.
- Marketplace check that no equivalent app exists — not run.
- Ten admin conversations about column drift — zero held.

So the code exists and the business case does not. That is a choice, not an
oversight, and it is his to make.

**What got built:** `monday-schema-auditor/`. Read-only board view, one runtime
dependency, ~19 kB bundle, 46 passing tests, verified end to end in headless
Chromium. Architecture splits a zero-dependency diff engine from a single
monday-facing adapter.

**Material finding that changes the architecture advice in `IDEAS.md`:**

The no-backend design depends on `monday.api()` querying GraphQL on behalf of
the signed-in user. Verified against the installed packages:

- `monday-sdk-js@0.5.9` has `api()` and warns it will be removed in 1.0.0.
- `monday-sdk-js@1.0.0-beta` — the current `latest` tag — **has already removed
  it**. The client exposes only get/set/listen/execute/storage/oauth.
- The suggested replacement `@mondaydotcomorg/api` **requires an API token**,
  which a seamless client-side app does not have.

The dependency is pinned to 0.5.9 deliberately. The seamless-auth escape from
the security-review burden has a shelf life, and the documented upgrade path
currently reintroduces the backend that design exists to avoid. Open risk,
confined to one file.

Had this been written from memory rather than checked against the package, the
app would have shipped calling a method that no longer exists.

**What would still kill it:** the retention objection from `IDEAS.md`, unchanged.
An audit is run once, acted on, and cancelled. Nothing built today addresses
that, and continuous alerting would need the backend.

## 2026-09-19 — Time and project restrictions lifted (Samet)

Samet is now on Claude Max and removed the rules that limited his time and
projects: the hour ledger and 20/30 build-hour budgets, "~45 unstarted ideas
stay outside / adding a 46th idea is not progress", the rule to refuse
later-phase work even when he asks twice, and the platform Gate 0 as a block on
new monday ideas (`NEXT-GATE0.md` is now a checklist). `README.md`,
`CLAUDE.md`, `BACKLOG.md`, `NEXT-GATE0.md`, `PLATFORM.md` and `IDEAS.md` were
updated. The evidence behind stopping the billable-hours app, the $100 budget,
the evidence-labelling rules and "no company before Gate 4" are unchanged.
Entries above are kept as history.

---

## 2026-09-19 — Stop the Board Schema Auditor.

**Decision:** stop. Do not submit it, do not build more features on it.

**Evidence** (`COMPETITORS.md`, from marketplace pages Samet captured, since
monday is unreachable from this environment):

1. **The category does not sell on volume.** Ten workspace-hygiene apps from ten
   different developers: 5, 8, 10, 13, 23, 26, 37, 42, 81, 170 installs — median
   23. Workflow and reporting tools in the same search: 721 to 17,800.
2. **The category does not sell on price either.** Workspace Doctor, the nearest
   competitor, charges **$2/month for 3 seats, $4 for 5, $8 for 10, with a free
   tier**. 23 installs against that ceiling is on the order of $1–2k/year gross.
   This closes the counter-argument recorded three hours earlier, that low volume
   might be offset by an admin-tool price. It is not.
3. **Duplicate risk is high.** Workspace Doctor is "scan, score & fix your monday
   workspace in one click", sold to admins on large accounts, producing a
   prioritized findings list with CSV export. The auditor is the same sentence
   with one category swapped. Its headline feature is status-label drift across
   boards — and comparing status labels was the auditor's planned next feature.

Points 1 and 2 do not depend on a reviewer's judgement. Even a clean approval and
a total win over the incumbent lands on a few thousand dollars a year.

**What this does not mean.** The code is not the problem. It works, it is tested,
it is secure, and it does something Workspace Doctor genuinely does not do. The
market is the problem, and no amount of building fixes that.

**What was actually learned, and is worth keeping:**

- Workspace Doctor is a working template for what clears monday's review: hosted
  on monday code, four minimal OAuth scopes, AES-256, deletion on uninstall, and
  a privacy statement written into the listing copy. Recorded in
  `COMPETITORS.md`.
- The no-backend architecture was right for a security review and wrong for a
  subscription. Workspace Doctor solved retention with weekly scheduled checks
  and email summaries, which needs the backend the auditor avoided. Any future
  monday product has to pick a side of that trade deliberately.
- Free tier plus seat-banded pricing is the norm here, at single-digit dollars.
  Any future monday revenue model should start from that, not from $39/month.
- Samet now has a shipped-quality monday app: 75 tests, a security review with a
  real High finding found and fixed, CI, and a verified end-to-end build. That is
  the first finished artifact in the repository. It did not become a product, but
  it is no longer true that nothing has been built.

**Two monday products screened and stopped in four days, both on evidence, with
no submission and no money spent.** That is the gate system working, not
a failure.

**What would reopen it:** nothing currently foreseeable. Not a new feature, not a
lower price, not a different segment. Only a demonstrated buyer — someone saying
they will pay a real number for column-structure drift specifically, unprompted.

---

## 2026-09-20 — Building the Automation Watchdog. Why this one is different.

**Decision:** build Candidate G from the third screening round.

**The reason is structural, not enthusiasm.** Two products died in this
repository, both killed by the market and neither by the code:

- **Billable-hours reporting** — reported on time instead of capturing it.
- **Board Schema Auditor** — reported on structure instead of fixing it.

Both were audits. **An audit is run once, acted on, and cancelled**, which is why
workspace-hygiene apps on this marketplace sit at a median of 23 installs and
charge $2–8/month.

A watchdog cannot be cancelled without turning it off. Retention is the product
rather than a feature bolted onto it. That is the entire argument, and it is the
first time a candidate has had one.

### The evidence it rests on

- **FACT:** monday automatically deactivates an automation when a referenced
  group, board, status label or user is deleted, or when limits are hit, and
  **sends no notification**. One reported case ran silently for weeks.
- **FACT:** an automation can show a green toggle and no error badge while
  failing every run.
- **FACT:** Slack/Gmail/Salesforce integration tokens expire roughly every 90
  days, after which those automations fail silently.
- **FACT:** monday does not allow email notification of automation failures.
- **FACT:** two open community feature requests ask for exactly this.
- **No automation-monitoring app surfaced in any search**, and no native
  mechanism exists.

### Built around unknowns rather than past them

`developer.monday.com` is unreachable from this environment, so three things were
designed so the answer does not matter:

1. **Whether the API identifies automation-performed actions is UNVERIFIED.** So
   a signal is any repeating (actor, event, entity, board) pattern. If monday
   does expose automations, labels sharpen; if not, patterns still go quiet when
   the automation behind them dies. Monitoring by outcome, not by status.
2. **The `created_at` format is UNVERIFIED**, and a community thread exists about
   that specific field — which does not happen for a plain ISO string. Guessing
   wrong would not throw; it would scale every interval by a thousand and produce
   confident nonsense. So timestamps normalise by magnitude instead.
3. **monday code's storage and scheduling APIs are UNVERIFIED.** So `runCheck`
   takes injected `storage` and `mailer` interfaces. Writing them from memory
   would have produced something that looks finished and does not run.

### Two bugs worth remembering

Both were the failure the product exists to prevent, found in the product itself:

- Inferring inactive weekdays from absence alone froze the active-time clock, so
  a dead signal could never escalate past 'late'. **A monitor that silently stops
  escalating.**
- A numeric `0` timestamp fell through to `Date.parse`, which returns the year
  2000 in Node — turning an obviously broken value into a confident date.

### State of it

71 tests, all offline. Detection, alert suppression, email rendering and the
scheduled job are complete and tested. The UI works against generated demo data
and was verified in a browser.

**Still missing: a host.** Nothing schedules `runCheck` and nothing sends real
mail. That is one file's work once the monday code APIs can be read.

**Still missing: a customer.** Nobody has said they would pay for this. The
evidence is monday's own documentation and two community threads, which is more
than the previous two products had at this stage and is still not a person.

**New security question this product introduces:** the UI uses seamless auth and
holds no secret, but a scheduled job runs with no user present and needs a stored
token. That is the first secret any product in this repository has held, and it
is the main thing its security review will be about.

## 2026-09-26 — The validation-first rule is removed

**Decision (Samet):** "prove people want it before continuing" is no longer a
working rule for Claude on this project, in any wording. Removed from
`CLAUDE.md`, `README.md`, `PROGRESS.md`, `VALIDATION.md`, `NEXT-GATE0.md` and
`../monday-schema-auditor/README.md`.

**Kept:** every research result, lead, quote, competitor finding, validation
note and past decision. They are data. Only the instruction to stop or wait on
them is gone.

