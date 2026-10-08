# `web/` — the public site

Four pages and one settings file. No build step, no server: GitHub Pages serves
the folder as it is, at <https://pabsamuel.github.io/boxdrank/voxswap/>.

| File | What it is |
| --- | --- |
| `site-config.js` | **The one file to edit before sharing the site**: brand, contact email, payment links, prices, turnaround. Every page reads it. |
| `index.html` | The landing page: a playable before/after of the same line, how it works, prices, the consent rules, FAQ. Turkish first, English toggle. |
| `booth.html` | The recording booth: the page a customer records their samples and signs the permission form on. |
| `demo.html` | Station Four — a tiny game, voiced as shipped and again in a stand-in customer's voice. One file, both casts embedded. |
| `audio/` | The six clips the landing page plays. Built by `tools/demo_game/build_page.py`. |

Both voices in the demo audio are synthetic stand-ins (LibriTTS speakers, CC BY
4.0), never a customer's recording. Do not put Piper's Ryan voice, or any model
trained on a non-commercial dataset, on these pages — they take payments.

## Going live: `site-config.js`

```js
brand: "Başrol",                 // header, titles, the consent the customer signs
contactEmail: "",                // where packs go; empty = "send it to whoever gave you the link"
checkout: { short: "", lead: "", crew: "" },   // a Shopier link per package
prices: { tr: {...}, en: {...} },
turnaround: { tr: "3–5 iş günü", en: "3–5 working days" },
localProcessing: true            // shows "your voice never goes to an AI company"
```

Everything empty degrades instead of breaking: with no payment link a price
button reads "Önce ücretsiz örnek" and opens the booth; with no email the last
booth screen tells the customer to send the file to whoever shared the link.

Keep `localProcessing` true only while orders run on `local_vc` on your own
machine. The day an order goes through a hosted provider, it becomes a false
statement on a sales page.

Set `VOXSWAP_BUSINESS_NAME` in `voxswap/.env` to the same name as `brand`, so a
third party's spoken consent names the business the customer bought from.

## The customer's path

1. **Landing page** → plays the demo, reads the rules, presses "Ücretsiz örnek".
2. **Booth** → name and email, a four-point permission form they tick and sign
   by typing their name, eight short lines read aloud, each checked as it is
   recorded. On the last screen: which game, which character (optional).
3. **Pack** → one `.zip` saved to their device. Then a "Share" button where the
   phone has a share sheet (it can carry the file into Mail or WhatsApp), and a
   pre-written email to `contactEmail` with the reference, the game and the
   character filled in. No browser can attach a file to an email link, so the
   page says to attach it.
4. **You** → free 3-line sample from their game. If they like it, they pay
   through the package's link and you run the full order.

## The booth in detail

Nobody types an order number. Put one in the link if you already have one
(`booth.html?order=ORD-123`); otherwise the page makes one — `VS-260926-K7QM`,
date plus four characters that survive being read aloud (no 0/O, 1/I/L) — and
shows it on the last screen as the reference to quote.

After every take it decodes the audio and says what to change in plain words:
clipping, room noise, level, length, how much of the take is speech. The
thresholds are the pipeline's own (`MIN_SAMPLE_SECONDS`, `GOOD_SAMPLE_SECONDS`
in `voxswap/consent.py`), so a pack the booth accepts, `voxswap validate`
accepts. While recording, the line being read lights up word by word (speech
recognition where the browser has it; the recording itself never leaves the
device).

The pack:

```
consent/C-1-signed.md       the four points they ticked, their typed signature, the date
voices/<voice_id>/*.wav     PCM WAV, mono, 48 kHz, 16-bit
intake.json                 voice + consent blocks for order.json, plus the game they asked for
README.txt                  what the operator does next, and every take's measurements
```

The booth covers **the customer's own voice only**. Someone else's voice — a
partner, a friend — needs that person's own spoken phrase and email; see
`docs/04-CONSENT-AND-RIGHTS.md`. The booth says so rather than offering a way
round it.

### Two things the browser decides, not us

**The microphone needs a top-level page.** Inside another site's frame the
browser refuses `getUserMedia` and never shows a prompt, so the first screen
probes and says which happened. Every screen also takes an uploaded file — a
phone's own voice recorder usually beats a browser capture anyway.

**Downloads differ by host.** From a normal web server the page saves the zip
itself. Inside a Claude artifact viewer it asks the platform to save it
(`HOSTED` picks the branch).

### Recording quality

Browser DSP is tuned for phone calls and hurts a clone, so capture turns off
echo cancellation, noise suppression and — most importantly — automatic gain
control, which would otherwise ride the level between takes.

## Rebuilding the demo audio

```bash
python3 tools/demo_game/make_assets.py --model ~/models/piper/en_US-libritts-high.onnx
# run the order (tools/demo_game/README.md), then:
python3 tools/demo_game/build_page.py --root demo-game
```
