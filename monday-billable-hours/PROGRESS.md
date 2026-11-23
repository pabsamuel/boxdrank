# Progress — monday Automation Watchdog

Updated 27 Sep 2026 (seventh pass: monday's real marketplace checklist). Percentages are counted from the checklist below, not
estimated. An item is done or it is not; half-done items are listed as not done
with a note.

**Two numbers, because one would be misleading:**

| | Done | Note |
|---|---|---|
| **Code that can be written from here** | **63 / 68 — 93%** | Verified against a live account |
| **Distance to a product someone pays for** | **60 / 68 — 88%** | Recounted 27 Sep against monday's real review checklist; customer-validation items removed by the owner 28 Sep; AI requirement added 28 Sep |

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
      (26 Sep); **mail verified on 27 Sep** (`/health` says `verified`), so
      the first real email can go out at the next daily check, 09:00 Türkiye
      time — if an automation is stopped then. Failed sends before today were
      not recorded as delivered, so nothing was swallowed
      - 28 Sep, after the 09:00 check: no alert email in Gmail (searched
        06:45 UTC, sent mail and all folders included). INFERENCE: nothing
        was stopped. Automation Inventory, at 07:49 the same morning, showed
        5 automations, 0 switched off, 0 with a warning from monday. Whether
        the check itself ran is UNKNOWN from here; the board view's run strip
        says "Last checked … ago" or "The last check failed: …".
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

## 5. Marketplace — 23/28

*Rewritten 27 Sep.* This section had five items. monday's own review checklist,
read on 27 Sep from `developer.monday.com/apps/docs/*.md` (app-listing-page,
documentation-and-support, legal, product, uiux, privacy-and-security,
submit-your-app, implementing-monetization), has far more. **The old 82% was
counted against an incomplete list and was wrong.** Fourteen of them were done
the same day; the code items go live with the next `mapps code:push`.

**Risk, not a checklist item (FACT, quoted from submit-your-app):** "New apps
built primarily using no-code platforms or AI-generated 'vibe code' are not
eligible for marketplace approval." This app was written with an AI assistant.
How monday decides what counts is UNKNOWN.

Listing
- [x] Listing copy and privacy policy drafted — `LISTING.md`,
      `PRIVACY_POLICY.md`, each describing only what the code does
- [x] Short description (51 characters), long description (about 1,600),
      10 keywords, 3 categories — `LISTING.md`
- [x] App icon and developer icon, 192×192 — `listing/` (the developer icon
      is initials "SA"; redo if the entity name changes)
- [x] App card image, 592×348
- [x] 4 gallery images, 1920×960 — the real board view on the demo account
- [x] Video — 45 s, 1920×1080 MP4, about 9 MB (`listing/automation-watchdog.mp4`,
      `scripts/make-video.js`); the listing guidelines ask for 30–60 s, HD,
      MP4, 50 MB at most

Documentation, support and money
- [ ] Pricing chosen and submitted as a pricing version — **chosen 27 Sep**:
      seat-based, $1 a seat a month, Optimized, 14-day trial (reasons in
      `LISTING.md`); not yet submitted in the Developer Center
      - Every field, checked against monday's docs (4 Oct), and a Chrome
        prompt that fills it in: `PRICING-VERSION.md`. Waits for the Pricing &
        Plans tab
- [x] Subscription checked at runtime and enforced in code, with the payment
      prompt from the SDK — off until pricing exists (`WATCHDOG_BILLING`)
- [x] Support email on a domain the owner controls, and a website link —
      `https://atesensoftware.com` is **live** (27 Sep, HTTPS, SSL Labs A+);
      `support@atesensoftware.com` forwards to Gmail by Cloudflare Email
      Routing. Proven 1 Oct from Gmail: mail sent only to
      `support@atesensoftware.com` by outside senders (Zoho Marketplace,
      29 Sep 21:25 UTC, after the move to Cloudflare) is in the inbox
- [x] `monday-app-association.json` on that domain, and an install button on
      the website — live, with the right client id
- [x] How-to-use page, embeddable in monday, linked from the app —
      `/view/how-to.html`
- [x] Demo link for the reviewers — the Live URL's `/view/` runs on the demo
      account outside monday. It was broken until 28 Sep: the live app
      answered 404 for the demo data. Fixed in 4a9aee0 and deployed the same
      day. Verified live: `/fixtures/demo-activity.json` answers 200 with 3
      boards and 1,327 entries, and the served `main.js` has no inventory
      tab

Legal
- [x] Terms of Service, which must say whether users will be contacted —
      live at `https://atesensoftware.com/automation-watchdog/terms/`, under
      Samet Ateşen (confirmed 27 Sep)
- [x] Privacy policy public, under the same entity name — live at
      `https://atesensoftware.com/automation-watchdog/privacy/`

Product and UI/UX
- [x] Value-created event, once the results are on screen
- [x] A clear message for viewers (`isViewOnly`), with no API call
- [x] Welcome page before the main view, with a screenshot
- [x] Tooltips on every status
- [x] Light, dark and night mode, from monday's context
- [x] Back to monday after authorizing (found on the product checklist while
      writing the security answers; the install page did not do it)
- [x] Uninstall and reinstall verified; two accounts sharing one email verified
      (1–2 Oct 2026, `REINSTALL-TEST.md`)
      — the first attempt (28 Sep) found two real bugs, both fixed with tests:
      an install from monday's own link was refused for carrying no state,
      and the app was never actually installed on the account (authorizing
      is not installing; `force_install_if_needed` now asks monday to install
      first). A failed alert email also left no run log, so the view said
      checks had never run; fixed. To redo after the next deploy
      - 1 Oct (`REINSTALL-TEST.md`): uninstall verified live; the webhook
        deleted the record in 2 s. The reinstall found a third bug: on an
        account with nothing to watch yet, the view hid the run strip and its
        "Set up email alerts" link, so a new install could never set up
        alerts. Fixed with a browser check, and live since 2 Oct (checked
        byte for byte). Run 2 of the test is next

Privacy and security
- [x] Tokens and the installer's address in monday `SecureStorage`; the OAuth
      state cookie is `HttpOnly; Secure`
- [x] Written answers with evidence — `SECURITY-ANSWERS.md`, with the
      authorization-code screenshot in `listing/auth-code.png`; three answers
      wait on the items below
- [x] SSL Labs link showing HSTS, and a malware check, for every domain —
      SSL Labs 27 Sep: **A+** for both, HSTS present, TLS 1.2 and 1.3 only;
      Palo Alto URL filtering 28 Sep: both **Low-Risk** (`SECURITY-ANSWERS.md`)
- [ ] monday's Burp scan passed (monday runs it during review)

AI capability — **required since at least 28 Sep** (FACT, the submission
form: "monday.com is only accepting apps that include AI capabilities. If you
proceed with submitting this form for an app that does not include AI
capabilities, your submission will be rejected.")
- [x] Sidekick tool built: `POST /monday/sidekick/check` answers "which of my
      automations have stopped?" in words, for every board or one by name,
      within 8 seconds, with the request's short-lived token (`sidekick.js`,
      11 tests)
- [x] Sidekick tool and its action block created in the Developer Center,
      `MONDAY_SIGNING_SECRET` set, version 18316508 promoted to live (28 Sep);
      `/health` says `"sidekick":"on"` and an unsigned call gets 401
- [x] Seen working end to end (28 Sep, 03:10): with the block enabled for
      the automation builder in v4, "When an item is created → find stopped
      automations" ran with **Success** in 7 s, and the server logged
      `sidekick check for account 36993937: 0 stopped, 6 boards`. Signing
      secret, audience and short-lived token all worked for real. Asking
      sidekick itself stays untested: the account has no AI credits

Submission
- [x] Published from the Share tab (28 Sep): `…/oauth2/authorize?client_id=…&response_type=install`
- [x] Submission form sent — **28 Sep 2026**; monday: "We received your monday apps marketplace submission. You will be contacted shortly to start the review process" (initial response promised within 72 business hours)
- [ ] Payoneer account and vendor registration. FACT, 1 Oct (`PLATFORM.md`):
      Payoneer is required, and vendor registration is through **Zip**, whose
      email comes after submission. Gmail had no Zip email on 1 Oct, three
      days after both apps were submitted. Registration is one-time, for both
      apps
      - FACT (Payoneer, 2 Oct 2026): a new Payoneer application was refused
        because "Payoneer only allows one account per customer … you already
        have an existing Payoneer account!" So when monday or Zip asks,
        **connect the existing account**: sign in and don't apply again. If
        the sign-in is lost, use Payoneer's account-recovery FAQ from that
        email. The customer id is in the email, not here
- [ ] Approved
- **Risk, 4 Oct 2026:** monday emailed "Your trial ends tomorrow. … Your
  automations will stop running … Your integrations will disconnect." on
  3 Oct, to both `sametatesen2@gmail.com` and `sametatesen2+@gmail.com`.
  Which account it means is UNKNOWN. If it is `sametatesen2s-team-company`
  (36993937), the account that owns both apps and their monday code services,
  what happens to the apps is UNKNOWN. Both answered 200 on `/health` on
  4 Oct 06:30 UTC.
  - FACT (`apps/docs/intro`, read 4 Oct): "If you're currently on a trial and
    need more time, you can contact our support team to request a trial
    extension."
  - Free developer accounts exist (team-squad is one).
  - 8 Oct 2026: both apps still answer 200 on `/health` and `/view/`, four
    days after the trial's end date. INFERENCE: the trial did not take the
    monday code hosting down. Which account it was is still unconfirmed
    (`SAMET-TODO.md` 1).
- **Review response overdue, 8 Oct 2026.** FACT
  (`apps/docs/submit-your-app.md`, updated 25 Feb 2026): "You can expect an
  initial response within 72 business hours of submission". Problems come as
  an invitation to "a monday.com board" by email. Both apps were submitted on
  28 Sep. By 8 Oct no invitation or other email from monday's review team
  had arrived, and the submission sent no confirmation email either.
  - **Asked 8 Oct.** Samet sent the follow-up through monday's help-centre
    contact form, asking whether both submissions were received. The page
    answered "Email confirmed. Your request was sent. An agent will get back
    to you soon. You'll receive updates by email." The daily check now
    watches for the reply.
  - FACT (Gmail, read 9 Oct 2026): monday's acknowledgement came 8 Oct
    06:40 UTC as ticket **#5255645**, subject "Review invitation pending:
    Template Guard (12248804) and Automation Watchdog (12249756)". **Automation
    Inventory (12255778) is not named in it.** No agent reply as of 9 Oct
    06:21 UTC.
  - **Answered 9 Oct 2026, 16:58 UTC** (Angel Santizo, Technical Support
    Engineer; read 10 Oct). FACT, quoted: "both of your submissions are there
    and in the review queue. I can see Template Guard (App ID 12248804) and
    Automation Watchdog (App ID 12249756)"; "Our review team has been working
    through a significant backlog over the past few weeks"; "this is not a
    sign that anything is missing or incomplete on your end"; the "locked for
    changes" state "is expected and correct while they are under review".
    No date given. **Watchdog is confirmed in the queue; nothing is needed
    from Samet.** Inventory was not asked about, so it is not confirmed.
  - 13 Oct 2026, 02:01 UTC: monday's reminder on the same ticket: "If we
    don't hear back from you within two business days we'll go ahead and
    close this request". So it closes around 15 Oct unless Samet replies.
    Replying is also the way to ask about Inventory on the same ticket.
  - 14 Oct 2026, 02:02 UTC: a satisfaction survey on the ticket ("Did we
    resolve your issue?"). INFERENCE: monday marked it solved. Samet had not
    replied, so Inventory is still not confirmed.
  - Overtaken: Inventory was reviewed after all (16 Oct) and **rejected on
    21 Oct** for overlapping native functionality
    (`../monday-automation-inventory/DECISIONS.md`). Watchdog has had no
    review email yet; its answers are ready in `REVIEW-ANSWERS-WATCHDOG.md`.
  - 23 Oct 2026, 22:52 UTC: a follow-up on ticket #5255645 went from Samet's
    Gmail (not by this session), asking support to confirm Watchdog is still
    in the queue and its version still locked and unchanged. The daily check
    watches for the answer.

## 6. Market check — 2/2

- [x] Confirmed no competing automation-monitoring app surfaced in search
- [x] Marketplace search — the full public catalog (1,293 apps), not just the
      search box: no app monitors native automations. See `COMPETITORS.md`.

**Removed from the checklist by the owner on 28 Sep:** asking ten admins, one
person naming a price, and one person paying. They were never a gate (that
rule was removed on 27 Sep); now they are not counted either. What was
learned stays in `VALIDATION.md`: 2 of 10 asked (Jean Foreman, Patrick
Fallon), no price named, nobody has paid. Sales are measured after launch, in
monday's own analytics.

Recorded so far (details in `VALIDATION.md`): Samet reports people have said
they would pay, with who and how much still UNKNOWN; and one live lead running
200+ workflows who built their own failure checker.

## Node.js CVE-2026-111497: patched on all apps (24–25 Oct 2026)

- FACT (nodejs.org, "Wednesday, October 21, 2026 Security Releases", read
  25 Oct): CVE-2026-111497, High, "Node.js Brotli decoder out-of-bounds write
  permits remote code execution". Fixed in 22.23.4, 24.22.1 and 26.12.1.
- monday's notices, from team@learn.mail.monday.com (replies bounce: "550
  5.7.1 relaying denied"):
  - 24 Oct 21:05 UTC, "Urgent Action Required: update your Marketplace app
    within 12 hours": Automation Inventory and Template Guard;
  - 25 Oct 17:25 UTC, "Important update on your monday.com marketplace
    app(s)": Automation Watchdog, 48 hours to confirm or it "may" be disabled;
  - 25 Oct 19:46 UTC, same subject: Automation Inventory, 24 hours.
- Done from Samet's account, not by this session (FACT, the sent mails):
  - Inventory: Node 22.12.0 → 22.23.4, pushed to live version 18319401 on
    24 Oct 23:34 UTC; scan 0 findings; `/health` 200.
  - Watchdog: Node 22.12.0 → 22.23.4, pushed to live version **18317118**
    on 25 Oct 17:39 UTC with `mapps code:push -s -f -i 18317118`; scan 0
    findings; `/health` 200.
  - Confirmations sent to support ticket **#5289547** (24 Oct 23:59, 25 Oct
    17:39 and 20:12 UTC). No links in the notices were clicked.
- monday support (Daniel Vasquez, 25 Oct 02:44 UTC): pushing to the existing
  live version "is completely sufficient"; no new version or resubmission
  unless features, scopes or manifest change; pass the live version with
  `-i`, "as the CLI targets the latest draft version by default"; pushing to
  the live version "does not break the review queue". He also wrote that
  monday "does not send automated 12-hour urgent security notices via email"
  and that the bounce "strongly suggests the sender address may have been
  spoofed". Whether the notices are genuine is UNKNOWN; the advisory they cite
  is real, and the patch is right either way.
- 26 Oct: this repo's `.mondaycoderc` set to 22.23.4 in Watchdog, Inventory
  and Unanswered Updates, to match what is deployed. Before this, a push from
  the repo would have put the vulnerable 22.12.0 back. `check:deploy` passes
  on all three.
- 26 Oct 07:00 UTC: the 24 Oct notice again (Inventory and Template Guard);
  answered on #5289547 at 07:13 from Samet's account.
- **27 Oct 04:16 UTC, support (Daniel Vasquez):** "both Template Guard
  (12248804) and Automation Inventory (12255778) are officially marked as
  patched and fixed with Node.js 22.23.4 … The previous automated warnings
  can be safely disregarded". **Watchdog is not named** in that answer,
  although its patch was reported on the ticket on 25 Oct. 29 Oct 05:01 UTC:
  reminder; #5289547 closes after two business days without a reply.
- 29 Oct: Watchdog's `/health` reads `{"ok":true,"mail":"verified",…}`; it has
  not been disabled.

## Watchdog review status, 27 Oct 2026

- FACT (support ticket #5255645, Angel Santizo, 27 Oct 13:33 UTC, answering
  Samet's 26 Oct follow-up): "Your submission is still standing in the review
  queue and the version remains locked and unchanged on our end … there has
  been movement on the review side. It is a matter of time before the team
  reaches out to you directly with next steps." The same mail confirms
  Update Mover (12189366, another session's app) is queued.
- The answers for the reviewer's likely questions are ready in
  `REVIEW-ANSWERS-WATCHDOG.md`.
