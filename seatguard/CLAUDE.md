# SeatGuard — working notes for Claude

A monday.com marketplace app that audits an account's seats and permissions.
Read this before touching anything; it is short on purpose.

## What this is

monday permissions stack across three layers — account role, workspace
membership, board subscription — and a user's real access is the combination.
Auditing that by hand across hundreds of boards is impractical. SeatGuard reads
an account and reports what is wrong, leading with the finding that pays for the
product: **billable seats nobody is using.**

The commercial pitch is one sentence: *find eight dormant seats and the app has
already paid for itself.*

## Architecture, and the one rule that matters

```
monday API  →  snapshot (plain JSON)  →  rules  →  report
             ^^^^^^^^^^^^^^^^^^^^^^
             the boundary. Do not cross it.
```

**The rules never touch the API.** They take a plain snapshot object and return
findings. That is why the entire analysis engine is finished and tested while
the API client is still unverified — and it is why you can work on rules without
a monday account.

If you find yourself importing `monday-client.js` into `rules.js`, stop. Fetch
the data, normalise it to a snapshot, pass the snapshot.

| File | Job |
| --- | --- |
| `src/permissions.js` | Derives effective access. All assumptions live in `POLICY`. |
| `src/rules.js` | One pure function per finding. Add rules here. |
| `src/audit.js` | Validates the snapshot, runs the rules, totals the money. |
| `src/report.js` | The only file that formats anything. |
| `src/monday-client.js` | API scaffold. **Unverified — see below.** |
| `src/cli.js` | `node src/cli.js <snapshot.json>` |
| `fixtures/demo-account.json` | A realistic 14-user agency account with planted problems. |

## Status: what is real and what is not

**Real, tested, trustworthy:**
- Permission derivation and the access matrix
- All seven rules, with a fixed-clock test suite (34 tests)
- Console and HTML reports
- The CLI

**Not verified, do not trust:**
- Everything in `src/monday-client.js`. No query in it has been run against a
  live account. Field names, pagination arguments, and the existence of
  `last_activity` are all guesses from published docs.
- The `POLICY` flags in `src/permissions.js`. They model monday's permission
  semantics from documentation, not observation.

`docs/API-VERIFICATION.md` is the checklist that turns the second list into the
first. **It is the first task.** Everything downstream depends on it, and
shipping a paid audit built on guessed semantics would be worse than shipping
nothing.

## Conventions

- **Node ≥20, ESM, zero runtime dependencies.** Tests use `node:test`. Keep it
  that way — no dependency has yet been worth adding, and a marketplace security
  review is easier with an empty dependency tree.
- `npm test` runs everything. Every rule needs a test; every test pins a clock
  (`NOW`), because dormancy figures are meaningless without one.
- Comments explain *why*, not *what*. The existing ones are the standard.
- Money is computed in one place (`audit.js`) and formatted in one place
  (`report.js`).

## Things that will bite you

- **Dates.** A user with `lastActivity: null` has never logged in and is dormant
  at *any* threshold. A test that assumes relaxing the threshold empties the
  finding is a wrong test — that exact mistake has already been made once.
- **Archived boards.** They grant nobody access and must never appear in
  orphaned/stale findings. There are tests for this.
- **Board owners bypass board permissions.** That is why owner sprawl is a
  security finding and not a tidiness one.
- **Guests are not billable seats.** Counting them inflates the savings number,
  which is the number the whole sale rests on. Get it wrong and the customer
  catches it.
- **Rate limits.** monday limits on query *complexity*, not just request count.
  Boards with 500+ items are already slow in monday's own UI; never make that
  worse.

## Privacy, which is also a sales argument

SeatGuard reads structure — users, boards, permissions — and **never item data**.
Say so plainly in the listing. It shortens security review and it is true; keep
it true.

## Where to look next

- `docs/API-VERIFICATION.md` — the blocking checklist
- `docs/PRODUCT.md` — why this product, who buys it, what it costs
- `docs/ROADMAP.md` — phases
- `prompts/` — ready-to-run task prompts, in order
