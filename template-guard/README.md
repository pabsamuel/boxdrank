# Template Guard

A monday.com marketplace app that finds the configuration monday silently drops
when you duplicate a board.

## The problem

Agencies and ops teams duplicate a template board for every new client. monday
does not copy everything, and it does not tell you what it left behind:

- Automations built on integration blocks — email, Slack — do not transfer.
- Cross-board recipes, custom recipes, and anything with item mapping do not
  transfer.
- Automations vanish with no pattern anyone can predict. One documented case:
  **a board with 44 automations produced a copy with 39.**
- Connect-board columns keep pointing at the board ID they were copied from, so
  the new client's board quietly reads and writes the *template's* board.

Nothing errors. Nothing warns. The workflow just does not run, often for weeks.

That last one is the worst and the reason this app exists. A mis-wired connect
column looks completely normal — it shows linked items, automations run without
erroring — and every one of those items is on the wrong board.

## What it does

1. **Designate a template.** Mark any board as a template; Template Guard
   snapshots its columns, column settings, groups, views, permissions and board
   connections.
2. **Diff a copy against it.** Findings grouped by severity: `miswired`,
   `missing`, `altered`, `cosmetic`. Every finding says what is wrong, *why it
   matters*, and how to fix it.
3. **Repair checklist.** A precise, deep-linked list of exactly what to change,
   with an explanation of each item. Template Guard never makes the change for
   you — v1 requests no write permission at all (ADR-025).
4. **Drift monitoring** (paid). Re-check linked boards on a schedule and notify
   when a live board diverges from its template.

## What it stores

**Board IDs, column IDs, and configuration. Nothing else.**

No item names, no column values, no files, no update text, no user emails. One
exception, stated rather than buried: the monday **user id** of whoever
installed the app, captured at OAuth so a drift alert has somewhere to go. An
identifier, not content — and the only user-identifying value stored.

The
app never issues a query that fetches items — which is also why it stays fast on
a board with 5,000 rows.

**Everything is deleted when you uninstall.** The install token, every template
snapshot, the plan record — erased in one transaction when monday reports the
uninstall, not marked deleted (ADR-019).

This is enforced at the storage boundary by `assertNoItemData()` in
`src/server/storage.ts`, not just promised in a policy document. Access tokens
are encrypted at rest with AES-256-GCM.

## Status

| Piece | State |
|---|---|
| API findings report | Done — `docs/00-api-findings.md` |
| Snapshot + diff engine | Done, 234 tests |
| Repair layer | Done |
| Board view + dashboard widget | Done, builds clean, and served by the server in production (ADR-023) |
| OAuth + server | Done, **never run against a live monday account** |
| Durable storage | Done — three implementations behind one `Storage` interface: in-memory, SQLite, monday code (ADR-013, ADR-020) |
| monday code hosting | Done, **never run on the platform** — `docs/06-deployment-and-submission.md` Part 5 |
| Drift monitoring | Done — engine, scheduler, and delivery to a monday notification or a webhook (ADR-021) |
| Billing | Done — signed subscription webhook syncs plan state; plan surface links to monday's upgrade page. No payment form, by design. |
| Security hardening | Done — CSP, CORS, rate limiting, HTTPS enforcement (ADR-015) |
| Deployment | Done — `Dockerfile`, `docs/06-deployment-and-submission.md` |

**Nothing here has touched a real monday account.** See *Before you ship* below,
and `STATUS.md` for how much of the project is done and what is left.

## Local development

```bash
cd template-guard
npm install
cp .env.example .env     # then fill it in
npm test                 # 234 tests, no network, no credentials needed
npm run typecheck
npm run dev              # client on :8301
npm run dev:server       # API on :8302
```

The diff engine is pure and has no monday dependency, so `npm test` works with
no credentials at all. That is deliberate — the matching heuristics are the
riskiest part of the product and they need to be testable in isolation.

### Environment

| Variable | What it is |
|---|---|
| `MONDAY_CLIENT_ID` / `MONDAY_CLIENT_SECRET` | From the monday developer console, your app → OAuth |
| `MONDAY_SIGNING_SECRET` | Signs OAuth state and verifies the embedded view's session token |
| `MONDAY_REDIRECT_URI` | Must match the console exactly |
| `TOKEN_ENCRYPTION_KEY` | 32 bytes base64: `openssl rand -base64 32` |
| `DATABASE_FILE` | SQLite file. Defaults to `./data/template-guard.db`. Set to `:memory:` only for throwaway runs — every install token is lost on restart, and the server says so on the way up. |
| `DRIFT_SCHEDULER_ENABLED` | `true` starts the drift sweep loop in-process. Default off. |
| `DRIFT_INTERVAL_MS` | How often a sweep starts. Default 6 hours. |
| `FEATURE_AUTOMATIONS_PREVIEW` | Default `false`. See below. |

