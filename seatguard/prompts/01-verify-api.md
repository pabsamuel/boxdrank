# Prompt — Phase 1: verify the monday API

Paste into a fresh Claude Code session in this repo.

---

Read `CLAUDE.md` and `docs/API-VERIFICATION.md` first.

Your job is Phase 1: replace every guess about the monday.com API with something
observed. Do not write features. Do not touch `src/rules.js`.

I have a monday account and an API token; ask me to run anything you cannot run
yourself, and tell me exactly what to paste where.

Work through `docs/API-VERIFICATION.md` section by section:

1. Confirm the current stable API version.
2. Run each of the three query documents in `src/monday-client.js` and record
   the real response shape. Fix field names, pagination arguments and enum
   values to match.
3. Establish the five `POLICY` flags in `src/permissions.js` **empirically** —
   two accounts, actual clicking, not documentation. Update each flag and put
   the observed behaviour plus today's date in the comment beside it.
4. Measure the limits: complexity budget, what a 429 returns, how long a full
   read takes.
5. Determine the minimum OAuth scopes. Minimum, not convenient.

Special attention to `last_activity` on users. If that field does not exist, the
dormant-seat rule has no input and the product's headline changes — say so
loudly and work through Plans A/B/C at the bottom of the verification doc before
going further.

When done:
- Update the queries, `API_VERSION` and `POLICY`.
- Remove the "unverified" warnings from `CLAUDE.md`, `README.md` and the header
  of `src/monday-client.js` — but only for what you actually confirmed. Leave
  warnings on anything still unknown.
- Commit `fixtures/real-account.sanitised.json` built from my account with names
  and emails replaced.
- Run `npm test`. If a `POLICY` change altered a rule's behaviour, the tests
  should have caught it; if they didn't, add the test that would have.

Report back with: what you confirmed, what you corrected, what is still unknown,
and whether the dormant-seat rule survives.
