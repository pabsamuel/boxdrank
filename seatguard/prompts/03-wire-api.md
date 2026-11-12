# Prompt — Phase 3: wire the API

Paste into a fresh Claude Code session in this repo.

---

Read `CLAUDE.md`. **Phase 1 must be complete** — if `docs/API-VERIFICATION.md`
still has unticked boxes, stop and tell me, because building on unverified
queries is how this ends up shipping wrong numbers.

Finish `src/monday-client.js` so SeatGuard can audit a live account.

Requirements:

- **OAuth**, not a pasted token, using the minimum scopes established in Phase 1.
  A personal-token path may stay for local development only.
- **Pagination** over users, workspaces and boards, using whatever the verified
  schema actually does.
- **Complexity-aware rate limiting.** monday limits on query complexity, not just
  request count, and hitting the ceiling blocks the whole account. Back off on
  429 using `Retry-After`, and report progress rather than appearing to hang.
- **Snapshot caching** to disk, with the fetch timestamp, so re-running an audit
  doesn't re-read the whole account.
- Extend the CLI: `node src/cli.js --account` reads live, `node src/cli.js
  <file>` keeps working exactly as now.

Hard constraints:

- **Do not modify `src/rules.js` or `src/audit.js`.** The rules consume a plain
  snapshot and must stay that way. If live data doesn't fit the snapshot shape,
  fix the mapping in `toSnapshot`, not the rules.
- Zero runtime dependencies. Node's built-in `fetch` is enough.
- Tests must not hit the network. Inject a fake `fetchImpl` — `MondayClient`
  already takes one — and cover: pagination across multiple pages, a 429 retry,
  a GraphQL error response, and `toSnapshot` mapping a realistic payload.
- Never log or persist the token. Never store item data; structure only.

Done when: a live account produces a report identical in shape to the fixture
run, `npm test` is green, and the new tests genuinely exercise the failure paths.
