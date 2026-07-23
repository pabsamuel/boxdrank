# RISKS

Live risk register. Probability/impact: L/M/H. Full pre-mortem in `docs/product/SPEC_REVIEW.md` §6.

| # | Risk | P | I | Early warning | Mitigation | Owner |
|---|------|---|---|---------------|-----------|-------|
| 1 | "Works everywhere" perception fails (target apps reject rich content) | H | H | tap→send failure rate by app | data-driven compatibility registry, honest copy, clipboard/share fallbacks, launch shortlist of tested apps | product |
| 2 | Users distrust third-party keyboards (keylogger fear) | H | H | pack conversion good, keyboard activation poor | local-first keyboard, zero typed-text code paths, CI grep guard, public privacy doc, share-sheet mode without keyboard | eng |
| 3 | Provider API policy change breaks entitlements (Twitch/YouTube/Kick) | M | H | deprecation notices, sync error spike | adapter isolation + capability matrix, grace periods on provider outage, manual codes as universal fallback | eng |
| 4 | Copyright/impersonation floods moderation | M | H | duplicate handles, takedown volume | creator verification, content hashes, report/takedown flow, repeat-infringer policy, reserved handles | ops |
| 5 | App Store / Play review rejects keyboard or IAP model | M | H | review feedback | honest permission copy, minimal Full Access use, web-billing for creator SaaS only, store checklists | product |
| 6 | Entitlement engine correctness (out-of-order/duplicate events) | M | H | disputed entitlements, support tickets | evidence-sourced state machine, idempotent processing, reconciliation jobs, immutable history + tests | eng |
| 7 | Cold start: creators won't promote, fans won't install | H | H | packs created but links never shared | <5-min creator onboarding, QR/link kit, done-for-you onboarding for first 50 creators, Twitch-first wedge | growth |
| 8 | Cost blowout on storage/egress from animated assets | L | M | egress monitoring | dedupe by hash, size/frame caps, CDN, lifecycle rules, budget alerts | eng |
| 9 | Fabricated completeness (code that looks done but isn't shippable) | M | H | docs claim > demonstrated behavior | phase gates with verified commands in STATUS.md, no "done" without command evidence | eng |
| 10 | Fan Plus willingness-to-pay unproven | M | M | trial conversion < 2% | creator SaaS is primary revenue; Fan Plus experiments behind flags | product |
