# Board Schema Auditor

A read-only monday.com board view that finds where boards built from the same
template have drifted apart — the mismatched column types and renamed fields
that make a dashboard show wrong numbers **without showing an error**.

Status: **working code, unvalidated product.** See "What this is not" below.

## The problem

monday does not enforce consistent column names or types across boards. From
monday's own dashboard documentation:

> monday.com doesn't enforce unified column types or naming conventions, so
> dashboards struggle to merge mismatched data across teams.

So an agency with 12 client boards from one template ends up with `Budget` as a
number on nine of them and as text on three. A dashboard summing Budget returns
a wrong total, silently. monday's own answer — Managed Templates with Data
Validation — is **Enterprise-only**, leaving Standard and Pro accounts with
nothing.

## What it reports

Pick a reference board; every other board is compared against it.

| Finding | Severity | Why |
|---|---|---|
| Type mismatch | Breaks reports | Same column, different type. The silent killer — wrong totals, no error. |
| Missing column | Breaks reports | A column the reference has is absent. |
| Likely renamed | Worth a look | Same type, near the same position, different title. Inferred, not certain. |
| Title formatting | Worth a look | "Due date" vs "Due Date". Splits a dashboard group in two. |
| Extra column | Informational | Usually deliberate local customisation. |
| Different order | Informational | Cosmetic. One finding per board, never one per column. |

Findings sort worst-first, boards rank worst-first, and the whole report exports
to CSV. The CSV is built in the browser and never uploaded anywhere.

## Try it without a monday account

```bash
npm install
npm run demo          # then open http://localhost:8137/
```

A local server is required, not optional: browsers block ES module imports and
`fetch()` on `file://`, so opening `index.html` from disk shows an empty page.
`scripts/serve.js` is ~40 lines of `node:http` so this needs no extra package.

Opened outside monday, the app loads `fixtures/demo-boards.json` — an agency
with eight client boards that have drifted in every way the engine detects. That
fixture is covered by tests, so it cannot quietly stop demonstrating a finding
kind.

### Verified working

Driven in headless Chromium on 17 Sep 2026: demo data loads, the audit runs
(8 boards compared, 1 clean, 4 report-breaking, 9 worth a look, 3 informational),
worst-first ranking puts Hooli top and the clean board last, CSV downloads with
17 rows and correct quoting, no console errors, no horizontal overflow at 375 px,
dark mode renders.

## Run the tests

```bash
npm test
```

46 tests, no network, no account, no monday dependency. The diff engine is pure
functions over plain objects, which is why it can be tested at all.

## Architecture

```
src/core/     zero-dependency, platform-agnostic, 100% of the product logic
  normalize.js  title folding (case, punctuation, accents, Turkish dotted I)
  diff.js       three-pass column matching and finding generation
  report.js     summary counts, board ranking, CSV
src/app/
  monday-source.js  the ONLY file that talks to monday
  main.js           plain-DOM UI, no framework
  index.html        single page, inline CSS, light and dark
fixtures/     demo data
test/         node:test, no test framework dependency
```

The split is deliberate. `src/core` has no idea monday exists, so the expensive
part to get right is also the cheap part to test. `src/app/monday-source.js` is
the only file that changes if the platform does.

**Runtime dependencies: one** (`monday-sdk-js`). Bundle is ~19 kB minified.
Fewer dependencies and fewer domains is the whole strategy for getting through
monday's security review — see `../monday-billable-hours/NEXT-GATE0.md`.

## Read-only by construction

- The app issues one GraphQL **query** and no mutations. There is no code path
  that writes to a board.
- It stores nothing — no database, no `localStorage`, no cookies.
- It has no backend, so there is no server to hold a secret and nothing for the
  required Burp scan to find beyond the static host.
- Authentication is monday's **seamless auth**: the SDK acts on behalf of the
  signed-in user and the app never sees or stores an API token.

## MIGRATION — read before touching the SDK dependency

`monday-sdk-js` is pinned to **0.5.9 on purpose**.

Verified against the installed packages on 17 Sep 2026:

- `0.5.9` has `api(query, options)`, which queries GraphQL *"seamlessly on
  behalf of the connected user"* when no token is passed. This is what makes a
  backend-free app possible. It logs a deprecation warning saying it will be
  removed in 1.0.0.
- `1.0.0-beta` — currently the `latest` tag — **has already removed `api()`**.
  Its client exposes only `get`, `set`, `listen`, `execute`, `storage`, `oauth`.
- The suggested replacement, `@mondaydotcomorg/api`, **requires an API token**,
  which a seamless client-side app does not have.

So `npm update monday-sdk-js` will break this app, and the documented upgrade
path currently reintroduces the backend this design exists to avoid. That is an
open risk, not a solved problem. All of it is confined to
`src/app/monday-source.js`, so the eventual fix is one file.

## Before submitting to the marketplace

Not done here, and not guessable — `developer.monday.com` was unreachable from
the environment this was built in, so **no manifest or app-configuration code
was written from memory**. In monday's developer centre you still need to:

- [ ] Create the app and add a **Board View** (or Dashboard Widget) feature.
- [ ] Point it at the hosted build, or deploy via monday code.
- [ ] Request **read-only** scopes — `boards:read` at minimum. Request nothing
      more; every extra scope is a question at review.
- [ ] Confirm the exact scope names and feature type against the live docs.
- [ ] Set the API version the app targets, and re-check that `boards(limit:,
      page:)` and `columns { id title type }` are current for it.
- [ ] Confirm TLS 1.2+ and HSTS with min-age ≥ 1 year on whatever host serves it.
- [ ] Run the Burp scan monday provides and fix everything it reports.

`settings_str` is deliberately never queried — it is deprecated as of API
version 2025-10, and the auditor does not need it.

## Known limitations

- **A fully translated board reads as five renames.** Deliberate localisation
  looks identical to drift from the outside. Correct behaviour, unhelpful output.
  Marking a board as a translation and mapping its columns would fix it; not
  built.
- **Rename detection is a heuristic** — same type, within 3 positions. Tuned to
  miss rather than to guess wrong: a missed rename degrades into a missing plus
  an extra, which is noisy but true.
- **Column settings are not compared.** Two Status columns with different labels
  both read as `status`. This is the most likely next feature and it is
  deliberately not in v1.
- **One reference board at a time.** No auto-grouping of boards by template.
- **No continuous monitoring.** This is a point-in-time audit you run, not a
  watcher that alerts you. That is a real commercial weakness, not an oversight —
  see below.

## What this is not

**This is not a validated product.** The code works; the business case does not
exist yet.

Nobody has said they would pay for it. The demand evidence is monday's own
documentation and consultant blog posts — not vote counts, not a customer
conversation. The strongest objection is in `../monday-billable-hours/IDEAS.md`
and stands unanswered: **an audit tool is something you run once, fix, and stop
paying for.** Continuous drift alerting would fix the retention problem and
would require the backend that this architecture exists to avoid.

Two things gate a submission, both outside this repository:

1. `NEXT-GATE0.md` Q1 and Q2 — can the owner remediate a Burp finding, and is
   there an honest answer to monday's AI-generated-code policy.
2. Ten conversations with monday admins asking not *"is this useful?"* (everyone
   says yes) but **"what do you currently do about column drift, and what would
   you pay to stop doing it?"**

If the honest answer is "nothing, we live with it," this repository is a
20-hour lesson and that is a fine outcome.
