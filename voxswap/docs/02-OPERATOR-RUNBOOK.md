# Operator runbook

What you do, in order, when a customer appears. Keep this open for your first
ten orders; after that you will not need it.

---

## A. A customer emails you

**Send them `templates/customer-intake-form.md`.** Do not start a folder yet.
Half of enquiries stop here, and a folder you never use is clutter.

What you need back before you do anything:

- who they are, and who else's voice is involved
- exact title, platform and edition
- which character(s)
- which language
- how they will send the game/film audio

## B. Create the order

```bash
python3 -m voxswap new \
  --customer "Ada Lovelace" \
  --email "ada@example.com" \
  --title "Cyberpunk 2077" \
  --kind game \
  --adapter generic \
  --target-language tr
```

This prints the order ID and creates:

```
orders/ORD-.../
    order.json      the job description — you will edit this
    assets/         their game or film audio goes here
    voices/         their recordings go here
    consent/        the signed form and the phrase recording go here
```

## C. Get consent properly

```bash
python3 -m voxswap phrase ORD-...
```

Send each person:

1. the printed sentence, to **record and send back as a WAV**
2. `templates/consent-form.md`, filled in, to **sign and send back**

Save them exactly where the command tells you. If the voice belongs to someone
other than the customer, the form and recording come **from that person, to
you** — not forwarded by the customer, and using their own email address. The
software rejects a third-party consent that reuses the customer's address.

**Do not start the job on a promise that the form is coming.** The whole
business model is that you can prove consent for every voice you have ever
cloned.

## D. Fill in the order

Open `orders/ORD-.../order.json`. The fields that matter most:

| Field | What to put |
| --- | --- |
| `target.include` | Which files are dialogue, e.g. `["vo/**/*.wav"]` — not music, not SFX |
| `target.exclude` | Anything the include accidentally caught |
| `target.script_file` | The `.srt` / `.csv` if they sent one. Big quality and cost win. |
| `roles[].match` | Path patterns for the character's clips |
| `roles[].match_speakers` | Speaker names as written in the script |
| `language.target` | The language to dub into |

Full field reference: [`03-ORDER-FORMAT.md`](03-ORDER-FORMAT.md).

## E. Check before you spend

```bash
python3 -m voxswap validate ORD-...        # paperwork + files. Free.
python3 -m voxswap run ORD-... --only plan # which lines would be replaced. Free.
```

`plan` prints a line count per role. **Sanity-check that number.**

* 4,000 lines for a side character → your patterns are too loose
* 3 lines for a protagonist → too tight
* 0 → it fails and tells you to check `work/<order>/assets.json`

On a title you have never done before, also do a cheap smoke test first: set
`options.dry_run_limit` to `5`, run the whole thing, listen. Then set it back to
`0` and run for real.

## F. Run it

```bash
python3 -m voxswap run ORD-...
```

Or leave `python3 -m voxswap watch` running and it happens by itself whenever a
complete order appears.

Long jobs: the run is resumable, so Ctrl+C is safe. `python3 -m voxswap status ORD-...`
tells you where it is.

## G. Check the result — this is your job, not the machine's

1. Open `work/<order>/report/qc.md`. Look at the pass rate and the timing findings.
2. **Listen to at least four lines**: the first one, a long one, a shouted one,
   and one of whatever QC flagged.
3. Open `delivery/<order>/script.csv` and skim the spoken text, especially for a
   translated order. This is where a wrong name or a mistranslation shows up.

If something is wrong, [`07-QUALITY-BAR.md`](07-QUALITY-BAR.md) tells you which
knob to turn. Most fixes are free re-runs: `--from master`.

## H. Deliver

Send the ZIP with `templates/delivery-email.md`. Mention the QC pass rate if it
was not 100%, and name any line you know is imperfect — before they find it.

## I. Afterwards

```bash
python3 -m voxswap purge ORD-...          # when they ask, or on your retention schedule
python3 -m voxswap purge ORD-... --samples # also deletes their original recordings
```

Decide a retention period now and put it in your consent form. "Deleted 90 days
after delivery unless you ask us to keep it" is a good default: long enough for
revisions, short enough to be a real promise.

---

## Fixed-price time budget

Per order, once you are practised:

| | |
| --- | --- |
| Setup + paperwork chase | 10–15 min |
| Checking `plan` output | 2–5 min |
| Machine time (you are not present) | 20 min – 6 hours |
| Listening + QC | 5–10 min |
| Delivery email | 2 min |

**~25 minutes of your attention per order.** Price accordingly — see
[`09-PRICING-AND-BUSINESS.md`](09-PRICING-AND-BUSINESS.md).

## When you should say no

* Any voice whose owner will not sign and record the phrase themselves.
* Public figures, streamers, professional voice actors — no matter who asks.
* "It's a surprise for them" — a surprise cannot consent.
* Anything sexual, harassing, or built to make someone appear to say something
  they did not agree to.
* A title where the customer cannot get you the audio and you would have to rip
  it for them.

Saying no takes one sentence: *"Every voice needs its owner's own signed
consent and a short verification recording — I can't start without it."*
