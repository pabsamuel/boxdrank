# 0011 — The Plus moment: one-time price, offered on both screens when a play is locked

**Status:** accepted

## Context

M3 asks for the checkout link and the locked-play prompt. Before building the prompt we looked
at what families already pay for living-room games and what kids' apps do at the paywall
(scan done 2026-10-08; prices are what the public pages and trackers showed that day).

| product                                | model                                   | price                              |
| -------------------------------------- | --------------------------------------- | ---------------------------------- |
| Jackbox Party Pack (phones as pads)    | one-time per pack, plus a streaming sub | ~$25–35 per pack; channel $4.99/mo |
| AirConsole Hero (phones as pads on TV) | subscription, lifetime option           | ~$7.99/mo; lifetime ~$29.99        |
| Shadow Pals, Nico & Nor Shadow Play    | free with IAP / free, tablet only       | –                                  |
| Papaton Shadow Theater                 | physical kit + free companion app       | kit price                          |
| "Hacivat Karagöz" (Android runner)     | paid download, single character         | ₺3.99                              |

Three things stood out:

1. **Nobody sells a phone-as-rod shadow play on the TV.** The closest neighbours are party
   packs (phones as controllers, bought once) and shadow-puppet learning apps (free, tablet,
   no TV, no script). The Karagöz name on the stores is a ₺3.99 runner. There is no price
   anchor to match; the anchor is "a children's book" (`PRICING.md`).
2. **Parents mistrust subscriptions and in-app currency.** Parent guides warn about both;
   Airbridge's 2026 guide names "commitment anxiety" as the reason to offer one-time, and
   suggests a lifetime offer as the fallback after a decline. AirConsole's lifetime tier exists
   for the same reason.
3. **Where the paywall sits matters more than the number.** RevenueCat's 2026 report (115k
   apps) has freemium converting at a median 2.1 % by day 35 against 10.7 % for hard paywalls,
   but kids' apps that put the paywall _after_ the child has done the thing (a phonics app:
   after tracing a few letters while the parent watched) argue that the parent must see the
   value happen. Perde's free tier is a whole night (VISION, principle 6), so the lock is met
   on the second night, by a parent who has watched the child play.

## Decision

- **One-time, per family, ₺249 / $9 / €9 / £8.** Unchanged; the scan found no reason to move
  the number before the first ten sales. No subscription, no in-app currency, no ads.
- **The offer appears only when a locked play is tapped, on both screens at once.** The phone
  (held by the parent or the child) shows a sheet: what Plus is, the price once, the checkout
  button, and the box for a key. The TV shows the same offer as a card with a QR code of the
  checkout link, for 45 seconds, so the other parent on the sofa can buy from their own phone
  without taking the host phone away from the child. No countdown, no "limited offer", no
  dark pattern: "Not now" closes it and the free plays stay free.
- **The checkout link is runtime configuration on the relay** (`PERDE_CHECKOUT_URL` →
  `/api/entitlements`), read by the landing page, the phone and the TV. Opening the store is a
  repository variable, not a release.
- **The landing page states the whole deal before the first purchase:** a free/Plus table, the
  regional prices with VAT, "5 TVs · 14-day refund · no account", and four FAQ answers that a
  parent would otherwise ask (really one-time? where does the key go? can my child buy by
  accident? what if we don't like it?).

## Consequences

- Nothing is purchasable inside the app; a child tapping a locked play can only reach the offer
  screen, which is what the COPPA/GDPR-K-shaped guidance for kids' apps wants.
- `ROADMAP.md` M3: the prompt and the checkout link box is ticked. The store, the test-mode key
  run, the price revisit after ten sales and the domain remain owner steps (`PRICING.md`).
- If the conversion after launch is well below the freemium median, the first lever is the
  moment (offer at the end of the free play's curtain, when the night went well), not a harder
  paywall.

## Sources

- Weekend, "Is the Jackbox Price Tag Worth the Money in 2026?" — https://www.weekend.com/post/jackbox-price
- Jackbox Games, family reunion guide — https://www.jackboxgames.com/blog/the-best-party-games-to-play-during-your-family-reunion
- App Pricing Lab, AirConsole in-app purchases — https://apppricinglab.com/iap/apple/1017688554
- Apple App Store: Shadow Pals — https://apps.apple.com/app/6758228623 ; Nico & Nor Shadow Play — https://apps.apple.com/us/app/id1200082249
- Tamindir, "Hacivat Karagöz Oyunu" — https://www.tamindir.com/indir/hacivat-karagoz-oyunu/
- RevenueCat, "What's the best way to monetize kids apps" — https://www.revenuecat.com/blog/growth/whats-the-best-way-to-monetize-kids-apps/
- Airbridge, "Subscription vs one-time purchase app" (2026) — https://www.airbridge.io/en/blog/subscription-vs-one-time-purchase-app
- Screenwise, parent guide to game and app subscription models — https://screenwiseapp.com/guides/navigating-game-and-app-subscription-models
