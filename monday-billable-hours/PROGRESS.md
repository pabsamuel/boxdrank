# Progress — monday Automation Watchdog

Updated 20 Sep 2026. Percentages are counted from the checklist below, not
estimated. An item is done or it is not; half-done items are listed as not done
with a note.

**Two numbers, because one would be misleading:**

| | Done | Note |
|---|---|---|
| **Code that can be written from here** | **9 / 10 — 90%** | Everything except a real-API smoke test |
| **Distance to a product someone pays for** | **10 / 25 — 40%** | The remaining 60% is mostly not code |

The gap between those two numbers is the honest state of this project. The
engine is nearly finished. The product is not, and the rest is blocked on things
no amount of building fixes.

---

## 1. Code writable in this environment — 9/10

- [x] Cadence engine — late / silent / dormant / healthy, with false-alarm restraint
- [x] Working-day awareness, so weekends do not produce alerts
- [x] Signal extraction from activity logs
- [x] Human-readable event labels
- [x] Alert state machine — say it once, remind rarely, announce recovery
- [x] Email rendering, text and HTML, with escaping
- [x] Scheduled-check orchestration (`runCheck`), storage and mail injected
- [x] monday API adapter with magnitude-normalised timestamp parsing
- [x] Board view UI, verified in a real browser
- [x] Demo account, generated and drift-checked in CI
- [ ] **A single query run against a real monday account.** Everything above is
      tested against fakes. Nothing has touched the real API even once.

**71 tests, all offline.**

## 2. Blocked on `developer.monday.com` being unreachable — 0/4

None of this was written from memory, deliberately. Writing it from memory
produces something that looks finished and does not run.

- [ ] App manifest and board-view feature configuration
- [ ] OAuth scopes — the exact names, requesting the minimum
- [ ] monday code storage API wired into `runCheck`'s `storage` interface
- [ ] monday code scheduling wired to call `runCheck`

**Unblocked by:** pasting those doc pages in, or an environment that can reach
them. Estimated at one focused session once readable.

## 3. Needs a real monday account — 0/5

- [ ] Run the board view inside monday and confirm it loads
- [ ] Confirm `activity_logs` returns what the adapter expects
- [ ] **Confirm the `created_at` format** — the parser handles five possibilities
      because the real one is unverified
- [ ] Confirm whether the API distinguishes automation-performed actions
- [ ] Confirm `board_automations` exists and what it exposes

## 4. Still a secret to solve — 0/2

The board view holds no credential; seamless auth handles it. A scheduled job
runs with no user present and needs a stored token. **This is the first secret
any product in this repository has held**, and the main subject of its security
review.

- [ ] OAuth install flow for the scheduled job
- [ ] Token storage that survives monday's security review

## 5. Marketplace — 0/4

- [ ] Burp scan passed, findings fixed
- [ ] Listing copy, assets, privacy statement
- [ ] Submitted
- [ ] Approved

## 6. The part that decides whether any of it mattered — 1/5

- [x] Confirmed no competing automation-monitoring app surfaced in search
- [ ] Marketplace search for `automation`, `monitor`, `alert`, `watchdog`
- [ ] Ten admins asked what they do today when an automation dies silently
- [ ] One person says they would pay a specific number
- [ ] One person actually pays

**Nobody has said they would pay for this.** The evidence is monday's own
documentation and two community threads. That is more than the previous two
products had at this stage, and it is still not a person.

---

## What the 40% is not

It is not "40% of the work is done and 60% is more of the same". Section 1 is
nearly finished and is the part I can do. Sections 2 and 3 need a few pages of
documentation and one account. Section 6 needs conversations with strangers, and
no amount of code moves it.

The two dead products in this repository both had a finished section 1.
