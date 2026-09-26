# Workspace Doctor — the nearest neighbour, read properly

**Read:** 20 Sep 2026, from the listing, by Samet.
**Verdict: the clear holds, but it narrows — and the listing hands us two
things worth more than the verdict.**

> **Superseded in part, ADR-025.** The product-shape question this document
> treats as open was settled on 20 Sep 2026 by **ADR-025**: ship the auditor
> and the monitoring, cut one-click repair from v1. This file is kept as the
> record of the reasoning at the time, not as a live recommendation.


`docs/04-marketplace-scan.md` flagged this as *"the only genuinely adjacent
listing, not yet opened — do this before committing."* Now opened.

## What it is

| | |
|---|---|
| **App** | Workspace Doctor, by Tiberiu Jinga (Leano) |
| **Launched** | Jun 2026 — roughly three months old |
| **Installs** | 23 |
| **Rating** | None yet |
| **Surface** | Administration (not a board view) |
| **Categories** | Reporting & analytics · Productivity & efficiency · Team management |

*"A one-click health check for your monday.com account. Built for admins, ops
leads, and workspace owners on large or fast-growing accounts."* A single
0–100% health score across four categories, plus a prioritised findings list.

**What it scans:**

1. **Board Health** — boards nobody has updated past a staleness threshold,
   boards left empty past a grace period.
2. **Status Consistency** — *their stated headline feature*. Three-layer
   detection of **label drift**: fuzzy matching for typos ("Done"/"done!"), a
   dictionary for synonyms ("Completed"/"Resolved"), and AI embeddings for
   domain terms ("Wrapped Up"). Same-column exclusion prevents false positives.
3. **User Hygiene** — items still assigned to deactivated users.
4. **Adoption** — workspaces with very low recent activity.

Plus: a score-history chart over 30/90/365 days, weekly scheduled checks on a
day you choose, an email summary when a check finishes, and CSV export.

## The overlap is real, and it is narrower than it looks

Their headline feature and our `altered` severity both use the words *label*
and *drift*. That is close enough that pretending otherwise would be the kind
of comfortable reading this project is supposed to refuse. But the **unit of
analysis is different**, and that difference is the whole product:

| | Workspace Doctor | Template Guard |
|---|---|---|
| Question it answers | "Is my account internally consistent?" | "Did this copy come out of the template intact?" |
| Compares | Every board against every other board | One copy against **one designated template snapshot** |
| Needs a template | No — there is no template concept | Yes; it is the entire premise |
| Column **missing** from a copy | Not detected | `missing` |
| Column **type changed** (Budget: number → text) | Not detected | `altered` |
| Column **renamed** vs deleted-and-re-added | Not detected | `altered`, with a confidence grade |
| Connect column pointing at the **wrong board** | **Not detected** | `miswired` — top severity |
| Automations dropped on duplication (44 → 39) | Not detected | Behind the preview flag |
| Status labels inconsistent across the account | **Yes — three-layer, with AI** | Only as a per-column settings difference between a copy and its template |
| Stale boards, dead assignees, adoption | Yes | No, and never — those need item data |

So: they do one of our finding types better than we do, at account scale, and
none of the other five. We do a thing they structurally cannot — they have no
template to compare against, so "this copy is missing the Owner column" is not
a question their model can ask.

**What it costs us:** the sentence *"nothing on the marketplace is adjacent"*
is no longer true, and the positioning has to get sharper than "we find drift."
The line that survives contact with this listing is the one we already have:

> A connect column that kept pointing at the template's board. It looks
> completely normal — linked items appear, automations run without erroring —
> and every one of those items is on the wrong client's board.

Workspace Doctor does not detect that. Nothing does.

## The two things the listing gives us, which are worth more than the verdict

### 1. `monday code` — a third option for ADR-010

> *"Runs entirely on monday's own infrastructure (monday code), never on
> third-party servers; data is encrypted at rest (AES-256). Only anonymous
> status labels reach the AI layer — never board content, item names, or user
> details. Four minimal OAuth scopes, and everything is deleted on uninstall."*

