# Platform Gate 0 — is monday.com's marketplace viable for Samet at all?

Opened: 16 Sep 2026, after "find a new monday.com idea and start to do it."
Due: 20 Sep 2026.

(19 Sep 2026: this is a checklist, not a block. New monday ideas and builds can
start at any time; answer these questions alongside them.)

## Why this matters for every monday idea

**The marketplace bar is idea-independent, and it is not small.** Every finding
below applies to any idea. Answering these three questions early avoids
discovering them at submission.

## What every marketplace app must clear — *FACTs, 16 Sep 2026, via search*

From `developer.monday.com` privacy-and-security and submission docs:

- **All domains must pass a provided Burp scan.** Findings are disclosed during
  review and **must be fixed before approval**.
- **Tokens must be encrypted.** You must provide supporting evidence describing
  how secrets are stored, and whether any are in the code repository.
- You must **elaborate on the security controls protecting the monday user
  access token**.
- **TLS 1.2+** on all traffic; **HSTS enabled with min-age ≥ 1 year**.
- App must align with the **Vibe design system**.
- **Four-phase review**; initial response within 72 business hours; the review
  team collaborates with you on a monday board and asks questions.
- Assessed on product, engineering, security, privacy, content, assets, support,
  documentation and legal.
- **No apps built primarily with no-code platforms or AI-generated "vibe code."**
- **No apps that duplicate existing marketplace apps or integrations.**

## The three questions

### Q1 — Can you personally remediate a Burp scan finding on your own app?

Not "can Claude write a fix." Can *you* read a scan report naming, say, a missing
security header or a reflected parameter, find it in your own code, fix it, and
explain the fix to a reviewer on a board?

Your own brief says: *"I do NOT debug unfamiliar platforms fast."* Security
remediation on an unfamiliar platform under review pressure is the hardest
version of that.

**If no:** the marketplace is closed to you until that changes, whatever the idea.
That is not a failure, it is a fact about sequencing.

### Q2 — Is there a route past the AI-generated-code policy that you can state honestly?

The policy rejects apps built *primarily* with AI-generated code. You build
AI-assisted. Those are not automatically the same thing — but the difference has
to be real, not a wording trick.

The test: **could you explain your own architecture, unprompted, to a reviewer?**
If yes, you are an AI-assisted developer and you can say so. If no, you are what
the policy is aimed at, and no phrasing fixes it.

Answer this honestly, in writing, before anything else. Getting rejected at phase
four for this reason costs the whole build.

### Q3 — Does the idea come from evidence or from a brainstorm? *(research note, not a pass criterion)*

An idea invented from training data carries zero demand evidence. The best
source, per monday's own developer guidance: the **monday
community idea board and feature-request section**, sorted by votes, plus the
community forum and user groups. Highly-upvoted requests are demand signal.
I am network-blocked from all of it; you are not.

**Your 60 minutes:** open the feature-request board, sort by votes, and write down
the top 10 requests that (a) are not already a marketplace app, and (b) do not
need a Pro-only column to function. That list is worth more than anything I could
brainstorm, because every line has votes attached.

## Passing this gate

Pass = Q1 yes, Q2 answered honestly in the affirmative.

**Fail on Q1 or Q2 → the monday marketplace is closed for now.** Then the honest
options are:

- **Private / client apps.** monday apps do not have to be listed. Building for
  one paying client skips marketplace review entirely — no Burp scan, no Vibe
  design system, no duplicate policy. It is a service business, not a product,
  but it ships and it earns, and you have shipped nothing.
- **Fix Q1 first**, deliberately.
- **Leave the platform.** Also a valid answer.
