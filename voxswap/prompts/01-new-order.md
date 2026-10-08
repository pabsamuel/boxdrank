# Set up a new order from a customer email

Use when someone has sent you their details and you want the order folder built
correctly without hand-editing JSON.

---

I have a new customer. Set up the order folder for me.

Here is what they sent me, verbatim:

```
<PASTE THE CUSTOMER'S EMAIL HERE>
```

Here is what I know about the files:

* The game/film audio is at: `<PATH, OR "they haven't sent it yet">`
* They did / did not send a script or subtitle file: `<DETAILS>`

Please:

1. Run `python3 -m voxswap new` with the right flags to create the order.
2. Fill in `order.json` properly: `target.include`/`exclude` patterns,
   `roles[]` with sensible `match` and `match_speakers`, the language pair, and
   a `voices[]`/`consents[]` entry for **every** person whose voice is involved.
   Read `docs/03-ORDER-FORMAT.md` first.
3. If the assets are already in place, run `python3 -m voxswap validate` and
   `python3 -m voxswap run <ID> --only plan`, and tell me the line count per
   role so I can sanity-check the matching.
4. Print the exact consent phrase for each person (`python3 -m voxswap phrase`)
   and draft the email I should send them, including which files I need back.

Flag anything in their message that I should refuse or push back on — a
third-party voice with no direct contact, a public figure, a title where they
cannot supply the audio themselves, or anything where the consent story is not
clean.

Do not invent details they did not give me. List what is still missing instead.

---
