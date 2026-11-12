# Market and competitors

What was found when looking for anyone already selling this, what people pay
for nearby things, and the choices on the website that follow from it. Searched
on 2026-10-08. Prices drift and listings disappear — re-check before quoting any
of this to someone.

## The short version

* **Nobody sells this as a finished service.** Searches for "your voice as a game
  character" turn up three neighbours, none of which is it: real-time voice
  changers (you sound like someone else while you talk), voice actors for hire
  (someone else's voice in your game), and AI voice models for developers. One
  search summary put it plainly: no service built for this gift was found.
* **The demand signal is indirect but real.** EA reportedly filed a patent for
  players recording their own voice and having it turned into a character
  voice. Modders already sell AI voice work by the line. Neither proves people
  will pay *us* — the free sample on the site is how that gets measured.
* **The price anchors are $50–100 for a small custom pack**, and $1.50–5 a line.
* **Consent is the industry's sore spot.** The best-known AI voice-mod story is
  voice actors finding their voices cloned without permission. The site leads
  with "we only use voices their owners hand over", and the code enforces it.

## Who is nearby

| Kind | Examples | Why it is not this |
| --- | --- | --- |
| Real-time voice changers | Voicemod, Dubbing AI | Change how *you* sound to other players. The game's own lines stay as shipped. |
| Voice actors for hire | Fiverr / Upwork game VO gigs (≈ $10 per 100 words) | An actor's voice, not the customer's. Made for developers with scripts. |
| Developer voice platforms | Cartesia, Morphic, ElevenLabs, Fish Audio | Tools, not a service. Cartesia's voice changer keeps your delivery and changes the voice — the same idea as ours, aimed at studios. |
| Custom voice-model commissions | Fiverr RVC sellers, BOOTH (Japan) | Deliver a model file, not a game. The buyer still has to do all the modding. |
| AI voice-mod commissions | Patreon / Carrd mod authors | Closest in spirit; one game at a time, usually a celebrity or character voice — the thing we refuse. |
| Same name | VoxSwap (crypto exchange), VoxSwap AI (MegaMix, vocals for musicians) | Why the public brand is separate from the software's name. |

## What people pay nearby

| Offer | Price | Source |
| --- | --- | --- |
| XCOM 2 voice pack assembled from your own recordings | up to $50, some $50–100 | Fiverr |
| Boss voice for a game mod | $50 | Fiverr (on hold) |
| Marvel Rivals audio mod | $5 per voice line, $10 music | Fiverr (on hold) |
| AI-voiced mod work | $15 base + $1.50 per line | a mod author's Patreon, 2024 |
| Custom voice, ~26–30 files | $100 | a mod author's Carrd |
| Custom RVC voice model | ≈ ¥40,000 base, plus training and cleanup | BOOTH |
| Custom RVC voice model | up to $50 | Fiverr |
| Ready-made RVC voice | ¥3,000–5,000 | BOOTH |

That is where `site-config.js` starts: **Kısa ₺799 / $19** (a short game or a
gift), **Başrol ₺2.499 / $59** (a whole lead character, the anchor), **Ekip
₺3.999 / $99** (three voices). They sit at or under the commission prices
above while doing more of the work — the customer gets an installable pack,
not a model file. Change them freely; nothing else depends on the numbers.

The real cost floor is your time. On the local path a 1,500-line hero is a
couple of hours of CPU and maybe an hour of checking. Measure your first three
orders and redo `docs/09-PRICING-AND-BUSINESS.md` with your own numbers.

## Taking money from Turkey

| Option | Status |
| --- | --- |
| **Shopier** | Works for an individual seller (bireysel hesap). Free to join; reported commission about 5.99% + ₺0.49 per sale below ₺15,000 a month, falling with volume, plus VAT on the commission. Third-party figures — the official price page was not reachable. Payouts can wait for a confirmation period on service sales. |
| Lemon Squeezy | Could not confirm bank payouts to Turkey (docs blocked from here; country list cut off before T). |
| Gumroad | Bank deposit "for most countries", PayPal otherwise; Turkey not confirmed, and PayPal does not operate there. |
| PayPal | Not available in Turkey. |

So the site is built for **one payment link per package**. Paste the Shopier
links into `site-config.js` and the price buttons become "Sipariş ver". Until
then they send people to the free sample, which is the right first step anyway.

Selling regularly makes it a business for tax purposes even as an individual;
that is a question for a mali müşavir, not for this file.

## Name

"VoxSwap" is taken twice over (above). "Herovoice" is an iPhone social app.
**"Başrol"** ("lead role") found no app or game in a search and says what is
being sold in one Turkish word. It lives in one place — `brand` in
`site-config.js` — and in `VOXSWAP_BUSINESS_NAME` for the consent phrase. Check
the domain and a trademark search before printing it on anything.

## Risks the website answers up front

* **"Is this deepfaking voice actors?"** — No: celebrities, streamers,
  politicians and professional voice actors are refused at any price, and a
  third party's voice needs their own spoken consent and email.
* **Online games** — modified files can count as cheating. The FAQ says
  single-player only.
* **"Will it sound robotic?"** — the page plays the same line in both voices
  and draws both waveforms from the files: same length to the millisecond,
  because the performance is converted, not re-read.
* **Steam's AI disclosure rule** applies to developers publishing games, not to
  a personal mod a player installs. Nothing here is published on Steam.

## Sources

- [Fiverr — XCOM 2 voice pack](https://fiverr.com/drawnsnake/create-an-xcom-2-voicepack-for-you)
- [Fiverr — Marvel Rivals audio mod](https://www.fiverr.com/vgmelodies/make-you-a-custom-marvel-rivals-audio-mod)
- [Patreon — mod commission sheet](https://www.patreon.com/posts/mod-commission-100451105)
- [Carrd — mod commission info](https://mizartz-dst.carrd.co/)
- [Fiverr — custom AI voice category (consent requirement)](https://block.fiverr.com/categories/music-audio/voice-synthesis-ai/voice-cloning)
- [BOOTH — custom RVC v2 model commission](https://booth.pm/en/items/7345691)
- [Fiverr — RVC v2 model](https://fiverr.com/maya8156/create-a-perfect-rvc-v2-model-for-you)
- [Fiverr — game character voice-over](https://fiverr.com/taylorjsmall/record-a-reassuring-british-male-voice-over)
- [Cartesia — gaming use cases](https://cartesia.ai/use-cases/gaming)
- [Morphic — video game NPC voices](https://morphic.com/resources/voices/video-game-npc-voices)
- [Press Start — EA patent on player voice](https://press-start.com.au/?p=150644)
- [Voicemod on the Epic Games Store](https://store.epicgames.com/p/voicemod-34bcbe)
- [Dubbing AI on FutureTools](https://www.futuretools.io/tools/dubbing-ai)
- [Klever forum — VoxSwap (crypto)](https://forum.klever.org/t/about-the-vox-swap-category/641)
- [MegaMix AI — VoxSwap for musicians](https://megamixai-mvp-backend.onrender.com/blogs/what-is-voxswap-ai-voice-swap-for-musicians)
- [App Store — HeroVoice](https://apps.apple.com/mx/app/herovoice/id6744604437)
- [IdeaSoft — Shopier commission rates 2026](https://www.ideasoft.com.tr/shopier-komisyon-oranlari/)
- [ikas — Shopier commission calculator](https://ikas.com/tr/shopier-komisyon-hesaplama)
- [Manay CPA — Shopier guide 2026](https://www.manaycpa.com/tr/shopier-nedir-nasil-kullanilir-shopier-ile-online-satis-rehberi/)
- [Gumroad — getting paid](https://gumroad.com/help/article/13-getting-paid)
- [Lemon Squeezy — supported countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)
- [Nexus Mods forum — AI voice mods](https://forums.nexusmods.com/topic/13480093-ai-voice-mods-are-unethical-and-nexus-should-either-ban-or-limit-them)
- [TechRadar — voice actors and Skyrim AI mods](https://www.techradar.com/gaming/consoles-pc/voice-actors-are-being-abused-by-skyrim-modding-communities-using-ai)
- [NME — voice actors denounce AI deepfake mods](https://www.nme.com/news/video-game-voice-actors-denounce-nsfw-mods-ai-deepfakes-voices-3466276)
- [Cinevva — AI voice acting in games (TR)](https://app.cinevva.com/tr/guides/ai-voice-acting-games)