## The monday app manifest

`monday-app-manifest.json` is a reference copy of what should be entered in the
[developer console](https://monday.com/developers/apps). monday does not accept
a manifest upload for app configuration, so that file is the source of truth the
console is kept in sync with, and what a reviewer can diff against.

Features to create in the console:

| Feature | URL |
|---|---|
| Board View | `https://YOUR-DOMAIN/` |
| Dashboard Widget (item-less) | `https://YOUR-DOMAIN/?surface=widget` |

### Required scopes

Three. `requiredScopes()` derives them, so the consent screen can never ask for
a permission this deployment is not configured to use.

| Scope | Why |
|---|---|
| `boards:read` | Read board structure. The entire comparison is built from this. |
| `account:read` | Account ID and slug, for deep links and per-account billing. |
| `me:read` | Identify the installing user at OAuth, and record their id so drift alerts have a recipient. |

**No write scope, and no item, update or file scopes.** `boards:write` is
requested **only** when `FEATURE_ONE_CLICK_REPAIR` is on, and v1 ships with it
off (ADR-025) — so Template Guard cannot write to a board, and could not read
an item if it wanted to.

Not holding a permission is a stronger claim at security review than promising
not to use it, and this is the shortest version of that conversation the
product can have.

## API version

Pinned to **`2026-07`** in exactly one place: `src/api/version.ts`.

monday ships a new version quarterly and guarantees each stable for at least six
months. `2026-04` is in maintenance, `2026-10` is the release candidate.
Budget one migration review per quarter.

One live trap worth knowing: the **2026-07 User entity migration** capped
`users` at 200 per page and **fails silently** for callers that assumed
otherwise. `BOARD_PEOPLE_QUERY` paginates explicitly and records a failure
rather than returning a truncated list.

## The preview-schema feature flag

`FEATURE_AUTOMATIONS_PREVIEW`, default **off**.

monday *can* read board automations — `board_automations` returns `id`, `title`,
`is_active` and `configuration` — but only on the **dev (preview)** schema,
which monday documents as "subject to change" and which **cannot be
version-pinned**. The whole mitigation strategy for monday's API is "pin a
version header," and preview is exempt from it.

So automations sit behind a flag, in one isolated adapter
(`src/api/preview/automations.ts`), **read-only**, and **no paid tier depends on
them** (`assertNoPaidPreviewDependency()` enforces this). If monday changes the
preview schema tomorrow, that section degrades to a labelled "could not read
automations" and the rest of the app is untouched.

Full reasoning: `docs/00-api-findings.md` and ADR-002 in `docs/02-decisions.md`.

## How the diff engine works

The hard part is that **duplicated boards get brand-new column IDs**, so there
is nothing to join on. `src/diff/match.ts` infers correspondence in four passes,
most confident first:

1. Same normalized title **and** type, unambiguous on both sides.
2. Same title, different type — the type change *is* the finding.
3. Same type, same ordinal position, titles similar enough to be a rename.
4. The lone unmatched column of a **distinctive** type on each side.

Pass 4 deliberately excludes generic types (`text`, `status`, `people`, …).
Pairing "Scope Notes" with "Invoice Reference" because both happened to be the
last remaining text column would report a confident rename where the truth is
one column removed and one added — two wrong findings, and a user who stops
trusting the tool.

Matches from weak evidence are marked `likely` and the UI says "(best guess)".
A renamed column and a delete-plus-add are genuinely indistinguishable from
outside; presenting a guess as a certainty is its own kind of silent failure.

### Failing loudly

The product claim is "we tell you what silently broke," so the app may never
break silently itself. There is no bare `catch {}` in this codebase.

- A read that partly fails produces a snapshot **plus** typed `PartialFailure`s.
- `null` and `[]` mean different things everywhere: `null` is "we could not
  look", `[]` is "we looked, there is nothing." Conflating them would let the
  app report an unread board as clean.
- An unreadable connect column is reported at **`miswired` severity**, not
  skipped. We will not tell you a column is fine when we do not know.
- Two separate notices with deliberately different volumes: an alarm when a read
  we expected to succeed failed, and a quiet footnote that automations are
  outside the stable API. A warning shown on every screen is wallpaper.

## Pricing

Per **account**, not per seat. The buyer is one ops person administering boards
for everyone else; per-seat pricing on an admin tool makes them justify a bill
that scales with colleagues who will never open the app.

| | Free | Pro ($30–60/mo/account) |
|---|---|---|
| Templates | 1 | Unlimited |
| Manual comparisons | Unlimited | Unlimited |
| All findings, all severities | ✓ | ✓ |
| Manual repair checklist | ✓ | ✓ |
| Scheduled drift monitoring | — | ✓ |
| Notifications | — | ✓ |

**One-click repair is not in v1** and is not sold as if it were (ADR-025). The
code exists and is switched off; what ships is the manual checklist, on every
tier. Pro sells not having to remember to check — which is what it always
sold, because the highest-severity finding was a manual checklist item anyway.

Mis-wiring detection stays on the free tier on purpose. The acquisition story is
someone running one comparison, discovering their client board has been writing
to the wrong place for three weeks, and buying on the spot. Hiding that finding
behind the paywall would remove the only reason anyone upgrades.

## Before you ship

**This has never run against a live monday account.** The findings report was
assembled from indexed documentation because `developer.monday.com` was
unreachable from the build environment. Claims marked `✱` in the source are
unverified, and these must be checked first:

1. **The shape of `configuration`** from `board_automations`. If it is a
   structured recipe graph, automation diffing is real; if it is an opaque
   display string, it degrades to presence/absence counting. (Which still
   catches 44→39.) — `src/api/preview/automations.ts`
2. **The typed `settings` object on columns**, and specifically which key holds
   linked board IDs. `linkedBoardIds()` reads four plausible spellings, because
   guessing wrong there does not throw — it reports every board as correctly
   wired, the single worst failure this app could have. — `src/diff/connect.ts`
3. **The `defaults` argument on `create_column`** — needed to recreate a status
   column with the template's labels. Not load-bearing in v1, since one-click
   repair does not ship, but it blocks turning the flag on.
   — `src/repair/execute.ts`
4. **Deep-link URL shapes.** Not part of any documented API. They degrade to the
   board URL when unsure. — `src/repair/deeplinks.ts`
5. **The OAuth endpoints and the session-token JWT claim shape.**
   — `src/server/oauth.ts`

Every one of these is isolated behind a named function with a `✱` comment, and
there is a script that checks all of them:

```bash
MONDAY_API_TOKEN=... npm run verify:live -- \
  --board <a board you own> --connect-board <linked board> --automations
```

Read-only — no mutations, no item reads. It prints VERIFIED / FAILED / SKIPPED
with the **observed shape** next to each claim, so a failure says what to
change, and exits non-zero so it can gate a release. A SKIPPED check is not a
pass, and the output says so. (ADR-017.)

Storage, billing, delivery, security hardening and deployment are done: `SqliteStorage` implements the same
`Storage` interface `InMemoryStorage` does, and `test/storage.test.ts` runs one
suite against both so that stays true. `DriftScheduler` sweeps paying accounts
on a timer and reports its own state on `/health` — including ticks it had to
skip, because a monitor that has quietly stopped is this product's own
signature failure.

Deployment, the developer-console setup and the full submission checklist are
in `docs/06-deployment-and-submission.md`.

## Submission notes

Things a marketplace reviewer will ask, answered up front:

- **Data handling.** Board and column configuration only; never item data.
  Enforced in code at the storage boundary, not just documented.
- **Scopes.** Four, each with a one-line justification in the manifest. No item
  scopes requested.
- **Writes.** None. v1 does not request `boards:write`, so there is no write it
  could perform. `repair/execute.ts` contains three mutations
  (`create_column`, `create_group`, `change_column_title`) behind
  `FEATURE_ONE_CLICK_REPAIR`, which is off; the requested scopes are derived
  from that flag, so the consent screen cannot ask for a permission this build
  is not configured to use. (ADR-025.)
- **Preview API.** One flag, default off, read-only, isolated to one file, and
  no paid feature depends on it.
- **Rate limits.** Batched board reads, explicit user pagination, exponential
  backoff with jitter, sequential repairs, and a drift sweep that stops the
  moment monday pushes back rather than retrying into a throttle.

## Layout

```
src/
  api/          GraphQL client, pinned version, error taxonomy, queries
    preview/    THE PREVIEW BOUNDARY — the only file touching the dev schema
  snapshot/     BoardSnapshot type and capture
  diff/         match.ts (the hard part) · connect.ts (mis-wiring) · diff.ts
  repair/       plan.ts (auto vs manual) · execute.ts · deeplinks.ts
  drift/        monitor.ts (one account) · scheduler.ts (the timer) · sinks.ts
  billing/      plan gating · subscription webhook
  server/       OAuth, storage (in-memory · SQLite · monday code), config, security, HTTP API
  ui/           board view, dashboard widget, Vibe components
test/           234 tests over fixture board configs
scripts/        verify-live.ts — checks the ✱ claims against a real account
docs/           findings report, roadmap, decision log, deployment, prompts
```

`CLAUDE.md` holds the working agreement — read it before changing anything.
`STATUS.md` holds the honest completion numbers.