Read that paragraph again with ADR-010 in mind. The open decision is:

- **Read-only, client-side** — easy security review, but no scheduled
  monitoring, and therefore weak retention. (#17's shape.)
- **Server + OAuth + stored tokens** — monitoring works, but we own a backend,
  stored credentials, and a Burp scan against our own host. (What we built.)

Workspace Doctor is doing **both**: scheduled weekly checks, email summaries,
stored history — with *"never on third-party servers"* in the listing. It
resolves the tension #17 called *"unresolved and the most likely way this idea
fails"* by hosting the backend **on monday**.

That is not a competitive observation, it is a design one. If monday code can
run our Express server and hold our SQLite file, then:

- The "third-party server" objection disappears from the security review.
- Gate item #3 — the Burp scan on our own deployed host — shrinks or vanishes.
- The retention argument for `drift/` survives without paying the security
  price that made ADR-010 a genuine dilemma.

**This is now the highest-value unknown in the project**, ahead of the `✱` API
claims. It does not change the diff engine at all — `Storage` and the Express
app are already behind interfaces — but it could change which shape we ship,
and it is the first evidence that the dilemma has a third answer. Recorded as
**ADR-018**.

⚠️ Unverified: what monday code actually supports (runtime, persistent storage,
scheduled execution, outbound network). It is read off a competitor's marketing
paragraph, which is the weakest possible source. Confirm against monday's own
documentation before anything depends on it.

### 2. Their data paragraph is proof the claim shortens review

We wrote *"say the data handling plainly in the listing, it shortens security
review"* as an assumption from the brief. A live listing now leads its privacy
section with exactly that construction: where it runs, what is encrypted, what
never leaves, how few scopes, what happens on uninstall.

Our version is already written (`docs/06-deployment-and-submission.md`) and is
**stronger on one axis**: we request no item scopes at all, so there is no item
data to promise not to send anywhere. Their model cannot make that claim —
stale-board and dead-assignee detection require reading items.

Worth stealing from them: naming *deletion on uninstall* explicitly. We do not
currently say what happens to a snapshot when the app is removed. It should be
"deleted", and it should be in the listing and implemented.

## The install number is the harder finding, again

**23 installs in three months.** Launched June 2026, no ratings.

This is a competent app: four scan categories, AI embeddings, a health score,
scheduled checks, email summaries, CSV export, a real privacy story, and
listing artwork better than most. It is tagged into **Reporting & analytics**,
the category where the 17.8K-install apps live — so it is not hiding in a
backwater either.

It did 23 installs.

That is roughly eight a month for a polished admin-audit product with AI
features and good positioning. It does not prove the category cannot pay — one
app's marketing is not a market — but it is the second measured data point
pointing the same direction as the first (`docs/04-marketplace-scan.md`: the
category tops out at 951 while reporting apps reach 17.8K), and the two
together are more than a hunch.

**It does not change what to build. It changes what to do before spending
money on marketing.** The ten admin conversations were already load-bearing
after the scan. They are now the only thing standing between "a gap nobody
noticed" and "a gap that has been tested by someone else and returned 23
installs."

One honest counter-reading, because it is genuinely available: Workspace
Doctor's findings are all *hygiene* — stale boards, inconsistent labels, dead
assignees. Hygiene is a nice-to-have; nobody's client work breaks because a
label says "Done!" instead of "Done". Template Guard's headline finding is not
hygiene, it is **a board silently writing to the wrong client's board for three
weeks**. Those may sell completely differently. That is a hypothesis, not a
defence, and ten conversations settle it.

## What changes in this repository

1. **ADR-018** — investigate monday code as the deployment target. Highest
   priority, ahead of the `✱` claims.
2. **Positioning** — lead with mis-wiring and template fidelity, never with
   "drift". `README.md` already does; the eventual listing must too.
3. **Deletion on uninstall** — add it, say it. Currently neither.
4. Gate item #1 stays **cleared**, with this listing named as the nearest
   neighbour and the distinction written down rather than assumed.
