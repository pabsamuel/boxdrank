# Roadmap

Each phase has a matching prompt in `prompts/`. Do them in order — every phase
after the first depends on what the first one learns.

## Phase 0 — Done

Audit engine, seven rules, permission derivation, console + HTML reports, CLI,
34 tests, demo fixture. Runs with no monday account and no dependencies.

## Phase 1 — Verify the API · `prompts/01-verify-api.md`

Work through `docs/API-VERIFICATION.md` against a real monday account. Update
the queries and the `POLICY` flags with what you observe.

**Blocking.** Nothing below is safe until this is done — in particular, if
`last_activity` doesn't exist, the headline finding changes and so does the
pitch.

*Done when:* every checklist box is ticked, `POLICY` comments carry observed
behaviour and a date, and a sanitised fixture from a real account is committed.

## Phase 2 — Validate demand · `prompts/02-validate-demand.md`

Ten monday admins who say they would pay, with emails collected. Run this in
parallel with Phase 1 — it costs no code and can kill the project cheaply.

*Done when:* ten yeses, or a decision to stop.

## Phase 3 — Wire the API · `prompts/03-wire-api.md`

Finish `monday-client.js` against the verified schema: OAuth, pagination,
complexity-aware rate limiting, snapshot caching. The rules do not change.

*Done when:* `node src/cli.js --account <token>` produces the same report shape
as the fixture path, against a live account.

## Phase 4 — The monday app · `prompts/04-monday-app.md`

React board/dashboard view using monday's Vibe components, rendering the report
inside monday. Free-tier gating.

*Done when:* installable in a dev account and the audit runs from inside monday.

## Phase 5 — Billing and launch · `prompts/05-billing-and-launch.md`

monday marketplace billing, tier enforcement, listing copy, submission.

*Done when:* live in the marketplace.

## Phase 6 — Then, and only then

Scheduled scans and drift alerts. After that, the other two products in the
family — Template Guard (board duplication silently drops automations) and the
Automation Quota Analyzer — which reuse this codebase's OAuth, enumeration,
snapshot and scheduling layers.

Ship one first. Three half-built apps is the same mistake as three half-built
websites.
