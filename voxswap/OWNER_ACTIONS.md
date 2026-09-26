# Owner actions

Things only you can do. Claude cannot do any of these, and the project cannot
take real money until they are done.

---

## Tonight — 20 minutes, no accounts, no money

Everything needed for this is already built and running.

- [ ] **Record yourself in the booth**
      → <https://pabsamuel.github.io/boxdrank/voxswap/booth.html>
      Eleven screens, one line each. It checks every take as you go and hands
      you a zip laid out like an order folder. No microphone? Every screen also
      takes a file from your phone's voice recorder.
- [ ] **Listen to the game demo** and decide whether the quality sells
      → the `Station Four` page, switching the hero between both casts.
      If the swapped voice does not convince you, it will not convince a
      customer, and that is the thing to fix before anything else.
- [ ] **Install ffmpeg** on the machine you will actually work on. Without it
      VoxSwap still runs, but on its fallbacks.

## This week — your first real order

- [ ] **Pick a small game you own** with loose `.wav` or `.ogg` voice files.
      Steam → Settings → Browse local files, then look for `Audio`, `Sound`,
      `VO` or `Voice`. Avoid `.pak`, `.bnk` and `.bank` for the first one.
- [ ] **Run it**: unzip your booth pack into `orders/ORD-001/`, drop the game's
      audio under `assets/`, then `validate` → `run --only plan` → full run.
      `docs/02-OPERATOR-RUNBOOK.md` is the page to have open.
- [ ] **Install the result in the game and play it.** This is the only test
      that counts.
- [ ] **Write down every confusing or broken thing.** That list is the backlog.

No API key is needed for any of that — `"voice": "local_vc"` runs on your CPU.

## Only if you want hosted cloning

The local path is free and needs no account. A key buys you hosted cloning,
which clones from shorter samples and speaks more languages, at a per-character
price that stops being viable on a long game. Decide after your first order,
not before.

- [ ] **Voice provider account + API key** → `voxswap/.env` as `ELEVENLABS_API_KEY`
- [ ] **Translation key** if you sell other languages → `ANTHROPIC_API_KEY`, and
      `pip install anthropic`
- [ ] **ASR key** if your customers will not send scripts → `OPENAI_API_KEY`

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
