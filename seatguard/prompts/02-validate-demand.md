# Prompt — Phase 2: validate demand before building more

Paste into a fresh Claude Code session in this repo.

---

Read `docs/PRODUCT.md`.

Do not write code. This phase is about finding out whether anyone wants this
before more of my weekends go into it. 42% of Shopify apps have zero reviews —
they were built for customers who never existed.

Target: **ten monday.com admins who say they would pay $39/month, with emails
collected.**

Help me with:

1. **The artefact.** Run
   `node src/cli.js fixtures/demo-account.json --html demo.html` and review the
   output as a stranger would. Does the dollar figure land in the first two
   seconds? Is anything confusing or over-claimed? Fix the report wording in
   `src/report.js` if so — that file is the only place formatting lives.

2. **Where to ask.** The monday community forum has an open feature request for
   platform administration and governance tooling, plus long threads on
   permission limitations. Find the specific threads where people are already
   complaining. Also: r/mondaydotcom, monday consultancies, LinkedIn searches
   for "monday.com admin" and "operations manager" at agencies.

3. **What to say.** Draft a short forum post and a shorter LinkedIn DM. Rules:
   lead with the problem, not the product; no pitch in the first message; ask
   whether the problem is real before mentioning that I built something. Offer a
   free audit of their account as the hook.

4. **Tracking.** A simple markdown file — who, where, what they said, email
   collected yes/no.

Kill criterion, agreed in advance: fewer than ten yeses after two weeks of
genuine asking means stop, and I keep the engine for the next idea. Hold me to
this.
