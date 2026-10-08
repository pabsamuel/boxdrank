# Owner actions

Things only you can do — accounts in your name, money, legal judgement, your
own voice. Everything else is built.

The site is live at <https://pabsamuel.github.io/boxdrank/voxswap/>. It already
works without any of the steps below: the price buttons lead to the free sample,
and the booth tells people to send their pack to whoever shared the link. Each
step below switches one more thing on.

---

## 1. Start taking orders — about an hour

- [ ] **A business email you read every day.** A new Gmail just for this is
      fine. Not your personal one: it goes on a public page, and it is the
      address a third party uses to withdraw consent.
      → put it in `voxswap/web/site-config.js` as `contactEmail`.
      From then on the booth's last screen opens a ready-written email to it.
- [ ] **Shopier account** (bireysel hesap is fine) → <https://www.shopier.com>
      Create three digital-service products — *Kısa*, *Başrol*, *Ekip* — at the
      prices in `site-config.js` (or your own). Copy each product link into
      `checkout.short` / `checkout.lead` / `checkout.crew`.
      The buttons then say "Sipariş ver" and open Shopier.
- [ ] **Check the name.** "Başrol" found no competing app, but search the
      domain and do a quick trademark search before you print it anywhere.
      To rename, change `brand` in `site-config.js` — it is the only place.
- [ ] **Set `VOXSWAP_BUSINESS_NAME=Başrol`** (or your name) in `voxswap/.env`, so
      a third party's spoken consent names your business.
- [ ] **Commit `site-config.js` to `main`** (or ask Claude to). The site updates
      within a minute or two.

## 2. Before the first paid order

- [ ] **Record yourself in the booth** and run one real order on a game you own
      → `docs/02-OPERATOR-RUNBOOK.md`. Install it and play it. This is the only
      test that counts.
- [ ] **Listen to the demo** on the landing page with headphones. If it does
      not convince you, it will not convince a customer.
- [ ] **Time it.** Note how long your first three orders take you, then check
      the prices still make sense — `docs/09-PRICING-AND-BUSINESS.md`.
- [ ] **Mali müşavir.** Selling repeatedly is a business for tax purposes even
      as an individual. One call before the first sale.
- [ ] **One hour with a lawyer** on the consent form and terms. Cheapest
      insurance there is.
- [ ] **Fill in `templates/consent-form.md`** with your business name and
      email; decide your **retention period** and write it in. `purge` is the
      command that makes it true.
- [ ] **Write your terms** (or have the lawyer do it): personal use, own copy of
      the game, no redistribution, one round of fixes, refunds.

## 3. Getting the first customers

- [ ] **Post the demo.** The landing page's player is the pitch — a 15-second
      screen recording of switching "Oyundaki ses" → "Senin sesin" mid-line.
      Instagram/TikTok reels, r/gaming-style communities, Turkish gaming
      Discords. Say plainly it is AI voice conversion with the person's consent.
- [ ] **Gift angle**: birthdays, anniversaries ("sevgilin oyunun kahramanı
      olsun"). The *Ekip* package exists for it — each person records and
      consents themselves.
- [ ] **Answer every free-sample request within a day.** That is the
      conversion step; nothing else on the site matters as much.

## Judgement calls the software cannot make

- [ ] **Listen to every verification phrase**, especially third-party ones. Same
      person? Comfortable?
- [ ] **The refusals** are on the site already: celebrities, streamers,
      politicians, professional voice actors. Add your own (sexual content,
      "surprise" recordings of someone else) before someone asks.
- [ ] **Sign off every delivery.** The QC report is a tool, not a signature.
      Listen to at least four lines.
- [ ] **Single-player games only.** The FAQ says so; hold to it.

## Operational

- [ ] **Back up `orders/`.** `work/` is disposable; `orders/` holds customer
      data and consent evidence.
- [ ] **Keep every `consent-audit.log` forever.** It is your proof.
- [ ] **Diary retention deadlines** and actually run `purge` when they arrive.
- [ ] **Turn off `localProcessing`** in `site-config.js` the day any order goes
      through a hosted provider — the page promises otherwise.

## Only if you want hosted cloning

The local path (`"voice": "local_vc"`) is free and needs no account. A key buys
hosted cloning at a per-character price that stops being viable on a long game.
Decide after your first orders, not before.

- [ ] Voice provider key → `voxswap/.env` as `ELEVENLABS_API_KEY`
- [ ] Translation key → `ANTHROPIC_API_KEY` and `pip install anthropic`
- [ ] ASR key → `OPENAI_API_KEY`
