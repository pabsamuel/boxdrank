# Payment rails, eligibility, and tax

## Do not build on Instagram Subscriptions

Instagram's native Subscriptions requires, as of 2026: a Creator/Business account, **10,000+
followers**, being 18+ **in a supported country**, compliance with Partner Monetization Policies —
and even then, access rolls out gradually, so eligible creators often sit on a **waitlist**
([ContentStudio](https://contentstudio.io/blog/instagram-subscriptions),
[Influencer Marketing Hub](https://influencermarketinghub.com/instagram-subscriptions-gifts/)).

Türkiye *is* on the supported-country list, alongside the US, UK, EU, Brazil, India, Japan,
South Korea and ~40 others. But three facts make it unusable as your foundation:

1. You cannot reach 10k followers for months, so months 1–6 have zero revenue path.
2. The waitlist is outside your control; "eligible" ≠ "enabled."
3. You cannot export subscribers, email them, or move them if Meta changes terms or bans the
   account. **You would be building your business on rented land.**

**Verify the current country list and requirements against Instagram's own Help Center before
acting — third-party blogs go stale, and this list changes.**

Treat IG Subscriptions as a *second* distribution channel to add after 10k, for the convenience
of people who won't leave the app. Never as the plan.

---

## The stack to actually use

| Layer | Tool | Why |
|---|---|---|
| Checkout + subscriptions | **Lemon Squeezy** or **Gumroad** | Merchant of record — they handle global VAT/sales tax *for you*, which matters enormously when selling to Gulf customers from Türkiye. Payouts via PayPal/Payoneer/wire. |
| Email list | **Kit** (free to 10k) or Beehiiv | The list is the only asset you own. Meta can delete the account; it cannot delete your list. |
| Community | Instagram **Broadcast Channel** (free tier) + WhatsApp group (Tier 2) | WhatsApp is where Gulf audiences actually are. Do not force Discord on them. |
| Calls | Zoom free tier → paid when calls exceed 40 min | |
| Ebook delivery | Included in Lemon Squeezy/Gumroad | Don't build a delivery system. |

**Stripe is not directly available to Türkiye-based businesses**, which is precisely why a
merchant-of-record platform is the right call rather than a nice-to-have. Verify your own
situation before committing.

### Pricing display
Price in **USD**. Gulf customers are entirely comfortable with USD pricing, and it protects you
from lira volatility. Do not price in TRY or in local Gulf currencies.

---

## Boring things that become expensive later

- **Tax.** Subscription income is taxable income in your country of residence from the first
  dollar. Talk to an accountant *before* the first launch, not at year end. A merchant of record
  handles the buyer-side VAT, not your income tax.
- **Refund policy.** Publish a plain 14-day no-questions refund policy. It raises conversion more
  than it costs, and it prevents chargebacks, which are far worse than refunds.
- **A business email** on your own domain. Free-mail addresses on a sales page visibly cost
  conversions.
- **Account recovery.** Turn on 2FA with an authenticator app, not SMS. Language accounts get
  targeted. Losing the account with no email list is the end of the business; with a list it's a
  bad month.

---

## Kill criteria for the money side

If, after **two** 5-day launch windows to a waitlist of 300+, you convert fewer than 15 paying
subscribers total — the problem is the offer, not the traffic. Go back to `OFFER.md` and
interview five people who didn't buy. Do not respond by posting more.

Sources: [ContentStudio](https://contentstudio.io/blog/instagram-subscriptions),
[Influencer Marketing Hub](https://influencermarketinghub.com/instagram-subscriptions-gifts/),
[Instagram Help Center](https://help.instagram.com/1389278101788752)
