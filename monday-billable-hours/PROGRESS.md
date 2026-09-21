# Progress — monday Automation Watchdog

Updated 21 Sep 2026 (third pass). Percentages are counted from the checklist below, not
estimated. An item is done or it is not; half-done items are listed as not done
with a note.

**Two numbers, because one would be misleading:**

| | Done | Note |
|---|---|---|
| **Code that can be written from here** | **14 / 14 — 100%** | Verified against a live account |
| **Distance to a product someone pays for** | **19 / 34 — 56%** | The remaining 44% is not code at all |

**The second number went down while work was being done.** That is not an error.
Muting, the run log and the staleness strip added three items to section 1 and
zero to sections 2–6. Building more does not move you closer to shipping when
what stands between you and shipping is documentation, an account and five
conversations. It is worth noticing the first time it happens rather than the
fifth.

The gap between those two numbers is the honest state of this project. The
engine is nearly finished. The product is not, and the rest is blocked on things
no amount of building fixes.

---

## 1. Code writable in this environment — 13/13

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
- [x] Muting, designed so it expires and cannot become a blind spot
- [x] Run log and staleness detection — the watchdog reporting on itself
- [x] Three security reviews, seven findings, all fixed with regression tests
- [x] Runnable on any host, so scheduling is no longer a blocker: an HTTP
      client with a guarded endpoint, file-backed state, and a CLI that takes
      the token from the environment only
- [x] **Verified against a real monday account** (21 Sep 2026). Two live
      responses are committed as fixtures and checked in CI. The first found a
      real bug: `created_at` is 100-nanosecond ticks, which the parser was
      silently returning null for.

**168 tests.** All offline, and two of them run against real captured responses.

The third review is the one worth remembering. It reported the token-handling
path as clean, having tested it against a stub that behaves. Running the same
CLI against a stub that quotes the `Authorization` header back put the token in
stderr and in a file on disk. **A security review that only tests cooperative
inputs proves nothing about the inputs that matter.**

## 2. Blocked on `developer.monday.com` being unreachable — 0/4

None of this was written from memory, deliberately. Writing it from memory
produces something that looks finished and does not run.

- [ ] App manifest and board-view feature configuration
- [ ] OAuth scopes — the exact names, requesting the minimum
- [ ] monday code storage API wired into `runCheck`'s `storage` interface
- [ ] monday code scheduling wired to call `runCheck`

**Unblocked by:** pasting those doc pages in, or an environment that can reach
them. Estimated at one focused session once readable.

## 3. Needs a real monday account — 4/5

- [ ] Run the board view inside monday and confirm it loads
- [x] Confirm `activity_logs` returns what the adapter expects
- [x] **Confirm the `created_at` format** — it is 100-nanosecond ticks, and the
      parser was wrong until a live response proved it
- [x] Confirm whether the API distinguishes automation-performed actions —
      **yes, automations act under a negative `user_id`**
- [x] Confirm automation actions reach the board activity log at all — **yes**,
      which was the more dangerous of the two questions

## 4. Still a secret to solve — 1/3

The board view holds no credential; seamless auth handles it. A scheduled job
runs with no user present and needs a stored token. **This is the first secret
any product in this repository has held**, and the main subject of its security
review.

- [ ] OAuth install flow for the scheduled job
- [ ] Token storage that survives monday's security review
- [x] The token cannot leave the process: the endpoint is validated before the
      token is attached, and every response is scrubbed of it before parsing

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

## What the 56% is not

It is not "56% of the work is done and 44% is more of the same". Section 1 is
nearly finished and is the part I can do. Sections 2 and 3 need a few pages of
documentation and one account. Section 6 needs conversations with strangers, and
no amount of code moves it.

The two dead products in this repository both had a finished section 1.
