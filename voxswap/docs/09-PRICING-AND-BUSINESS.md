# Pricing and the business

The software is the easy part. This page is the part that decides whether it is
a business or an expensive hobby.

I am not going to print provider prices here — they change, and a stale number
in a repo is worse than no number. **Look up the current rate once, write it in
the box below, and redo the arithmetic every few months.**

```
My voice provider costs ____ per 1,000 characters   (checked: ________)
My ASR provider costs   ____ per minute of audio    (checked: ________)
My translation costs    ____ per 1,000 lines        (checked: ________)
```

---

## The only two numbers that matter

**1. Characters of dialogue.** Voice synthesis is billed per character, and that
dominates everything else.

```
cost ≈ (characters of dialogue ÷ 1000) × your per-1k rate
```

Get the character count for free, before you promise anything:

```bash
python3 -m voxswap run ORD-123 --only plan
# then:
python3 -c "import json;d=json.load(open('work/ORD-123/lines.json'));\
print(sum(len(l['text']) for l in d['lines'] if l['status']!='skipped'), 'characters')"
```

**2. Your own 25 minutes.** Setup, paperwork chasing, checking `plan`, listening,
and the delivery email. That is roughly fixed per order regardless of size —
which is why tiny orders must not be cheap.

## Rough shapes of a job

| Job | Lines | Characters | Notes |
| --- | --- | --- | --- |
| One character in a short indie game | 150–600 | 10k–50k | The sweet spot. Cheap, fast, impressive. |
| A film | 800–1,500 | 40k–90k | One evening of machine time. Needs ffmpeg. |
| A side character in a big RPG | 1k–4k | 60k–250k | Fine, if you scope it to one character. |
| The protagonist of a big RPG | 20k–60k | 1M–4M | Do the arithmetic before you answer the email. This is where a local model stops being optional. |

## A pricing model that works

**Three tiers, not a quote per customer.** Quoting takes time you are not paid
for.

| Tier | What they get | Price it at |
| --- | --- | --- |
| **Taster** | One scene / up to ~50 lines, their own voice, same language | Your fixed-time cost + a small margin. This is your demo, and it converts. |
| **Character** | One character, one game or one film, one language | Fixed-time cost + (characters × rate × 3) |
| **Gift** | Two voices (them + someone), one title | Character tier + a second consent workflow + ~40% |

Multiply provider cost by **3×**, not 1.2×. That covers re-runs, the lines you
redo because they sounded wrong, refunds, and the fact that you will underquote
the first five orders.

Add-ons worth charging separately for:

* **Another language** — translation cost is small, but the value is large.
* **Assisted install** for Wwise/FMOD titles — this is real work with the game's
  toolkit. Quote it by the hour and be honest that it is fiddly.
* **Revisions beyond the free window** — offer, say, 14 days of free single-line
  re-records. It costs you almost nothing (one line, cached job) and it is the
  best review-generating feature you have.

## Protect the margin

* **Never run a paid job without `--only plan` first.** Wrong patterns are the
  number one way to burn money.
* **Use `dry_run_limit: 5`** on any title you have not done before. Five lines,
  a real listen, then the full run.
* **Never re-run with `--force`** unless you know why. Everything else reuses
  cached takes.
* **Ask for the script file every single time.** It removes the ASR bill and
  fixes every proper noun.
* **Watch the third-party consent chase.** The order that takes three weeks
  because someone's partner will not send the form is the order that destroys
  your hourly rate. Set a deadline: "if I do not have it in 7 days I will refund
  and close the order."

## When to go local

Switch the voice provider to `local` when either is true:

* a single order's synthesis cost exceeds what a second-hand GPU costs, or
* customers start asking where their voice is being sent.

The second one arrives sooner than you expect, and "it never leaves my machine"
is a genuinely strong selling point for exactly this product.

## What to say on your own site

Lead with the consent story, not the technology. Everyone can list an API; not
everyone can say:

> Every voice we clone is backed by that person's own signed consent and a
> recording of them agreeing, made for that specific order. Anyone can have
> their voice deleted from our systems with one email, and we will show them
> everything we generated with it.

Then say plainly what you will not do — celebrities, voice actors, surprises,
anything sexual. A visible refusal list is a trust signal, not a limitation.

## Do this before your first paying customer

- [ ] One complete order for yourself, on a game you own, with your own voice
- [ ] Your three tiers written down, with real numbers you did the arithmetic for
- [ ] Terms that say: personal use, own copy, no redistribution, retention
      period, revision window, refund policy
- [ ] The consent form, filled in with your business name and email
- [ ] A retention period you can actually honour
- [ ] An hour with a lawyer in your country, once money is involved
