# Prompt — Phase 5: billing and marketplace launch

Paste into a fresh Claude Code session in this repo.

---

Read `CLAUDE.md` and `docs/PRODUCT.md`. Phase 4 must be done.

Ship it.

1. **Billing** via monday's marketplace billing (not Stripe — marketplace apps
   bill through the platform). Tiers from `docs/PRODUCT.md`: Free, Pro $39/mo,
   Agency $99/mo, priced **per account, not per seat**. Enforce tiers server-side;
   client-side gating is decoration.

2. **Listing copy.** Title and description must carry the terms admins actually
   search: audit, permissions, seats, license, inactive users, governance. Lead
   the description with the saving, and anchor the price against it — "$39 to
   find $150" — never against other apps.

3. **Security review prep.** State plainly that SeatGuard reads account
   structure only and never item data, list the exact scopes and why each is
   needed, and note the empty dependency tree. All three shorten review.

4. **Screenshots** from the demo fixture, not a real customer account.

5. **Submit**, then write `docs/LAUNCH.md` recording what review asked for and
   how long it took — Template Guard and the Quota Analyzer will go through the
   same process and should not have to rediscover it.

Before submitting, run through it as a first-time admin: install, first audit,
first finding, upgrade prompt. Anything confusing there costs more than any
feature you could add instead.
