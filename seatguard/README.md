# SeatGuard

Audits a monday.com account for wasted seats and permission problems.

```bash
node src/cli.js fixtures/demo-account.json
node src/cli.js fixtures/demo-account.json --html report.html
npm test
```

Node ≥20. No dependencies, no build step, no install.

## What it finds

Run against the bundled demo account (14 users, 13 boards, 3 workspaces):

```
RECLAIMABLE: $64/month ($768/year)

[HIGH]   4 billable seats with no recent activity
[HIGH]   2 boards with no active owner
[HIGH]   1 guest with access to more than 5 boards
[MEDIUM] 2 boards with more than 2 owners
[MEDIUM] 4 account admins
[LOW]    1 invitation never accepted
[LOW]    2 boards untouched for 180+ days
```

| Rule | Why it matters |
| --- | --- |
| Dormant seats | Seats bill whether or not anyone logs in. This is the finding that pays for the app. |
| Orphaned boards | Every owner deactivated — nobody can administer them. |
| Guest exposure | External users accumulate board access; nothing removes it when the project ends. |
| Owner sprawl | Board owners bypass board permissions, so every extra owner is another person who can change anything. |
| Admin sprawl | The widest blast radius in the account. |
| Stale invitations | Never accepted, still cluttering the user list. |
| Stale boards | Archive candidates. |

Thresholds are configurable — see `DEFAULTS` in `src/rules.js`.

## Current status

**Working and tested (34 tests):** permission derivation, all seven rules,
console and HTML reports, the CLI.

**Not yet verified:** the monday API client in `src/monday-client.js`. No query
in it has been run against a live account, so SeatGuard currently reads a
snapshot file rather than an account.

That split is deliberate. The analysis engine consumes a plain JSON snapshot and
never touches the API, so it could be finished and proven before any credentials
existed. Wiring it to monday is a mapping job, not a rewrite.

**Next step:** work through `docs/API-VERIFICATION.md`. It resolves the open API
questions and decides the shape of everything after it.

## Snapshot format

```jsonc
{
  "account":    { "name": "…", "seatPriceUsd": 16 },
  "users":      [{ "id", "name", "email", "enabled", "isGuest", "isAdmin",
                   "isViewOnly", "isPending", "createdAt", "lastActivity" }],
  "workspaces": [{ "id", "name", "kind": "open|closed", "memberIds": [] }],
  "boards":     [{ "id", "name", "workspaceId", "state", "boardKind",
                   "itemCount", "updatedAt", "owners": [], "subscribers": [] }]
}
```

`fixtures/demo-account.json` is a complete worked example. Bad snapshots are
rejected with a specific reason rather than producing quietly wrong numbers.

## Privacy

SeatGuard reads account structure only — users, boards, permissions. It never
reads item data. This is worth stating in the marketplace listing: it shortens
security review, and it is true.

## Docs

- `CLAUDE.md` — architecture and the rules of the codebase
- `docs/API-VERIFICATION.md` — the blocking checklist
- `docs/PRODUCT.md` — market case, pricing, validation
- `docs/ROADMAP.md` — phases
- `prompts/` — ready-to-run prompts for each phase
