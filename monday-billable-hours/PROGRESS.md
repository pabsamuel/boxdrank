# Progress — monday Automation Watchdog

Updated 26 Sep 2026 (sixth pass: the app server is written). Percentages are counted from the checklist below, not
estimated. An item is done or it is not; half-done items are listed as not done
with a note.

**Two numbers, because one would be misleading:**

| | Done | Note |
|---|---|---|
| **Code that can be written from here** | **18 / 18 — 100%** | Verified against a live account |
| **Distance to a product someone pays for** | **36 / 44 — 82%** | What is left is setup in monday, a real install, assets, and sales |

---

## 1. Code writable in this environment — 18/18

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
- [x] **The app server** (`src/server/app-server.js`): OAuth install with a
      single-use state, the scheduled check as a monday code cron route,
      uninstall webhooks verified against the client secret that delete the
      token and address, a status endpoint so the board view can show when the
      last check ran, and a setup mode so the first deploy can boot before its
      Live URL exists. Every monday detail read from live docs on 26 Sep.
- [x] **Deploy-ready**: `.mondaycoderc` pinned to Node 22 and validated against
      the monday CLI's own schema, `.mappsignore` so the upload is
      deterministic, and `npm run check:deploy` in CI booting the server in the
      exact state of a first deploy. An adversarial pass found three server
      bugs — a registry race that would silently drop an account, a session
      token with no expiry accepted forever, a token that could reach a log —
      all fixed with tests proven to fail before the fix.
- [x] **Verified against a real monday account** (21 Sep 2026). Two live
      responses are committed as fixtures and checked in CI. The first found a
      real bug: `created_at` is 100-nanosecond ticks, which the parser was
      silently returning null for.

**239 tests.** All offline, and two of them run against real captured responses.

The third review is the one worth remembering. It reported the token-handling
path as clean, having tested it against a stub that behaves. Running the same
CLI against a stub that quotes the `Authorization` header back put the token in
stderr and in a file on disk. **A security review that only tests cooperative
inputs proves nothing about the inputs that matter.**

## 2. Was blocked on `developer.monday.com` — 4/4

Unblocked on 23 Sep when the environment's network policy was changed. Every
answer was read from a live page and written up in `PLATFORM-FACTS.md` with the
page named. None of it was written from memory, deliberately — the one time this
project guessed at a monday format, the result looked finished and returned
`null` for every real row.

- [x] App configuration — done in the Developer Center UI. *Corrected 26 Sep:*
      a manifest format **does** exist (`app-manifest.yml`, in monday's own
      sample app); the docs page for it 404s, which was wrongly read as "there
      is no manifest". The board-view feature type name was not found, so no
      manifest is written — the UI is documented, the type name would be a guess.
- [x] OAuth scopes — **four, all read-only**: `boards:read`, `users:read`,
      `me:read`, `account:read`. It said two until the `me` and `account`
      reference pages were read: the token response has no account id, so the
      app must ask who installed it, and those two queries need those scopes.
- [x] monday code storage wired into `runCheck`'s `storage` interface —
      `src/server/monday-storage.js`, which is the entire cost of moving off
      disk because storage was injected from the start
- [x] monday code scheduling wired to call `runCheck` — `POST
      /mndy-cronjob/check` runs every installed account in turn, isolates
      failures, and ignores a second call inside 20 minutes, because the docs
      do not say the route is private. Creating the job itself is one CLI
      command, in section 3.

## 3. Needs a real monday account — 7/8

- [x] App created in the Developer Center (26 Sep, App ID 12249756): the four
      read-only scopes saved, monday code enabled, legacy OAuth flow kept
- [x] **Deployed to monday code** (26 Sep): v1 live, security scan 0 findings,
      and the running server checked from outside — setup mode, board view
      served
- [x] Run the board view inside monday and confirm it loads (26 Sep, on Samet's
      test board)
- [ ] Complete one real install through the OAuth flow, create the cron job,
      and receive one real alert email — install done and cron job created
      (26 Sep); the email waits on a working mail credential
- [x] Confirm `activity_logs` returns what the adapter expects
- [x] **Confirm the `created_at` format** — it is 100-nanosecond ticks, and the
      parser was wrong until a live response proved it
- [x] Confirm whether the API distinguishes automation-performed actions —
      **yes, automations act under a negative `user_id`**
- [x] Confirm automation actions reach the board activity log at all — **yes**,
      which was the more dangerous of the two questions

## 4. Still a secret to solve — 4/4

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

- [x] OAuth install flow for the scheduled job — written and tested offline;
      running it for real is the section 3 item above
- [x] Uninstall deletes the stored token and the installer's email address
- [x] Token storage that survives monday's security review — `SecureStorage`
      and `SecretsManager`, both named APIs now rather than an open problem
- [x] The token cannot leave the process: the endpoint is validated before the
      token is attached, and every response is scrubbed of it before parsing

## 5. Marketplace — 1/5

- [ ] Burp scan passed, findings fixed
- [x] Listing copy and privacy policy drafted — `LISTING.md`,
      `PRIVACY_POLICY.md`, each describing only what the code does; the
      owner's name, support email, price and mail provider left as `[FILL IN]`
- [ ] Screenshots from a real account, and an icon
- [ ] Submitted
- [ ] Approved

## 6. Validation and sales — 2/5

- [x] Confirmed no competing automation-monitoring app surfaced in search
- [x] Marketplace search — the full public catalog (1,293 apps), not just the
      search box: no app monitors native automations. See `COMPETITORS.md`.
- [ ] Ten admins asked what they do today when an automation dies silently
      (1 of 10: Jean Foreman, messaged 26 Sep)
- [ ] One person says they would pay a specific number
- [ ] One person actually pays

Recorded so far (details in `VALIDATION.md`): Samet reports people have said
they would pay, with who and how much still UNKNOWN; and one live lead running
200+ workflows who built their own failure checker.
