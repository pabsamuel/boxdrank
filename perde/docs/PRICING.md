# Pricing

## Model

One-time purchase per family. No subscription, no ads, no accounts. The free tier is a full
Karagöz night; Plus is the rest of the library and every other tradition, forever, including
plays added later.

|                                                                                                   | Free | Perde Plus |
| ------------------------------------------------------------------------------------------------- | ---- | ---------- |
| Karagöz: Giriş + Salıncak                                                                         | ✓    | ✓          |
| Karagöz: Kayık, Eczahane, and every future play                                                   |      | ✓          |
| Puppets: Karagöz, Hacivat, Çelebi, Zenne                                                          | ✓    | ✓          |
| Premium puppets (Tuzsuz Deli Bekir, …)                                                            |      | ✓          |
| Other traditions (Punch and Judy, Wayang Kulit now; Kasperle, Guignol, Píyǐngxì, Pulcinella next) |      | ✓          |
| Up to 4 phones, karaoke lines, speech recognition, free play                                      | ✓    | ✓          |
| Custom puppet colours, show recording (M6)                                                        |      | ✓          |

## Prices

Regional, one-time. Lemon Squeezy shows the local currency at checkout.

| region                           | price                                                                 |
| -------------------------------- | --------------------------------------------------------------------- |
| Türkiye                          | ₺249                                                                  |
| EU / UK                          | €9 / £8                                                               |
| US and rest of world             | $9                                                                    |
| Schools (one key, one classroom) | same price; a school licence for many classrooms is a later line item |

Why these numbers: the price of a children's book, the mental slot this occupies. Higher than an
app-store impulse buy because it's bought by a parent for repeated family use, low enough that
the first Turkish reviews say "worth it" rather than "for that price…". Revisit after the first
ten sales (`ROADMAP.md`, M3) by changing the number, not by adding a survey step.

## Mechanics

- **Merchant of record: Lemon Squeezy.** It collects VAT/KDV worldwide and issues invoices, so
  the project never touches tax. A licence key is generated per order.
- **Activation.** The host phone opens the menu, types the key, taps "Perde Plus". The TV posts
  it to `/api/license/activate`; the Worker calls Lemon Squeezy's licence API (`activate`,
  `validate`) and the TV stores the key in localStorage. One key allows up to 5 activations
  (set the limit on the product), which covers a family's TVs and laptops.
- **Open mode.** `ENTITLEMENTS_MODE=open` unlocks everything without a key; used for
  development, self-hosting and demos. The deploy workflow defaults to `open` until the
  repository variable `ENTITLEMENTS_MODE=lemonsqueezy` is set.
- **Refunds.** 14 days, no questions, via Lemon Squeezy. Deactivate the key from the dashboard.

## Setup checklist (M3)

1. Create the Lemon Squeezy store and a product "Perde Plus" (one-time, licence keys ON,
   activation limit 5). Note the store id and product id.
2. Repository variables: `ENTITLEMENTS_MODE=lemonsqueezy`, `LEMONSQUEEZY_STORE_ID`,
   `LEMONSQUEEZY_PRODUCT_ID`, `PERDE_CHECKOUT_URL=https://<store>.lemonsqueezy.com/checkout/buy/<variant>`.
3. Push to `main`; the deploy workflow passes the vars to `wrangler deploy` and the landing
   page's "Get Perde Plus" button becomes the checkout link.
4. Buy a test-mode key, activate it on a TV, confirm Kayık starts and Punch and Judy loads.

`docs/SETUP_WITH_CHROME.md` has copy-paste prompts for doing the dashboard steps with Claude in
Chrome.
