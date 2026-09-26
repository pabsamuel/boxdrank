# Risks

Ordered by how much damage they do, not how likely they are.

---

## 1. Someone clones a voice without real consent

**Damage:** ends the business, and hurts a real person.

**Mitigations in place:** hard gate with no override; order-specific spoken
verification phrase; third-party voices need their own email; consent re-checked
at clone time; withdrawal destroys the clone at the provider; audit log.

**Still on you:** actually listening to the phrase recording, and refusing the
order that feels wrong. The software cannot hear coercion. If a customer is
pushing hard for someone else's voice and that person is never directly in
contact, stop.

## 2. A customer redistributes the delivery

**Damage:** turns a personal-use mod into a distribution problem, with you named
on it.

**Mitigations:** the delivery contains only generated audio, never original
assets; `README.md` in every package states personal use; `manifest.json`
references originals by checksum rather than including them.

**Still on you:** terms that say it, and not building a "share your mod" feature
without thinking hard.

## 3. Provider cost overrun on a big title

**Damage:** you quote a fixed price for an RPG protagonist and lose money per
order.

**Mitigations:** `--only plan` gives a free line and character count before
anything is spent; `dry_run_limit` for cheap smoke tests; everything cached so
re-runs are free.

**Still on you:** doing the arithmetic *before* replying to the email. See
`docs/09-PRICING-AND-BUSINESS.md`.

## 4. A hosted API changes and jobs stop

**Damage:** a customer waits while you wait for a fix.

**Mitigations:** endpoints, model IDs and output formats are env vars, not code;
errors quote the provider's own response; retries with backoff; jobs resume from
the failed stage without re-paying.

**Still on you:** keeping a second provider configured, so a broken vendor is an
inconvenience rather than an outage.

## 5. Quality is not good enough and customers ask for refunds

**Damage:** slow bleed, bad reviews, wasted time.

**Mitigations:** QC gate blocks packaging below 97%; the report lists every
finding; free per-line re-records because takes are cached.

**Still on you:** sample quality is the dominant factor and it is set before you
ever touch the software. Push hard for good recordings — see
`docs/07-QUALITY-BAR.md`.

## 6. The customer cannot install what you sent

**Damage:** support time that eats the margin, on an order that technically
succeeded.

**Mitigations:** per-engine `INSTALL.md`; `WARNINGS.md` when there is a manual
step; `manifest.json` so they can verify and restore.

**Still on you:** for Wwise/FMOD titles, either sell assisted install or say no.
Do not sell a ZIP that needs three hours of the customer's Saturday.

## 7. Data loss — someone's recordings or a finished delivery

**Damage:** re-recording, apology, lost trust.

**Mitigations:** `work/` is disposable and never holds the only copy of anything;
customer data lives in `orders/` and is only touched by `purge`; original assets
are read-only.

**Still on you:** back up `orders/`. The software does not.

## 8. A legal challenge over a title

**Damage:** a letter you have to take seriously.

**Mitigations:** customer supplies their own audio; you distribute only what you
generated; one copy, one customer, personal use; no implication of endorsement.

**Still on you:** read the EULA of any title you do repeatedly, and get an hour
with a lawyer once real money is involved. `docs/04-CONSENT-AND-RIGHTS.md`
covers what is and is not settled.

## 9. You burn out on the admin

**Damage:** the most likely way this actually dies.

**Mitigations:** `watch` removes the run step; templates remove the writing;
`validate` and `plan` remove the guessing; the prompt library removes "what do I
even ask Claude".

**Still on you:** price so that ~25 minutes of your attention is genuinely paid
for, and put a deadline on consent chasing. The order that drags for three weeks
is the one that makes you hate this.

## 10. ffmpeg paths behave differently from the fallbacks

**Damage:** something breaks on the machine you actually work on, not the one
this was built on.

**Status:** both sides are now covered. `tests/test_ffmpeg_paths.py` exercises
the ffmpeg branches (decode/encode round-trip, `atempo`, `loudnorm`, the
streamed film bed, muxing, and a full film run) and skips where ffmpeg is
absent; CI runs half its matrix with ffmpeg installed. Writing those tests
found three real defects — see `DECISIONS.md` #17.

**Still on you:** the ffmpeg you have is not the ffmpeg CI has. If a build of
yours behaves differently, `python3 -m unittest tests.test_ffmpeg_paths` on
your own machine is the first thing to run.
