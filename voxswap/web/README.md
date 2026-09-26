# `web/` — the customer-facing intake page

`booth.html` is the recording booth: the page a customer opens to record the
voice samples and the spoken consent phrase, and the only part of VoxSwap they
ever see.

It is one self-contained file on purpose. Open it from disk, serve it from
anything, or hand it to a customer as an attachment — there is no build step and
no server to run.

## Sending it to a customer

Nobody should have to type an order number, so the page never asks for one.
Put it in the link instead and the customer never sees it:

```
https://pabsamuel.github.io/boxdrank/voxswap/booth.html?order=ORD-123
```

Without one the page makes its own — `VS-260926-K7QM`, date plus four
characters chosen to survive being read aloud or copied off a screen (no 0/O,
1/I/L) — and shows it once, on the last screen, as the reference to quote.

## What it does

Eleven screens, one line each. After every take it decodes the audio and
measures it, then says what to change in plain words rather than reporting a
number: clipping, room noise, level, duration, how much of the take is actually
speech. The thresholds are the ones the pipeline itself enforces —
`MIN_PHRASE_SECONDS`, `MIN_SAMPLE_SECONDS` and `GOOD_SAMPLE_SECONDS` from
`voxswap/consent.py` — so a pack it accepts is a pack `voxswap validate` accepts.

The consent phrase is rendered from the same template as `consent.PHRASE_TEMPLATE`,
naming the person, today's date and the order.

It ends with a `.zip` laid out the way an order folder is:

```
consent/C-1-phrase.wav      spoken permission
consent/C-1-signed.md       the declaration they typed and read
voices/<voice_id>/*.wav     PCM WAV, mono, 48 kHz, 16-bit
intake.json                 the voice and consent blocks, ready to paste into order.json
README.txt                  what the operator does next, and every take's measurements
```

## Two things the browser decides, not us

**The microphone needs a top-level page.** Embedded in another site's frame, the
browser refuses `getUserMedia` outright and never shows a permission prompt — so
the page probes on the first screen and says which of those happened. Every
screen also takes an uploaded file, which is the route that always works: a
phone's own voice recorder usually beats a browser capture anyway.

**Downloads differ by host.** Opened from disk or a normal web server the page
saves the zip itself. Inside a Claude artifact viewer it cannot, and asks the
platform to save on its behalf. `HOSTED` picks the branch.

## Recording quality

Browser DSP is tuned for phone calls and hurts a clone, so the capture disables
echo cancellation, noise suppression and — most importantly — automatic gain
control, which otherwise rides the level between takes and makes the reference
inconsistent.
