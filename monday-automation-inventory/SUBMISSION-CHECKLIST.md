# What monday asks for before approving an app

Compiled from Watchdog's submission, sent 28 Sep 2026. Watchdog's filled-in
answers are the model: `../monday-automation-watchdog/SUBMISSION.md`,
`LISTING.md` and `SECURITY-ANSWERS.md`. The requirements are monday's, read
27–28 Sep from `developer.monday.com/apps/docs/` (`app-listing-page`,
`documentation-and-support`, `legal`, `product`, `privacy-and-security`,
`plans-and-pricing`). Re-read them: they change.

## The app itself

- [ ] At least one AI capability. Only AI apps are accepted (form, 28 Sep); a Sidekick tool counts.
- [ ] The version with every feature is **live**, not a draft, before the form is filled in.
- [ ] Monetization set up with monday's Monetization. Seat prices are whole USD, and seat-based plans need a trial.
- [ ] Plan entitlements enforced by the app. FACT: monday blocks a board view after a trial ends, but restricts nothing else.
- [ ] Light, dark and night themes.
- [ ] Viewers handled, with a message rather than a broken page.
- [ ] `valueCreatedForUser` sent when the user first gets value.

## Listing

| Field | Limit |
|---|---|
| App name | 30 characters, no "monday" |
| Short description | 60 characters |
| Long description | 200–2,000 characters. The checklist says 2,500 and the guidelines 2,000; stay under 2,000 |
| Keywords | up to 10 |
| Categories | up to 3, from monday's list |
| App icon | 192×192 PNG |
| Developer icon | 192×192 PNG. Watchdog's is `listing/developer-icon-192.png`; reuse it |
| App card image | 592×348 |
| Gallery | 3–5 images, 1920×960 |
| Video | 30–60 s, HD, MP4, at most 50 MB |
| How-to-use page | A URL that can be embedded in monday |
| Demo link | For reviewers |

## Legal and contact

The same for every app of Samet's:
- Entity: **Individual Developer**, "Samet Ateşen".
- Website: `https://atesensoftware.com`.
- Support: `support@atesensoftware.com`.
- Technical contact: `sametatesen2@gmail.com`, the address of his monday user,
  so the review-board invitation reaches him.

To do for each new app:
- [ ] Privacy policy at `https://atesensoftware.com/<slug>/privacy/`.
- [ ] Terms at `https://atesensoftware.com/<slug>/terms/`.
- [ ] The client id in `https://atesensoftware.com/monday-app-association.json`.
- [ ] SLA: Samet reads monday's text in the form and decides.
- [ ] Marketplace listing terms and the signature: Samet only.

## Security review

This follows the items on monday's checklist; Watchdog's answers show the
format.
- [ ] Burp scan. monday runs it; the app should serve only from its monday
      code URL.
- [ ] Where secrets live. The answer must be none in the repository, all in
      monday code secrets.
- [ ] What user data is stored, and why. For the MVP: none.
- [ ] Scopes, and a reason for each.
- [ ] Logging and retention.
- [ ] Injection. GraphQL values go in variables, never string-built.
- [ ] Input validation. The JWT is checked for signature, `exp` and `aud`.
- [ ] Every route authenticated, as a table of route and protection.
- [ ] HTTPS/HSTS: SSL Labs A+. The `*.monday.app` edge sets HSTS to 180 days.
- [ ] Malware check: Palo Alto URL filtering, Low-Risk.
- [ ] Third-party domains used.
- [ ] Screenshot of the authorization code. Watchdog cut it from the source
      with `scripts/make-assets.js`.
- [ ] Deleting data on uninstall. Nothing to delete if nothing is stored;
      say so.

## After submitting

- [ ] Watch for monday's "We received your monday apps marketplace
      submission" email.
- [ ] Watch for the review-board invitation (to `sametatesen2@gmail.com`).
- [ ] Watch for the Pricing & Plans tab, then submit the pricing version.
