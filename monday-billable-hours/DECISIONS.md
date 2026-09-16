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
