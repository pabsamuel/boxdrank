# Start here

You are not required to be a programmer to run this. You are required to be
organised for about twenty minutes per order. This page is the whole business.

---

## 1. What you are selling

Someone sends you recordings of their voice. You send back a folder of audio
files that makes them the main character of a game they own, or the lead of a
film they own. Optionally in a different language than the original.

They drop the folder into their game, and hear themselves.

That is it. You are a small dubbing studio where the actor is the customer.

## 2. What the software does for you

Everything between "recordings arrive" and "ZIP is ready":

1. checks the consent paperwork is real and refuses to start without it
2. finds which audio files belong to the character being replaced
3. reads the script, or transcribes the lines that have no script
4. translates them if the customer wants another language, keeping line lengths
5. builds a clone of the customer's voice
6. speaks every line with it
7. makes each line fit its original slot, at the original loudness, in the original format
8. checks its own work and refuses to package a bad build
9. produces a ZIP with install instructions written for that specific game

You decide what to charge, who to say yes to, and whether the result is good
enough to send. The machine does the rest.

## 3. What you do, per order

| Step | You | Time |
| --- | --- | --- |
| 1 | Send the customer `templates/customer-intake-form.md` | 1 min |
| 2 | They send recordings, the game audio, and the signed consent form | — |
| 3 | `python3 -m voxswap new ...` then drop their files into the folder | 5 min |
| 4 | `python3 -m voxswap phrase ORD-123` → send them the sentence to record | 1 min |
| 5 | `python3 -m voxswap validate ORD-123` → fix whatever it complains about | 2 min |
| 6 | `python3 -m voxswap run ORD-123 --only plan` → check it matched the right character | 2 min |
| 7 | `python3 -m voxswap run ORD-123` → wait | 0 min |
| 8 | Listen to three or four lines. Read `qc.md`. | 5 min |
| 9 | Send the ZIP with `templates/delivery-email.md` | 2 min |

Step 7 is the only one that costs money, and steps 5 and 6 exist so you never
reach it on a broken order.

**Or skip steps 5–7 entirely:** run `python3 -m voxswap watch` and leave it
running. Any complete order folder you drop in gets picked up and built by
itself. That is the "it starts on its own" mode.

## 4. The rule that keeps you out of trouble

**Every voice needs that person's own signed consent and their own spoken
verification phrase — recorded for this order, with their name, the date and
the order ID in it.**

Not the customer's word. Not a screenshot of a chat. Theirs, directly.

The software enforces this. There is no override flag, and you should not add
one. It is also your best marketing: it is the difference between a voice studio
and the thing people are right to be afraid of.

If someone asks for a celebrity, a streamer, a voice actor, or "my ex, as a
joke" — the answer is no, and the answer is easy, because the software will not
do it either. Read [`04-CONSENT-AND-RIGHTS.md`](04-CONSENT-AND-RIGHTS.md) once,
properly, before your first paying customer.

## 5. What to do right now, in order

- [ ] Run the demo: `python3 tools/make_example.py && python3 -m voxswap run EXAMPLE-GAME`
- [ ] Open `delivery/EXAMPLE-GAME/` and look at what a customer receives
- [ ] Run `python3 -m voxswap doctor` and install ffmpeg if it says you have not
- [ ] Read [`04-CONSENT-AND-RIGHTS.md`](04-CONSENT-AND-RIGHTS.md)
- [ ] Pick your providers and put the keys in `.env` ([`05-PROVIDERS.md`](05-PROVIDERS.md))
- [ ] Do one order for yourself, with your own voice, on a game you own. End to end. Before you charge anyone.
- [ ] Decide your prices ([`09-PRICING-AND-BUSINESS.md`](09-PRICING-AND-BUSINESS.md))
- [ ] Update [`STATUS.md`](../STATUS.md) with where you got to

That last one matters more than it looks. `STATUS.md` is how you — or Claude —
pick this up again in three weeks without re-reading everything.

## 6. How to use Claude on this project

You said you find this part hard, so it is built in. The [`prompts/`](../prompts/)
folder contains ready-made prompts. You open Claude Code in this folder and
paste one. They are written so you do not have to explain the project each time.

Start every session with [`prompts/00-session-start.md`](../prompts/00-session-start.md).
When something breaks, use [`prompts/02-debug-a-failed-job.md`](../prompts/02-debug-a-failed-job.md).
When you want a new feature, use [`prompts/08-build-a-feature.md`](../prompts/08-build-a-feature.md).

The rules Claude follows in this repo are in [`CLAUDE.md`](../CLAUDE.md). You do
not need to read it; Claude does.

## 7. What this cannot do

Being honest with you here saves you from promising it to a customer:

* **It cannot open sealed game archives.** Wwise `.bnk`, FMOD `.bank`, Unreal
  `.pak`. It produces correct, ready-to-import audio and tells the customer
  exactly how to get it in — but for those titles, the last step is theirs or
  yours, with the game's own modding tools.
* **It cannot remove the original actor from a film's mix.** Films ship one
  mixed track. Your voice goes over it with the original ducked underneath.
  Close, not surgical. Games do not have this problem.
* **It cannot make a good clone from bad samples.** Thirty seconds of phone
  audio in a noisy room sounds like thirty seconds of phone audio in a noisy
  room. Ninety seconds of clean, varied speech is the real minimum.
* **It cannot fix timing that was never possible.** If a Turkish line needs 4
  seconds and the slot is 2, something has to give — it will flag the line
  rather than chop it, and you decide.
