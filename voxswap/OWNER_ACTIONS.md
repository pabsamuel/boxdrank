# Owner actions

Things only you can do. Claude cannot do any of these, and the project cannot
take real money until they are done.

---

## Before the first real run

- [ ] **Voice provider account + API key** → `voxswap/.env` as `ELEVENLABS_API_KEY`
      (or set up a local model instead — `docs/05-PROVIDERS.md`)
- [ ] **Translation key** if you sell other languages → `ANTHROPIC_API_KEY`, and
      `pip install anthropic`
- [ ] **ASR key** if your customers will not send scripts → `OPENAI_API_KEY`
- [ ] **Install ffmpeg** on the machine you will actually use
- [ ] **Record your own voice properly** — 2–5 minutes, quiet room, varied
      delivery. This is also your reference for what to ask customers for.

## Before the first paying customer

- [ ] **Fill in the consent form** (`templates/consent-form.md`) with your
      business name and email, replacing every `{PLACEHOLDER}`
- [ ] **Decide your retention period** and write it in that form. You have to be
      able to honour it — `purge` is the command that makes it true.
- [ ] **Write your terms**: personal use, own copy, no redistribution, revision
      window, refund policy
- [ ] **Set your prices** from your own measured costs — `docs/09-PRICING-AND-BUSINESS.md`
- [ ] **A business email address** that a third party can contact you on
      directly to withdraw consent, and that you actually read
- [ ] **One hour with a lawyer** in your country. Once money is involved, this is
      the cheapest insurance available.

## Judgement calls the software cannot make

- [ ] **Listen to every verification phrase**, especially third-party ones. Does
      it sound like the same person? Do they sound comfortable?
- [ ] **Decide the refusals**: celebrities, voice actors, streamers, "surprises",
      sexual content. Write your list down before someone asks, so the answer is
      already decided.
- [ ] **Sign off every delivery.** The QC report is a tool, not a signature.
      Listen to four lines.
- [ ] **Decide which titles you take.** Read the EULA of any you do repeatedly.

## Operational

- [ ] **Back up `orders/`.** The software does not — `work/` is disposable, but
      `orders/` holds customer data and consent evidence.
- [ ] **Keep `consent-audit.log` files forever.** They are your proof.
- [ ] **Diary your retention deadlines** and actually run `purge` when they
      arrive.
- [ ] **Re-check provider pricing** every few months and redo the arithmetic in
      `docs/09-PRICING-AND-BUSINESS.md`.

## Not needed yet

Deliberately listed so you do not build them too early: a website, a payment
integration, a customer portal, a queue, a company. Do ten orders by hand first.
The tenth one will tell you which of these you actually need.
