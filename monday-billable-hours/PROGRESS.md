# Progress — monday Automation Watchdog

Updated 23 Sep 2026 (fifth pass, after the network policy was opened). Percentages are counted from the checklist below, not
estimated. An item is done or it is not; half-done items are listed as not done
with a note.

**Two numbers, because one would be misleading:**

| | Done | Note |
|---|---|---|
| **Code that can be written from here** | **16 / 16 — 100%** | Verified against a live account |
| **Distance to a product someone pays for** | **23 / 35 — 66%** | The remaining 34% is mostly not code |

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
- [x] **Sends the alert for real**, over SMTP, so the product finally does its
      one job. Any provider that speaks SMTP, chosen by connection string
      rather than by code — the only mail option that did not need a vendor's
      API reference this environment cannot reach
- [x] **Verified against a real monday account** (21 Sep 2026). Two live
      responses are committed as fixtures and checked in CI. The first found a
      real bug: `created_at` is 100-nanosecond ticks, which the parser was
      silently returning null for.

**192 tests.** All offline, and two of them run against real captured responses.

The third review is the one worth remembering. It reported the token-handling
path as clean, having tested it against a stub that behaves. Running the same
CLI against a stub that quotes the `Authorization` header back put the token in
stderr and in a file on disk. **A security review that only tests cooperative
inputs proves nothing about the inputs that matter.**

## 2. Was blocked on `developer.monday.com` — 3/4

Unblocked on 23 Sep when the environment's network policy was changed. Every
answer was read from a live page and written up in `PLATFORM-FACTS.md` with the
page named. None of it was written from memory, deliberately — the one time this
project guessed at a monday format, the result looked finished and returned
`null` for every real row.

- [x] ~~App manifest~~ — **there is no manifest.** The page 404s and nothing in
      the navigation mentions one; apps are configured in the Developer Center
      UI. Two days of blocked work whose premise was wrong, which is the sort of
      thing only reading finds.
- [x] OAuth scopes — `boards:read` and `users:read`, and nothing else. Authorize
      and token URLs, the 10-minute code, and the token living until uninstall
      are all recorded.
- [x] monday code storage wired into `runCheck`'s `storage` interface —
      `src/server/monday-storage.js`, which is the entire cost of moving off
      disk because storage was injected from the start
- [ ] monday code scheduling wired to call `runCheck` — the platform side is
      answered (**cron jobs exist**: a POST route under `/mndy-cronjob/`, five
      per region, created with `mapps scheduler:create`). What is left is the
      app shell that hosts the route, which needs the app to exist first.

## 3. Needs a real monday account — 4/5

- [ ] Run the board view inside monday and confirm it loads
- [x] Confirm `activity_logs` returns what the adapter expects
- [x] **Confirm the `created_at` format** — it is 100-nanosecond ticks, and the
      parser was wrong until a live response proved it
- [x] Confirm whether the API distinguishes automation-performed actions —
      **yes, automations act under a negative `user_id`**
- [x] Confirm automation actions reach the board activity log at all — **yes**,
      which was the more dangerous of the two questions

## 4. Still a secret to solve — 2/3

The runner now holds **two** credentials, not one: the monday token and the SMTP
password. Both are redacted from anything the process throws, by shared code
rather than two copies of it, because the same mistake was available twice.

Where they belong is no longer an open question. `SecureStorage` from
`@mondaycom/apps-sdk` takes no token and is scoped to the app — that is where an
account's access token goes. `SecretsManager` reads values set in the Developer
Center UI, so `SMTP_URL` never enters the repository or a workflow file.

The board view holds no credential; seamless auth handles it. A scheduled job
runs with no user present and needs a stored token. **This is the first secret
any product in this repository has held**, and the main subject of its security
review.

- [ ] OAuth install flow for the scheduled job
- [x] Token storage that survives monday's security review — `SecureStorage`
      and `SecretsManager`, both named APIs now rather than an open problem
- [x] The token cannot leave the process: the endpoint is validated before the
      token is attached, and every response is scrubbed of it before parsing

## 5. Marketplace — 0/4

- [ ] Burp scan passed, findings fixed
- [ ] Listing copy, assets, privacy statement
- [ ] Submitted
- [ ] Approved

## 6. Validation and sales — 1/5

- [x] Confirmed no competing automation-monitoring app surfaced in search
- [ ] Marketplace search for `automation`, `monitor`, `alert`, `watchdog`
- [ ] Ten admins asked what they do today when an automation dies silently
- [ ] One person says they would pay a specific number
- [ ] One person actually pays

Recorded so far (details in `VALIDATION.md`): Samet reports people have said
they would pay, with who and how much still UNKNOWN; and one live lead running
200+ workflows who built their own failure checker.
