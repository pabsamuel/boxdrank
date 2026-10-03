# VERIFY.md — the 45 minutes you have to spend yourself

I was blocked from every monday.com domain by this session's network policy
(`connect_rejected`, organization egress policy). I could not open one
marketplace listing. So the ratings, review counts and exact prices in
`KILL-CHECKS.md` are **UNKNOWN**, and I refused to invent them.

Before you accept the stop as final, spend 45 minutes in your own browser. If
every box below comes back the way I expect, the stop is confirmed and you move
on. If one comes back differently, reopen Gate 0 — but only on evidence, not on
hope.

Timebox it. **45 minutes. Not an afternoon.**

---

## Check 1 — The marketplace category (15 min)

Open <https://monday.com/marketplace> → search "time tracking", then "timesheet",
then "billable".

Write down, for every app that appears:

| App | Price | Rating | # Reviews | Does it do rates + billable split + client rollup + export? |
|---|---|---|---|---|

**I expect:** 10–20 apps, several with real review counts, at least one
(Tracket) with all four features.

**Reopen Gate 0 only if:** every app is either a bare timer with no rates/export,
or has near-zero reviews. That would mean the category is listed but not actually
served. I think that is unlikely.

---

## Check 2 — Tracket specifically (10 min)

Open the Tracket listing and <https://apps.avisi.com/apps/tracket>.

- [ ] Does it do **per-client hourly rates**? (not just per-person)
- [ ] Does it do a **billable / non-billable split**?
- [ ] Does it produce an **invoice-ready export** (CSV or otherwise)?
- [ ] What does it actually cost for a **25-seat team**?
- [ ] What is its rating and review count?

**I expect:** yes to the first three. Its own marketing says all three plainly.

**Reopen Gate 0 only if:** it genuinely lacks per-client rates or export, AND
reviews complain about exactly that. A missing feature nobody asks for is not a
wedge.

---

## Check 3 — The contradiction (5 min) — **do this one first if you only do one**

Log into a **Standard**-plan monday account (or check the plan comparison page).

- [ ] Can you add a **Time Tracking column**? (I expect: no, Pro+ only)
- [ ] If no — **where would your reporting app read hours from?**

**This is the check that ends it.** If Standard has no Time Tracking column, a
read-only reporting app has nothing to read, and your "4.5x cheaper than
upgrading to Pro" pitch has no product behind it. No competitor analysis
required.

Answer that question honestly before you look at anything else.

---

## Check 4 — The AI-code policy (10 min)

Open <https://developer.monday.com/apps/docs/submit-your-app> and
<https://developer.monday.com/apps/docs/app-listing-guidelines>.

- [ ] Find the sentence about **no-code platforms / AI-generated "vibe code."**
      Copy it verbatim into `PLATFORM.md` with the date you read it.
- [ ] Find the sentence about **duplicating existing marketplace apps.** Same.
- [ ] Is there any stated exception, appeal, or disclosure process?

**I expect:** both sentences are there, with no exception process.

**This matters beyond this app.** If monday rejects AI-assisted builds as a
category, that is a fact about your whole relationship with this marketplace,
not about billable hours. It belongs in `PLATFORM.md` permanently.

---

## Check 5 — Vibe (5 min)

Open monday Vibe in your account, if you have access. Prompt it with:

> "Show me total hours per client from this board, with an hourly rate per client
> and a billable/non-billable split."

- [ ] What does it produce?
- [ ] Would a 25-seat customer accept that instead of paying $39/month?

**I expect:** something rough but recognizable. Note what it actually does — this
is the single most useful thing you can learn today about building *anything* on
monday, and it applies to all 45 of your other ideas.

---

## After the 45 minutes

Write one paragraph at the bottom of `DECISIONS.md`:

- Confirmed the stop → say so, date it, close the project.
- Found something that genuinely contradicts the verdict → say exactly which
  check, with the numbers, and reopen Gate 0 with a new date.

Do not write "maybe" and leave it open. An open project you are not working on
is the 46th idea.
