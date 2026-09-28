# Lessons from Automation Watchdog: mistakes not to repeat

Each one cost time on the first app (23–28 Sep 2026).

## Wrong assumptions about monday

1. **A guessed data format passes every test and fails on real data.**
   Watchdog read `created_at` as milliseconds; it is 100-nanosecond ticks.
   Every real row came back `null`. Read the format; do not assume it.
2. **An account-wide `board_automations` query misses legacy automations.**
   Samet found this in the playground. Ask board by board.
3. **The default API version lacks new fields.** `board_automations` is
   missing from `2026-07`. Pass `apiVersion` explicitly.
4. **A 404 docs page means the page is missing, not the feature.** The manifest
   format exists; its page 404'd.

## Deploys and versions

5. **`mapps code:push -a` goes to the draft if one exists.** Watchdog's
   "deployed" fix sat on a draft while the Live URL served old code. After a
   push, check the version and `/health` on the Live URL.
6. **Secrets are read at boot.** Adding a secret after a deploy does nothing
   until the next deploy. This made Sidekick look broken (`"sidekick":"off"`).
7. **A live version is locked.** Plan feature changes as: draft, push to
   draft, promote.
8. **`.mappsignore` wildcards are silently ignored.** List literal paths.
9. **Samet ran commands from the wrong folder once** ("Failed in creating
   archive"). Always give the full `cd C:\Users\sametatesen2\boxdrank\<folder>`
   line.

## Correctness and honesty

10. **Privacy text must match the code.** Watchdog claimed it did not read
    item names while its query still requested the `data` field. Remove the
    field or change the text. Re-check both before submitting.
11. **Errors must look like errors.** Sidekick failures first went out as a
    200 with an apology, which monday counts as success. Use a 4xx with
    `severityCode: 4000`.
12. **A failed action must leave a trace.** A failed email left no run log,
    so the view said "checks never ran". Log every failure where the user
    can see it.
13. **Count only what you mean to count.** Watchdog's view first counted
    people as automations. Narrow by what the API says the actor is.

## Install and OAuth (if the new app ever uses OAuth)

14. monday's Share and marketplace installs add their own `state`. Check
    `state` only when your own cookie is present.
15. Without `force_install_if_needed=true`, OAuth completed but the app was
    never actually installed.
16. A reused or expired authorization code gets a 4xx from the token endpoint.
    Show "expired or already used", not a 502.

## Money and tooling

17. **Netlify's free plan is 300 credits a month; each production deploy
    costs 15.** Deploying on every push drained half of it. The `ignore` rule
    in `atesensoftware-site/netlify.toml` now builds only when the site
    changes. Deploy previews are free.
18. **ChatGPT's agent has a usage limit.** It ran out mid-task on 28 Sep. The
    Claude-in-Chrome side panel is the fallback.
19. **This cloud session has no computer use.** Samet runs PowerShell and
    clicks. Give him exact steps and ready prompts.

## Security habits

20. Samet pasted an API token into chat once. Whether it was regenerated is
    UNKNOWN. Never ask for a secret; if one appears, tell him to regenerate
    it: profile → Developers → API token → Regenerate, then
    `mapps init -t NEW`.
21. `mapps --verbose` logs the token. Never suggest it.
